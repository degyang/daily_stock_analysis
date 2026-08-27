# Phase 0 设计：能力矩阵与数据契约

设计产物为 [架构与路由](../architecture.md) 和 [实施计划](../implementation-plan.md)。业务层继续依赖 `DataFetcherManager`；未来仅在 `data_provider/` 增加 adapter。

每项能力记录市场、输入代码格式、输出 schema、时区、复权、缓存键、超时、熔断、来源字段及 fallback。日股、韩股、台股、Futu、Longbridge、TickFlow/Tushare 授权能力不纳入替换范围。
