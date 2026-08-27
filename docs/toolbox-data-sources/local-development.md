# 本地开发与依赖

本集成仅面向本机开发。两个 toolbox 仓库独立维护，通过软链接暴露给 DSA；链接本身不纳入 DSA Git。

## 推荐目录

```text
Projects/daily_stock_analysis/
  third_party/
    a-stock-data       -> ~/Developments/finances/a-stock-data
    global-stock-data  -> ~/Developments/finances/global-stock-data
  .venv/
```

`third_party/` 已被 `.gitignore` 忽略。新的开发者需要自行建立链接，DSA 不保存任何机器绝对路径。

## 虚拟环境边界

只使用 DSA 根目录的 `.venv`：

```bash
cd ~/Projects/daily_stock_analysis
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
```

软链接不会共享或激活 toolbox 自己的虚拟环境。适配层所需依赖必须由 DSA `requirements.txt` 管理：

- `requests`、`baostock` 已是 DSA 依赖；
- 接入 `a-stock-data` 的通达信 K 线、盘口或逐笔成交时，需要在 DSA 中显式新增并锁定 `mootdx`；
- `global-stock-data` 的直接 HTTP 路径通常只需要现有 `requests`。

新增依赖后必须执行 `pip check`，并在 PR 中记录版本与对应能力。

## 启动前检查

实现适配器前，先验证两个链接可解析，但不把链接路径写进源代码：

```bash
test -e third_party/a-stock-data
test -e third_party/global-stock-data
.venv/bin/python -m pip check
```

运行时应从 DSA 项目根目录动态推导 `third_party/`，缺失时返回可读的 provider-unavailable 诊断并继续旧源 fallback。

## 更新方式

在各自的 Developments 仓库中拉取上游更新；DSA 只需重新运行契约测试。不得把未审查的上游变更直接视为生产可用：上游字段、限流或返回语义变化时，应先通过本专题的测试矩阵。
