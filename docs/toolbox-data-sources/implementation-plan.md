# 实施与验证计划

本计划严格采用“一阶段一 PR”：Phase 0/#1、Phase 1/#2、Phase 2/#3、Phase 3/#4、Phase 4/#5。每个 PR 合入前必须满足对应的 `requirements/`、`design/` 与 `acceptance/` 文档；详见专题 [README](README.md#分阶段交付基线)。

## Phase 0：基线与契约清单

- 盘点 `DataFetcherManager` 的日线、实时、基本面、市场统计、板块和选股入口。
- 为每个入口定义支持市场、输出 schema、cache key、timeout、fallback 语义和最小 fixture。
- 确认 toolbox 的稳定可调用模块；若上游只提供示例代码，先在 DSA adapter 内形成受测试的最小封装，不把 Markdown 当作运行时模块。

验收：不开启开关时，现有相关测试与行为无变化。

## Phase 1：开关、发现与可观测性

状态：已实现开关、路径发现、缺失链接诊断和现有 fetcher 保持行为；adapter 接入仍待后续 Phase。

- 新增 `ENABLE_TOOLBOX_DATA_SOURCES=false` 配置、注册表、`.env.example` 说明和设置页帮助。
- 新增路径发现器：从 DSA 根目录定位 `third_party/a-stock-data` 与 `third_party/global-stock-data`，不写死绝对路径。
- 缺失链接、不可读版本或缺依赖时记录 provider-unavailable，并明确进入旧源 fallback。
- provider trace 增加 toolbox 名称、版本/commit（可获取时）、能力、来源与 fallback 原因。

验收：配置默认关闭；打开但链接缺失时，仍能完成旧源链路，且诊断可解释。

## Phase 2：行情与 K 线

- A 股：实时行情、指数、日线与分钟 K 线 adapter。
- 美股/港股：实时行情、日线/分钟 K 线 adapter。
- 接入既有 `UnifiedRealtimeQuote`、标准 OHLCV DataFrame、熔断和缓存。

验收：每个市场至少覆盖 toolbox 成功、toolbox 空结果回退、toolbox 异常回退、开关关闭四条路径。

## Phase 3：基本面与市场能力

- 依次接入基本面、财报、新闻、公告、研报、行业/概念、资金流及市场统计。
- 按能力逐项发布；不因 toolbox 存在而假设全部接口都已替代。
- 对筹码分布、复权、财报期末与实时性建立字段级元数据和缓存隔离。

验收：schema 兼容、报告渲染不变、来源在 diagnostics 中可追溯。

## Phase 4：回归与真实网络验证

确定性测试：

- `python -m py_compile` 覆盖新增模块；
- 开关默认值、解析和热重载测试；
- adapter fixture、schema 归一化、fallback、熔断、缓存键隔离测试；
- 受影响的 `DataFetcherManager`、pipeline、API/服务测试。

在线 smoke（明确标记 network）：

- A 股：一只沪市股票、一只深市股票、一个指数、一个 ETF；
- 美股：一只 Nasdaq、一只 NYSE；
- 港股：一只主板股票；
- 对每类记录实际来源、请求时间、响应字段和 fallback 情况；
- 不在自动化测试中断言易变价格，只断言 schema、来源和数据有效性。

## 回滚

将 `ENABLE_TOOLBOX_DATA_SOURCES=false` 即可立即恢复原 DSA 数据源行为。每个 Phase 独立提交，出现字段契约、上游限流或性能回退时可单独 revert，不影响既有 fetcher。
