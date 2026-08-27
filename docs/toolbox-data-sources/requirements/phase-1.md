# Phase 1 需求：开关、发现与可观测性

目标：提供默认关闭的总开关和本地 toolbox 发现能力，开关开启但 adapter 尚未接入时仍保持原 DSA 路由。

范围：`ENABLE_TOOLBOX_DATA_SOURCES`、设置页、`.env.example`、路径诊断与 provider trace。缺失、失效或不可读软链接必须 fail-open。
