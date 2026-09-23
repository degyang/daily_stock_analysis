"""Read date-partitioned strategy selections exported by Sequoia-X."""

from __future__ import annotations

import csv
import os
import re
from pathlib import Path
from typing import Any


DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
STRATEGIES = (
    ("TurtleTradeStrategy", "海龟突破", "20日新高 + 成交额过亿 + 阳线防诱多，按涨幅排序"),
    ("MaVolumeStrategy", "均线放量", "均线与成交量共同确认突破"),
    ("HighTightFlagStrategy", "高窄旗形", "高而窄的旗形整理突破"),
    ("LimitUpShakeoutStrategy", "涨停洗盘", "涨停洗盘后的回踩确认"),
    ("UptrendLimitDownStrategy", "上升跌停", "上升趋势中的跌停反包"),
    ("RpsBreakoutStrategy", "RPS 突破", "欧奈尔 RPS 相对强度突破"),
    ("PrivatePlacementStrategy", "定增公告", "最近 7 天内发布定向增发公告的股票"),
)


class ModeSelectionError(ValueError):
    """Raised when mode-selection configuration or input is invalid."""


def _output_root() -> Path:
    configured = os.getenv("SEQUOIA_OUTPUT_DIR", "").strip()
    if not configured:
        raise ModeSelectionError("未配置 SEQUOIA_OUTPUT_DIR，无法读取模式选股结果")
    root = Path(configured).expanduser()
    if not root.is_dir():
        raise ModeSelectionError("SEQUOIA_OUTPUT_DIR 不存在或不是目录")
    return root


def list_mode_selection_dates() -> list[str]:
    root = _output_root()
    return sorted(
        (item.name for item in root.iterdir() if item.is_dir() and DATE_PATTERN.fullmatch(item.name)),
        reverse=True,
    )


def _read_symbols(path: Path) -> list[str]:
    if not path.is_file():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or "symbol" not in reader.fieldnames:
            raise ModeSelectionError(f"{path.name} 缺少 symbol 列")
        return list(dict.fromkeys(
            str(row.get("symbol") or "").strip()
            for row in reader
            if str(row.get("symbol") or "").strip()
        ))


def load_mode_selection(selection_date: str | None = None) -> dict[str, Any]:
    if selection_date is not None and not DATE_PATTERN.fullmatch(selection_date):
        raise ModeSelectionError("日期格式必须为 YYYY-MM-DD")
    root = _output_root()
    available_dates = list_mode_selection_dates()
    if not available_dates:
        raise ModeSelectionError("SEQUOIA_OUTPUT_DIR 下没有可用的 YYYY-MM-DD 结果目录")
    selection_date = selection_date or available_dates[0]
    date_dir = root / selection_date
    if selection_date not in available_dates or not date_dir.is_dir():
        raise FileNotFoundError(selection_date)
    strategies = []
    for key, name, description in STRATEGIES:
        strategies.append({
            "key": key,
            "name": name,
            "description": description,
            "codes": _read_symbols(date_dir / f"{key}.csv"),
        })
    return {"date": selection_date, "available_dates": available_dates, "strategies": strategies}
