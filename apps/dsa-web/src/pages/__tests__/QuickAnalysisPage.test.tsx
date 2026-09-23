import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import QuickAnalysisPage from '../QuickAnalysisPage';

const getModeSelections = vi.fn();
const quickTechnical = vi.fn();
const toggleWatchlist = vi.fn();
const isInWatchlist = vi.fn();
let watchlistCodes: string[] = [];

vi.mock('../../api/stocks', () => ({
  stocksApi: {
    getModeSelections: (...args: unknown[]) => getModeSelections(...args),
    parseImport: vi.fn(),
  },
}));

vi.mock('../../api/analysis', () => ({
  analysisApi: { quickTechnical: (...args: unknown[]) => quickTechnical(...args) },
}));

vi.mock('../../api/systemConfig', () => ({
  systemConfigApi: { removeFromWatchlist: vi.fn() },
}));

vi.mock('../../hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    watchlistCodes,
    isInWatchlist,
    isActioning: false,
    actionMessage: null,
    refresh: vi.fn(),
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
    toggleWatchlist,
  }),
}));

describe('QuickAnalysisPage mode selections', () => {
  beforeEach(() => {
    localStorage.clear();
    watchlistCodes = [];
    getModeSelections.mockReset();
    quickTechnical.mockReset();
    toggleWatchlist.mockReset();
    isInWatchlist.mockReset();
    isInWatchlist.mockReturnValue(false);
    getModeSelections.mockResolvedValue({
      date: '2026-09-06',
      availableDates: ['2026-09-06'],
      strategies: [
        { key: 'TurtleTradeStrategy', name: '海龟突破', description: '20日新高', codes: ['600519', '000001'] },
        { key: 'MaVolumeStrategy', name: '均线放量', description: '均线突破', codes: [] },
        { key: 'HighTightFlagStrategy', name: '高窄旗形', description: '旗形突破', codes: [] },
        { key: 'LimitUpShakeoutStrategy', name: '涨停洗盘', description: '回踩确认', codes: [] },
        { key: 'UptrendLimitDownStrategy', name: '上升跌停', description: '跌停反包', codes: [] },
        { key: 'RpsBreakoutStrategy', name: 'RPS 突破', description: '相对强度', codes: [] },
        { key: 'PrivatePlacementStrategy', name: '定增公告', description: '定增公告', codes: [] },
      ],
    });
    quickTechnical.mockResolvedValue({
      errors: [],
      results: [{
        code: '600519', name: '贵州茅台', currentPrice: 1500, changePct: 1.2,
        signalScore: 72, buySignal: '关注', trendStatus: '偏强', dataSource: 'test',
        biasMa5: 1, volumeRatio5d: 1.1, ma5: 1490, ma10: 1480, ma20: 1470,
        ma60: 1400, maAlignment: '多头', macdSignal: '金叉', rsiSignal: '中性', riskFactors: [],
      }],
    });
  });

  it('loads seven strategy tabs and refreshes the active strategy like the watchlist', async () => {
    render(<QuickAnalysisPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '模式选股' })[0]);

    expect(await screen.findByDisplayValue('2026-09-06')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '定增公告(0)' })).toBeInTheDocument();
    expect(screen.getByText('600519')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加到自选股 600519' }));
    expect(toggleWatchlist).toHaveBeenCalledWith('600519');

    fireEvent.click(screen.getByRole('button', { name: '全部刷新' }));

    await waitFor(() => expect(quickTechnical).toHaveBeenCalledWith('600519'));
    expect(quickTechnical).toHaveBeenCalledWith('000001');
    expect(quickTechnical).not.toHaveBeenCalledWith('600519,000001');
    expect(await screen.findByText('贵州茅台')).toBeInTheDocument();
  });

  it('shows a minus action for a code already in the watchlist', async () => {
    isInWatchlist.mockReturnValue(true);
    render(<QuickAnalysisPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '模式选股' })[0]);

    fireEvent.click(await screen.findByRole('button', { name: '从自选股移除 600519' }));

    expect(toggleWatchlist).toHaveBeenCalledWith('600519');
  });

  it('persists refreshed mode results across leaving and reopening the page', async () => {
    const first = render(<QuickAnalysisPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '模式选股' })[0]);
    fireEvent.click((await screen.findAllByRole('button', { name: '刷新' }))[0]);
    expect(await screen.findByText('贵州茅台')).toBeInTheDocument();
    first.unmount();

    render(<QuickAnalysisPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '模式选股' })[0]);

    expect(await screen.findByText('贵州茅台')).toBeInTheDocument();
    expect(quickTechnical).toHaveBeenCalledTimes(1);
  });

  it('refreshes a watchlist incrementally instead of sending one long batch request', async () => {
    watchlistCodes = ['600519', '000001'];
    render(<QuickAnalysisPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '自选股' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '全部刷新' }));

    await waitFor(() => expect(quickTechnical).toHaveBeenCalledWith('600519'));
    expect(quickTechnical).toHaveBeenCalledWith('000001');
    expect(quickTechnical).not.toHaveBeenCalledWith('600519,000001');
    expect(localStorage.getItem('dsa.quick-analysis.watchlist-results.v1')).toContain('600519');
  });
});
