# Toolbox 数据源集成

本专题定义将本地维护的 `a-stock-data` 与 `global-stock-data` 接入 Daily Stock Analysis（DSA）的方案。目标是通过一个开关，把它们分别作为 A 股及美股/港股的数据主源；DSA 当前数据源不删除，在 toolbox 不支持、失败、返回无效数据或被熔断时自动回退。

这是设计与实施入口。实现前请阅读：

- [本地开发与依赖](local-development.md)
- [架构、路由与数据契约](architecture.md)
- [实施和验证计划](implementation-plan.md)

## 分阶段交付基线

每个阶段对应一个独立 PR，只有其需求、设计和验收文档全部满足后才进入下一阶段：

| 阶段 / PR | 需求 | 设计 | 验收 |
| --- | --- | --- | --- |
| Phase 0 / #1 | [requirements](requirements/phase-0.md) | [design](design/phase-0.md) | [acceptance](acceptance/phase-0.md) |
| Phase 1 / #2 | [requirements](requirements/phase-1.md) | [design](design/phase-1.md) | [acceptance](acceptance/phase-1.md) |
| Phase 2 / #3 | [requirements](requirements/phase-2.md) | [design](design/phase-2.md) | [acceptance](acceptance/phase-2.md) |
| Phase 3 / #4 | [requirements](requirements/phase-3.md) | [design](design/phase-3.md) | [acceptance](acceptance/phase-3.md) |
| Phase 4 / #5 | [requirements](requirements/phase-4.md) | [design](design/phase-4.md) | [acceptance](acceptance/phase-4.md) |

## 范围

| 市场或能力 | 开关开启后的首选 | 原 DSA 数据源的角色 |
| --- | --- | --- |
| A 股 | `a-stock-data` | 自动 fallback |
| 美股、港股 | `global-stock-data` | 自动 fallback |
| 日股、韩股、台股 | 现有 DSA 路由 | 不变 |
| Futu 持仓、Longbridge 账户能力、TickFlow/Tushare 授权能力 | 现有 DSA 路由 | 不变 |

## 单一开关

拟新增环境变量：

```env
ENABLE_TOOLBOX_DATA_SOURCES=false
```

- `false`（默认）：行为与当前 DSA 完全一致。
- `true`：A 股优先经 `a-stock-data`，美股/港股优先经 `global-stock-data`。旧 fetcher 只在 toolbox 无法产生符合契约的数据时才参与 fallback。

该开关不承诺强制所有请求只使用 toolbox：没有覆盖的市场、账户能力、受授权保护的能力必须沿用现有实现，避免把“不支持”误报成数据失败。

## 设计原则

1. **只修改 DSA。** 两个 toolbox 保持为独立上游项目；DSA 仅在 `data_provider/` 添加适配层。
2. **不改变业务调用面。** API、CLI、Web、通知、报告和 Agent 继续调用 `DataFetcherManager` 与已有服务接口。
3. **统一契约。** 适配层必须输出既有 `DataFrame`、`UnifiedRealtimeQuote`、fundamental context 及 provider trace 格式。
4. **失败可观察。** 每次调用记录实际来源、是否 fallback、错误类型、延迟和数据新鲜度；不得以无来源的空结果掩盖失败。
5. **数据口径显式。** 特别是筹码分布、复权 K 线和财务字段，必须携带来源与计算方法，不能与旧源静默混用。

## 非目标

- 不把两个外部项目复制或 fork 到 DSA。
- 不删除 AkShare、EFinance、Tushare、TickFlow、PyTDX、YFinance、Futu、Longbridge 等既有 fetcher。
- 不以软链接为 Python 虚拟环境边界；运行时只使用 DSA 的 `.venv`。
