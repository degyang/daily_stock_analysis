# Phase 1 设计：配置与本地发现

`data_provider/toolbox_paths.py` 从 DSA 根目录发现 `third_party/a-stock-data` 和 `third_party/global-stock-data`，不保存绝对路径。`DataFetcherManager` 仅在开关开启时记录可用性；不改变 fetcher 顺序和请求路由。

设置注册表与中英文帮助解释：此阶段是诊断，不是数据替代。
