from pathlib import Path

import pytest

from src.services.mode_selection_service import ModeSelectionError, STRATEGIES, load_mode_selection


def _write_outputs(root: Path, selection_date: str, *, malformed: bool = False) -> None:
    date_dir = root / selection_date
    date_dir.mkdir(parents=True)
    for index, (key, _name, _description) in enumerate(STRATEGIES):
        header = "code" if malformed and index == 0 else "symbol"
        (date_dir / f"{key}.csv").write_text(
            f"{header}\n00000{index + 1}\n00000{index + 1}\n",
            encoding="utf-8",
        )


def test_load_mode_selection_uses_latest_date_and_preserves_zeroes(tmp_path, monkeypatch) -> None:
    _write_outputs(tmp_path, "2026-09-05")
    _write_outputs(tmp_path, "2026-09-06")
    monkeypatch.setenv("SEQUOIA_OUTPUT_DIR", str(tmp_path))

    result = load_mode_selection()

    assert result["date"] == "2026-09-06"
    assert result["available_dates"] == ["2026-09-06", "2026-09-05"]
    assert len(result["strategies"]) == 7
    assert result["strategies"][0]["codes"] == ["000001"]


def test_load_mode_selection_rejects_invalid_or_missing_date(tmp_path, monkeypatch) -> None:
    _write_outputs(tmp_path, "2026-09-06")
    monkeypatch.setenv("SEQUOIA_OUTPUT_DIR", str(tmp_path))

    with pytest.raises(ModeSelectionError, match="YYYY-MM-DD"):
        load_mode_selection("../2026-09-06")
    with pytest.raises(FileNotFoundError):
        load_mode_selection("2026-09-07")


def test_load_mode_selection_rejects_csv_without_symbol_column(tmp_path, monkeypatch) -> None:
    _write_outputs(tmp_path, "2026-09-06", malformed=True)
    monkeypatch.setenv("SEQUOIA_OUTPUT_DIR", str(tmp_path))

    with pytest.raises(ModeSelectionError, match="缺少 symbol 列"):
        load_mode_selection("2026-09-06")


def test_load_mode_selection_requires_config(monkeypatch) -> None:
    monkeypatch.delenv("SEQUOIA_OUTPUT_DIR", raising=False)

    with pytest.raises(ModeSelectionError, match="未配置"):
        load_mode_selection()
