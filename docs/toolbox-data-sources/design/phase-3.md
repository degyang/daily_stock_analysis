# Phase 3 设计：能力注册与字段口径

按 capability 注册 adapter，而非全局替换 fetcher。输出保持现有 API/报告 schema，并追加 `source`、`method`、`as_of` 元数据。筹码分布、复权、财报期末和估值口径使用独立缓存键。

不得混合不同来源或不同时间点的数据补齐同一响应，除非字段级 fallback 规则明确、可追溯且经过测试。节流、User-Agent、超时和来源条款由 DSA adapter 统一执行。
