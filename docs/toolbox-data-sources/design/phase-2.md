# Phase 2 设计：报价与 OHLCV adapter

新增 A 股和全球市场 adapter，并接入 `DataFetcherManager`、`UnifiedRealtimeQuote` 与既有 OHLCV DataFrame 契约。结果必须标明 `provider`、`as_of`、`market_status`、`is_stale` 和 `adjustment`。

toolbox 结果为空、超时、异常或 schema 无效时，记录原因后进入既有实时/日线 fallback；缓存键区分市场、周期、复权、来源和时间范围。不得把不复权通达信数据伪装为前复权数据。
