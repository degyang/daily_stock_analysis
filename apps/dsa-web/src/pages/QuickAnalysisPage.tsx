import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, FileUp, Gauge, LoaderCircle, Minus, Plus, RefreshCw, Search, Star, TableProperties } from 'lucide-react';
import { analysisApi } from '../api/analysis';
import { stocksApi } from '../api/stocks';
import { systemConfigApi } from '../api/systemConfig';
import { useWatchlist } from '../hooks/useWatchlist';
import type { UseWatchlistReturn } from '../hooks/useWatchlist';
import type { QuickTechnicalAnalysisResponse, QuickTechnicalResult } from '../types/analysis';
import type { ModeSelectionResponse, ModeSelectionStrategy } from '../api/stocks';

function scoreClass(score: number): string {
  if (score >= 70) return 'text-purple-600 dark:text-purple-400';
  if (score >= 55) return 'text-sky-600 dark:text-sky-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
}

type QuickHistoryEntry = { id: string; createdAt: string; codes: string[]; results: QuickTechnicalResult[]; errors: string[] };
const QUICK_HISTORY_KEY = 'dsa.quick-analysis.history.v1';
const QUICK_WATCHLIST_RESULTS_KEY = 'dsa.quick-analysis.watchlist-results.v1';
const QUICK_MODE_RESULTS_KEY = 'dsa.quick-analysis.mode-results.v1';
const QUICK_REFRESH_CONCURRENCY = 5;

function loadQuickHistory(): QuickHistoryEntry[] {
  try { const parsed = JSON.parse(localStorage.getItem(QUICK_HISTORY_KEY) || '[]'); return Array.isArray(parsed) ? parsed.slice(0, 100) : []; } catch { return []; }
}

function loadWatchlistResults(): QuickTechnicalResult[] {
  try { const parsed = JSON.parse(localStorage.getItem(QUICK_WATCHLIST_RESULTS_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

type ModeResults = Record<string, QuickTechnicalResult[]>;

function modeResultKey(date: string, strategyKey: string): string {
  return `${date}:${strategyKey}`;
}

function loadModeResults(): ModeResults {
  try { const parsed = JSON.parse(localStorage.getItem(QUICK_MODE_RESULTS_KEY) || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

function saveModeResults(results: ModeResults): void {
  localStorage.setItem(QUICK_MODE_RESULTS_KEY, JSON.stringify(results));
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-secondary-text">{label}</dt><dd className="mt-1 font-medium text-foreground">{value}</dd></div>;
}

function ResultCard({
  item,
  isInWatchlist,
  isActioning,
  onAdd,
}: {
  item: QuickTechnicalResult;
  isInWatchlist: boolean;
  isActioning: boolean;
  onAdd: (code: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{item.name || item.code}</h2>
          <p className="mt-1 text-sm text-secondary-text">{item.code} · {item.dataSource}</p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <p className={`text-3xl font-bold ${scoreClass(item.signalScore)}`}>{item.signalScore}</p>
          <p className="text-xs text-secondary-text">系统评分 / 100</p>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={isInWatchlist || isActioning}
            onClick={() => onAdd(item.code)}
          >
            {isInWatchlist ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {isInWatchlist ? '已在自选' : isActioning ? '添加中' : '添加自选股'}
          </button>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground">
        {item.buySignal} · {item.trendStatus}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Metric label="现价" value={formatNumber(item.currentPrice)} />
        <Metric label="涨跌幅" value={`${formatNumber(item.changePct)}%`} />
        <Metric label="MA5 乖离" value={`${formatNumber(item.biasMa5)}%`} />
        <Metric label="量比（5日）" value={formatNumber(item.volumeRatio5d)} />
        <Metric label="MA5 / MA10" value={`${formatNumber(item.ma5)} / ${formatNumber(item.ma10)}`} />
        <Metric label="MA20 / MA60" value={`${formatNumber(item.ma20)} / ${formatNumber(item.ma60)}`} />
      </dl>
      <p className="mt-4 text-sm text-secondary-text">{item.maAlignment}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div><p className="text-xs font-medium text-secondary-text">MACD</p><p className="mt-1 text-sm text-foreground">{item.macdSignal || '-'}</p></div>
        <div><p className="text-xs font-medium text-secondary-text">RSI</p><p className="mt-1 text-sm text-foreground">{item.rsiSignal || '-'}</p></div>
      </div>
      {item.riskFactors.length > 0 && <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">风险：{item.riskFactors.join('；')}</p>}
    </article>
  );
}

function WatchlistTable({
  codes,
  results,
  loading,
  onRefresh,
  onRefreshAll,
  onRemoveAll,
  onRemove,
  error,
}: {
  codes: string[];
  results: QuickTechnicalResult[];
  loading: string | null;
  onRefresh: (code: string) => void;
  onRefreshAll: () => void;
  onRemoveAll: () => void;
  onRemove: (code: string) => void;
  error?: string;
}) {
  const byCode = new Map(results.map((item) => [item.code, item]));
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2"><Star className="h-5 w-5 text-amber-500" /><h2 className="font-semibold text-foreground">自选股</h2><span className="text-xs text-secondary-text">{codes.length} 只</span></div>
        <div className="flex gap-2"><button type="button" className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs" disabled={loading !== null || codes.length === 0} onClick={onRefreshAll}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading === '__all__' ? 'animate-spin' : ''}`} />全部刷新
        </button><button type="button" className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600" disabled={loading !== null || codes.length === 0} onClick={onRemoveAll}><Minus className="h-3.5 w-3.5" />全部删除</button></div>
      </header>
      {error && <p className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</p>}
      {codes.length === 0 ? <p className="p-8 text-center text-sm text-secondary-text">暂无自选股，请先在任选股结果中添加。</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-muted/50 text-xs text-secondary-text"><tr><th className="px-4 py-3">代码</th><th className="px-4 py-3">名称</th><th className="px-4 py-3">现价</th><th className="px-4 py-3">涨跌幅</th><th className="px-4 py-3">评分</th><th className="px-4 py-3">信号</th><th className="px-4 py-3">数据源</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-border">{codes.map((code) => { const item = byCode.get(code); const rowLoading = loading === code || loading === '__all__'; return <tr key={code} className="text-foreground"><td className="px-4 py-3 font-medium">{code}</td><td className="px-4 py-3">{item?.name || '-'}</td><td className="px-4 py-3">{formatNumber(item?.currentPrice)}</td><td className="px-4 py-3">{item?.changePct == null ? '-' : `${formatNumber(item.changePct)}%`}</td><td className={`px-4 py-3 font-semibold ${item ? scoreClass(item.signalScore) : ''}`}>{item?.signalScore ?? '-'}</td><td className="px-4 py-3">{item?.buySignal || '-'}</td><td className="px-4 py-3 text-xs text-secondary-text">{item?.dataSource || '加载中'}</td><td className="flex justify-end gap-2 px-4 py-3"><button type="button" className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" disabled={rowLoading} onClick={() => onRefresh(code)}><RefreshCw className={`h-3.5 w-3.5 ${rowLoading ? 'animate-spin' : ''}`} />刷新</button><button type="button" aria-label={`删除 ${code}`} className="btn-secondary inline-flex items-center px-2 py-1.5 text-xs text-rose-600" disabled={rowLoading} onClick={() => onRemove(code)}><Minus className="h-3.5 w-3.5" /></button></td></tr>; })}</tbody>
        </table></div>
      )}
    </section>
  );
}

function HistoryTable({ entries, onSelect }: { entries: QuickHistoryEntry[]; onSelect: (entry: QuickHistoryEntry) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><header className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">历史选股</h2><p className="mt-1 text-xs text-secondary-text">保留最近 100 次任选股分析，最新结果在上</p></header>{entries.length === 0 ? <p className="p-8 text-center text-sm text-secondary-text">暂无历史选股记录</p> : <div className="divide-y divide-border">{entries.map((entry) => <button key={entry.id} type="button" onClick={() => onSelect(entry)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/40"><span><span className="block text-sm font-medium text-foreground">{entry.codes.join('、')}</span><span className="mt-1 block text-xs text-secondary-text">{new Date(entry.createdAt).toLocaleString()} · {entry.results.length} 个结果</span></span><span className="text-xs text-primary">查看结果</span></button>)}</div>}</section>;
}

function ModeStrategyTable({
  strategy,
  results,
  loading,
  error,
  onRefresh,
  onRefreshAll,
  watchlist,
}: {
  strategy: ModeSelectionStrategy;
  results: QuickTechnicalResult[];
  loading: string | null;
  error: string;
  onRefresh: (code: string) => void;
  onRefreshAll: () => void;
  watchlist: UseWatchlistReturn;
}) {
  const byCode = new Map(results.map((item) => [item.code, item]));
  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
      <div><div className="flex items-center gap-2"><TableProperties className="h-5 w-5 text-primary" /><h2 className="font-semibold text-foreground">{strategy.name}</h2><span className="text-xs text-secondary-text">{strategy.codes.length} 只</span></div><p className="mt-1 text-xs text-secondary-text">{strategy.description}</p></div>
      <button type="button" className="btn-secondary inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs" disabled={loading !== null || strategy.codes.length === 0} onClick={onRefreshAll}><RefreshCw className={`h-3.5 w-3.5 ${loading === '__all__' ? 'animate-spin' : ''}`} />全部刷新</button>
    </header>
    {error && <p className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</p>}
    {strategy.codes.length === 0 ? <p className="p-8 text-center text-sm text-secondary-text">该策略当日没有选出股票</p> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-muted/50 text-xs text-secondary-text"><tr><th className="px-4 py-3">代码</th><th className="px-4 py-3">名称</th><th className="px-4 py-3">现价</th><th className="px-4 py-3">涨跌幅</th><th className="px-4 py-3">评分</th><th className="px-4 py-3">信号</th><th className="px-4 py-3">数据源</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-border">{strategy.codes.map((code) => { const item = byCode.get(code); const rowLoading = loading === code || loading === '__all__'; const inWatchlist = watchlist.isInWatchlist(code); return <tr key={code} className="text-foreground"><td className="px-4 py-3 font-medium">{code}</td><td className="px-4 py-3">{item?.name || '-'}</td><td className="px-4 py-3">{formatNumber(item?.currentPrice)}</td><td className="px-4 py-3">{item?.changePct == null ? '-' : `${formatNumber(item.changePct)}%`}</td><td className={`px-4 py-3 font-semibold ${item ? scoreClass(item.signalScore) : ''}`}>{item?.signalScore ?? '-'}</td><td className="px-4 py-3">{item?.buySignal || '-'}</td><td className="px-4 py-3 text-xs text-secondary-text">{item?.dataSource || '待刷新'}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" disabled={rowLoading} onClick={() => onRefresh(code)}><RefreshCw className={`h-3.5 w-3.5 ${rowLoading ? 'animate-spin' : ''}`} />刷新</button><button type="button" aria-label={inWatchlist ? `从自选股移除 ${code}` : `添加到自选股 ${code}`} title={inWatchlist ? '从自选股移除' : '添加到自选股'} className={`btn-secondary inline-flex items-center px-2 py-1.5 text-xs ${inWatchlist ? 'text-rose-600' : 'text-primary'}`} disabled={watchlist.isActioning} onClick={() => { void watchlist.toggleWatchlist(code); }}>{inWatchlist ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</button></div></td></tr>; })}</tbody></table></div>}
  </section>;
}

function ModeSelectionPanel({ watchlist }: { watchlist: UseWatchlistReturn }) {
  const [selection, setSelection] = useState<ModeSelectionResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [results, setResults] = useState<ModeResults>(loadModeResults);
  const [loading, setLoading] = useState<string | null>('__date__');
  const [error, setError] = useState('');

  const loadDate = async (date?: string) => {
    setLoading('__date__'); setError(''); setSelection(null); setActiveKey('');
    if (date) setSelectedDate(date);
    try {
      const next = await stocksApi.getModeSelections(date);
      setSelection(next); setSelectedDate(next.date); setActiveKey((current) => next.strategies.some((item) => item.key === current) ? current : (next.strategies[0]?.key || ''));
    } catch (err) { setError(err instanceof Error ? err.message : '模式选股结果加载失败'); }
    finally { setLoading(null); }
  };

  useEffect(() => { void loadDate(); }, []);
  const active = selection?.strategies.find((item) => item.key === activeKey);
  const refresh = async (codes: string[], mode: string) => {
    if (!active || !codes.length) return;
    const resultKey = modeResultKey(selectedDate, active.key);
    setLoading(mode); setError('');
    try {
      const errors: string[] = [];
      let cursor = 0;
      const refreshNext = async () => {
        while (cursor < codes.length) {
          const code = codes[cursor++];
          try {
            const response = await analysisApi.quickTechnical(code);
            errors.push(...response.errors);
            if (response.results.length) {
              setResults((current) => {
                const merged = new Map((current[resultKey] || []).map((item) => [item.code, item]));
                response.results.forEach((item) => merged.set(item.code, item));
                const next = { ...current, [resultKey]: [...merged.values()] };
                saveModeResults(next);
                return next;
              });
            }
          } catch (err) {
            errors.push(`${code}: ${err instanceof Error ? err.message : '刷新失败'}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(QUICK_REFRESH_CONCURRENCY, codes.length) }, () => refreshNext()));
      if (errors.length) setError(errors.join('；'));
    } catch (err) { setError(err instanceof Error ? err.message : '刷新模式选股失败'); }
    finally { setLoading(null); }
  };

  return <div className="space-y-4">
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-xl font-semibold text-foreground">模式选股</h1><p className="mt-1 text-sm text-secondary-text">读取 Sequoia-X 每日策略结果，刷新后展示与自选股一致的快速技术指标。</p></div><label className="text-xs text-secondary-text"><span className="mb-1 block">结果日期</span><span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4" /><input type="date" className="input pl-9" value={selectedDate} list="mode-selection-dates" disabled={loading !== null} onChange={(event) => { if (event.target.value) void loadDate(event.target.value); }} /></span></label><datalist id="mode-selection-dates">{selection?.availableDates.map((date) => <option value={date} key={date} />)}</datalist></div></section>
    {loading === '__date__' && <p className="rounded-xl border border-border bg-card p-5 text-sm text-secondary-text"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />加载模式选股结果中...</p>}
    {error && !active && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
    {watchlist.actionMessage && <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-secondary-text">{watchlist.actionMessage}</p>}
    {selection && <div className="flex gap-2 overflow-x-auto pb-1">{selection.strategies.map((strategy) => <button type="button" key={strategy.key} onClick={() => { setActiveKey(strategy.key); setError(''); }} className={`shrink-0 rounded-xl px-3 py-2 text-sm ${activeKey === strategy.key ? 'bg-primary/10 font-semibold text-primary' : 'bg-muted text-secondary-text'}`}>{strategy.name}<span className="ml-1 text-xs">({strategy.codes.length})</span></button>)}</div>}
    {active && <ModeStrategyTable strategy={active} results={results[modeResultKey(selectedDate, active.key)] || []} loading={loading} error={error} watchlist={watchlist} onRefresh={(code) => { void refresh([code], code); }} onRefreshAll={() => { void refresh(active.codes, '__all__'); }} />}
  </div>;
}

const QuickAnalysisPage: React.FC = () => {
  const [codes, setCodes] = useState('');
  const [result, setResult] = useState<QuickTechnicalAnalysisResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const watchlist = useWatchlist();
  const [section, setSection] = useState<'any' | 'watchlist' | 'history' | 'mode'>('any');
  const [watchlistResults, setWatchlistResults] = useState<QuickTechnicalResult[]>(loadWatchlistResults);
  const [watchlistLoading, setWatchlistLoading] = useState<string | null>(null);
  const [watchlistError, setWatchlistError] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const [history, setHistory] = useState<QuickHistoryEntry[]>(loadQuickHistory);

  const removeAllWatchlist = async () => {
    if (!watchlist.watchlistCodes.length) return;
    setWatchlistLoading('__delete_all__');
    try {
      for (const code of watchlist.watchlistCodes) await systemConfigApi.removeFromWatchlist(code);
      await watchlist.refresh();
      setWatchlistResults([]);
      localStorage.removeItem(QUICK_WATCHLIST_RESULTS_KEY);
    } catch (error) { setWatchlistError(error instanceof Error ? error.message : '全部删除失败'); }
    finally { setWatchlistLoading(null); }
  };

  const saveHistory = (value: QuickTechnicalAnalysisResponse, inputCodes: string) => {
    const codes = inputCodes.split(/[,，\s]+/).map((code) => code.trim()).filter(Boolean);
    const entry: QuickHistoryEntry = { id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), codes, results: value.results, errors: value.errors };
    setHistory((current) => { const next = [entry, ...current].slice(0, 100); localStorage.setItem(QUICK_HISTORY_KEY, JSON.stringify(next)); return next; });
  };

  const refreshWatchlist = async (codes: string[], mode: string) => {
    if (!codes.length) { setWatchlistResults([]); return; }
    setWatchlistLoading(mode);
    setWatchlistError('');
    try {
      const errors: string[] = [];
      let cursor = 0;
      const refreshNext = async () => {
        while (cursor < codes.length) {
          const code = codes[cursor++];
          try {
            const response = await analysisApi.quickTechnical(code);
            errors.push(...response.errors);
            if (response.results.length) {
              setWatchlistResults((current) => {
                const merged = new Map(current.map((item) => [item.code, item]));
                response.results.forEach((item) => merged.set(item.code, item));
                const next = [...merged.values()];
                localStorage.setItem(QUICK_WATCHLIST_RESULTS_KEY, JSON.stringify(next));
                return next;
              });
            }
          } catch (error) {
            errors.push(`${code}: ${error instanceof Error ? error.message : '刷新失败'}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(QUICK_REFRESH_CONCURRENCY, codes.length) }, () => refreshNext()));
      if (errors.length) setWatchlistError(errors.join('；'));
    } catch (error) {
      setWatchlistError(error instanceof Error ? error.message : '刷新自选股失败');
    } finally { setWatchlistLoading(null); }
  };

  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCsvLoading(true); setError('');
    try {
      const imported = await stocksApi.parseImport(file);
      if (!imported.codes.length) throw new Error('CSV 中未找到股票代码');
      const value = imported.codes.join(',');
      setCodes(value);
      const response = await analysisApi.quickTechnical(value); setResult(response); saveHistory(response, value);
    } catch (err) { setError(err instanceof Error ? err.message : 'CSV 导入失败'); }
    finally { setCsvLoading(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!codes.trim()) return;
    setLoading(true); setError('');
    try {
      const response = await analysisApi.quickTechnical(codes); setResult(response); saveHistory(response, codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : '快分析请求失败');
    } finally { setLoading(false); }
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-44 shrink-0 space-y-1 rounded-2xl border border-border bg-card p-3 shadow-sm md:block">
        <p className="mb-4 px-3 text-lg font-bold text-foreground">快分析</p>
        <button type="button" onClick={() => setSection('any')} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${section === 'any' ? 'bg-primary/10 font-semibold text-primary' : 'text-secondary-text hover:bg-muted'}`}><Search className="h-4 w-4" />任选股</button>
        <button type="button" onClick={() => setSection('watchlist')} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${section === 'watchlist' ? 'bg-primary/10 font-semibold text-primary' : 'text-secondary-text hover:bg-muted'}`}><Star className="h-4 w-4" />自选股</button>
        <button type="button" onClick={() => setSection('history')} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${section === 'history' ? 'bg-primary/10 font-semibold text-primary' : 'text-secondary-text hover:bg-muted'}`}><RefreshCw className="h-4 w-4" />历史选股</button>
        <button type="button" onClick={() => setSection('mode')} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${section === 'mode' ? 'bg-primary/10 font-semibold text-primary' : 'text-secondary-text hover:bg-muted'}`}><TableProperties className="h-4 w-4" />模式选股</button>
      </aside>
      <div className="min-w-0 flex-1 space-y-6">
      <div className="flex gap-2 overflow-x-auto md:hidden"><button type="button" onClick={() => setSection('any')} className={`shrink-0 rounded-xl px-3 py-2 text-sm ${section === 'any' ? 'bg-primary/10 font-semibold text-primary' : 'bg-muted text-secondary-text'}`}>任选股</button><button type="button" onClick={() => setSection('watchlist')} className={`shrink-0 rounded-xl px-3 py-2 text-sm ${section === 'watchlist' ? 'bg-primary/10 font-semibold text-primary' : 'bg-muted text-secondary-text'}`}>自选股</button><button type="button" onClick={() => setSection('history')} className={`shrink-0 rounded-xl px-3 py-2 text-sm ${section === 'history' ? 'bg-primary/10 font-semibold text-primary' : 'bg-muted text-secondary-text'}`}>历史选股</button><button type="button" onClick={() => setSection('mode')} className={`shrink-0 rounded-xl px-3 py-2 text-sm ${section === 'mode' ? 'bg-primary/10 font-semibold text-primary' : 'bg-muted text-secondary-text'}`}>模式选股</button></div>
      {section === 'watchlist' ? <WatchlistTable codes={watchlist.watchlistCodes} results={watchlistResults} loading={watchlistLoading} error={watchlistError} onRefresh={(code) => { void refreshWatchlist([code], code); }} onRemove={(code) => { void watchlist.removeFromWatchlist(code); setWatchlistResults((items) => { const next = items.filter((item) => item.code !== code); localStorage.setItem(QUICK_WATCHLIST_RESULTS_KEY, JSON.stringify(next)); return next; }); }} onRefreshAll={() => { void refreshWatchlist(watchlist.watchlistCodes, '__all__'); }} onRemoveAll={() => { void removeAllWatchlist(); }} /> : section === 'history' ? <HistoryTable entries={history} onSelect={(entry) => { setResult({ results: entry.results, errors: entry.errors }); setCodes(entry.codes.join(',')); setSection('any'); }} /> : section === 'mode' ? <ModeSelectionPanel watchlist={watchlist} /> : <>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3"><Gauge className="h-6 w-6 text-primary" /><div><h1 className="text-xl font-semibold text-foreground">快分析</h1><p className="mt-1 text-sm text-secondary-text">仅计算公式化技术评分，不调用 LLM、不进入分析队列。</p></div></div>
        <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
          <input className="input flex-1" value={codes} onChange={(event) => setCodes(event.target.value)} placeholder="输入代码：600519，000858，HK00700" aria-label="股票代码" />
          <button className="btn-primary min-w-28" type="submit" disabled={loading || csvLoading}>
            {loading ? <><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />计算中</> : <><Search className="mr-2 inline h-4 w-4" />开始分析</>}
          </button>
          <label className="btn-secondary inline-flex min-w-28 cursor-pointer items-center justify-center gap-2"><FileUp className="h-4 w-4" />{csvLoading ? '导入中' : '导入 CSV'}<input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} disabled={csvLoading} /></label>
        </form>
        <p className="mt-3 text-xs text-secondary-text">支持任意数量代码，以英文逗号、中文逗号或空格分隔；代码越多处理时间越长。</p>
      </section>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {result?.errors.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{result.errors.join('；')}</div> : null}
      <section className="grid gap-4 lg:grid-cols-2">
        {result?.results.map((item) => (
          <ResultCard
            item={item}
            key={item.code}
            isInWatchlist={watchlist.isInWatchlist(item.code)}
            isActioning={watchlist.isActioning}
            onAdd={(code) => { void watchlist.addToWatchlist(code); }}
          />
        ))}
      </section>
      </>}
      </div>
    </main>
  );
};

export default QuickAnalysisPage;
