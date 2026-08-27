# Phase 4 设计：验证证据与回滚

provider trace 汇总实际来源、延迟、数据新鲜度和 fallback 原因。覆盖率报告按能力、市场和状态统计，未替代项必须列出原因。

唯一运行时回滚为 `ENABLE_TOOLBOX_DATA_SOURCES=false`；每个阶段的 adapter 独立可 revert，不删除原 DSA provider。
