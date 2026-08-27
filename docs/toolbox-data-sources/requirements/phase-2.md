# Phase 2 需求：行情与 K 线优先路由

目标：开启开关后，A 股实时行情、指数、ETF、日/周/月/分钟 K 线优先使用 a-stock-data；美股、港股相同核心能力优先使用 global-stock-data。

非目标：日股、韩股、台股、账户行情、五档盘口和逐笔成交不强制替代。原 provider 必须保留为 fallback。
