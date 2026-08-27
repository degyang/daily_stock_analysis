# Phase 2 验收：核心市场数据

每个已覆盖市场必须验证：开关关闭不调用 adapter；toolbox 成功返回标准 schema；空结果、异常、超时和非法字段均回退；缓存不串源。

网络 smoke：沪市、深市、指数、ETF、Nasdaq、NYSE、港股主板各一例。只断言 schema、来源和时间字段，不断言易变价格。WebUI、API、CLI 使用同一结果且不需改调用方式。
