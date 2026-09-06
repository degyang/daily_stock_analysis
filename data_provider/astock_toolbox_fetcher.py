"""A-share quote adapter derived from the locally linked a-stock-data toolbox.

The upstream toolbox is a Skill document, not an importable Python package.  This
adapter keeps a small, tested implementation of its Tencent quote contract in
DSA, so runtime behaviour never depends on parsing Markdown.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
import requests

from .base import DataFetchError, is_bse_code, normalize_stock_code
from .realtime_types import ChipDistribution, RealtimeSource, UnifiedRealtimeQuote, safe_float
from .tencent_fetcher import TencentFetcher


class AStockToolboxFetcher(TencentFetcher):
    """Fetch A-share realtime quotes using the a-stock-data Tencent contract."""

    name = "AStockToolboxFetcher"
    priority = -10
    _ENDPOINT = "https://qt.gtimg.cn/q="
    _TIMEOUT_SECONDS = 10

    def __init__(self) -> None:
        # TencentFetcher reads its normal fallback priority from the environment.
        # The toolbox adapter is intentionally the opt-in primary route instead.
        self.priority = -10

    def get_realtime_quote(self, stock_code: str) -> Optional[UnifiedRealtimeQuote]:
        symbol = self._symbol(stock_code)
        if not symbol:
            return None
        response = requests.get(
            f"{self._ENDPOINT}{symbol}",
            headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.qq.com"},
            timeout=self._TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        response.encoding = "gbk"
        text = response.text
        start, end = text.find('"'), text.rfind('"')
        if start < 0 or end <= start:
            return None
        values = text[start + 1:end].split("~")
        if len(values) < 53:
            return None
        price = safe_float(values[3])
        if price is None or price <= 0:
            return None
        code = normalize_stock_code(stock_code)
        amount_wan = safe_float(values[37])
        quote = UnifiedRealtimeQuote(
            code=code,
            name=values[1].strip(),
            source=RealtimeSource.ASTOCK_TOOLBOX,
            price=price,
            pre_close=safe_float(values[4]),
            open_price=safe_float(values[5]),
            change_amount=safe_float(values[31]),
            change_pct=safe_float(values[32]),
            high=safe_float(values[33]),
            low=safe_float(values[34]),
            amount=amount_wan * 10000 if amount_wan is not None else None,
            turnover_rate=safe_float(values[38]),
            pe_ratio=safe_float(values[39]),
            amplitude=safe_float(values[43]),
            circ_mv=(safe_float(values[44]) or 0) * 100000000 or None,
            total_mv=(safe_float(values[45]) or 0) * 100000000 or None,
            pb_ratio=safe_float(values[46]),
            volume_ratio=safe_float(values[49]),
            market="cn",
            currency="CNY",
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )
        quote.is_stale = bool(amount_wan == 0 and quote.price == quote.pre_close)
        return quote

    def get_company_info(self, stock_code: str) -> dict:
        """Return the a-stock-data Eastmoney company-info contract."""
        code = normalize_stock_code(stock_code)
        symbol = self._symbol(stock_code)
        if not code or not symbol:
            return {}
        market = 1 if symbol.startswith("sh") else 0
        response = requests.get(
            "https://push2.eastmoney.com/api/qt/stock/get",
            params={
                "fltt": "2", "invt": "2", "fields": "f57,f58,f84,f85,f127,f116,f117,f189,f43",
                "secid": f"{market}.{code}",
            },
            headers={"User-Agent": "Mozilla/5.0"}, timeout=self._TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = (response.json() or {}).get("data") or {}
        return {
            "code": data.get("f57") or code, "name": data.get("f58") or "",
            "industry": data.get("f127") or "", "total_shares": safe_float(data.get("f84")),
            "float_shares": safe_float(data.get("f85")), "mcap": safe_float(data.get("f116")),
            "float_mcap": safe_float(data.get("f117")), "list_date": str(data.get("f189") or ""),
            "price": safe_float(data.get("f43")),
        }

    def get_chip_distribution(self, stock_code: str) -> Optional[ChipDistribution]:
        """Derive A-share chip metrics from forward-adjusted daily bars.

        a-stock-data intentionally computes CYQ locally because Eastmoney has no
        public chip-distribution endpoint.  Keep that algorithm in this adapter
        rather than parsing the toolbox Markdown at runtime, and let the manager
        continue to fall back to existing providers when its inputs are missing.
        """
        code = normalize_stock_code(stock_code)
        if not code.isdigit() or len(code) != 6 or is_bse_code(code):
            return None

        history = self._fetch_chip_history(code)
        if history.empty:
            return None
        metrics = self._calculate_chip_distribution(history)
        cost_90_low, cost_90_high = metrics["cost_90"]
        cost_70_low, cost_70_high = metrics["cost_70"]
        return ChipDistribution(
            code=code,
            date=str(metrics["date"]),
            source="a_stock_toolbox_local_cyq",
            profit_ratio=metrics["profit_ratio"],
            avg_cost=metrics["avg_cost"],
            cost_90_low=cost_90_low,
            cost_90_high=cost_90_high,
            concentration_90=metrics["concentration_90"],
            cost_70_low=cost_70_low,
            cost_70_high=cost_70_high,
            concentration_70=metrics["concentration_70"],
        )

    @staticmethod
    def _fetch_chip_history(stock_code: str) -> pd.DataFrame:
        """Fetch the a-stock-data CYQ input contract from the existing Baostock dependency."""
        from .baostock_fetcher import BaostockFetcher

        fetcher = BaostockFetcher()
        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=365)
        with fetcher._baostock_session() as bs:
            result = bs.query_history_k_data_plus(
                code=fetcher._convert_stock_code(stock_code),
                fields="date,high,low,close,turn,tradestatus",
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat(),
                frequency="d",
                adjustflag="2",
            )
            if result.error_code != "0":
                raise DataFetchError(f"Baostock 筹码输入查询失败: {result.error_msg}")
            rows = []
            while result.next():
                rows.append(result.get_row_data())

        if not rows:
            return pd.DataFrame(columns=["date", "high", "low", "close", "turn"])
        history = pd.DataFrame(rows, columns=result.fields)
        if "tradestatus" in history.columns:
            history = history[history["tradestatus"] == "1"]
        return history

    @staticmethod
    def _calculate_chip_distribution(history: pd.DataFrame, grid_size: int = 300) -> dict:
        """Implement the a-stock-data CYQ decay model using OHLC and turnover."""
        required_columns = {"date", "high", "low", "close", "turn"}
        missing_columns = required_columns - set(history.columns)
        if missing_columns:
            raise ValueError(f"筹码输入缺少字段: {sorted(missing_columns)}")

        data = history.copy()
        for column in ("high", "low", "close", "turn"):
            data[column] = pd.to_numeric(data[column], errors="coerce")
        data = data.dropna(subset=["date", "high", "low", "close", "turn"])
        data = data[data["high"] > 0].sort_values("date").reset_index(drop=True)
        if data.empty:
            raise ValueError("筹码输入没有有效交易日")

        low, high = float(data["low"].min()), float(data["high"].max())
        padding = (high - low) * 0.02 or max(low * 0.02, 0.01)
        grid = np.linspace(low - padding, high + padding, grid_size)
        chips: Optional[np.ndarray] = None

        for row in data.itertuples(index=False):
            turnover = min(max(float(row.turn) / 100.0, 0.0), 1.0)
            weights = AStockToolboxFetcher._triangular_weights(
                grid, float(row.low), float(row.high),
                (float(row.high) + float(row.low) + float(row.close)) / 3.0,
            )
            if weights.sum() <= 0:
                continue
            chips = weights.copy() if chips is None else chips * (1.0 - turnover) + weights * turnover

        if chips is None or chips.sum() <= 0:
            raise ValueError("无法构建有效筹码分布")
        chips /= chips.sum()
        cumulative = np.cumsum(chips)

        def price_at(quantile: float) -> float:
            return float(np.interp(quantile, cumulative, grid))

        cost_90_low, cost_70_low, cost_70_high, cost_90_high = (
            price_at(quantile) for quantile in (0.05, 0.15, 0.85, 0.95)
        )
        return {
            "date": data["date"].iloc[-1],
            "profit_ratio": float(chips[grid <= float(data["close"].iloc[-1])].sum()),
            "avg_cost": float((grid * chips).sum()),
            "cost_90": (cost_90_low, cost_90_high),
            "cost_70": (cost_70_low, cost_70_high),
            "concentration_90": float((cost_90_high - cost_90_low) / (cost_90_high + cost_90_low)),
            "concentration_70": float((cost_70_high - cost_70_low) / (cost_70_high + cost_70_low)),
        }

    @staticmethod
    def _triangular_weights(grid: np.ndarray, low: float, high: float, average: float) -> np.ndarray:
        """Return normalized price-grid weights for one trading day."""
        weights = np.zeros_like(grid)
        if not np.isfinite([low, high, average]).all() or high < low:
            return weights
        if high - low < 1e-9:
            weights[np.argmin(np.abs(grid - low))] = 1.0
            return weights
        average = min(max(average, low), high)
        left = (grid >= low) & (grid <= average)
        right = (grid > average) & (grid <= high)
        weights[left] = (grid[left] - low) / (average - low) if average - low > 1e-9 else 1.0
        weights[right] = (high - grid[right]) / (high - average) if high - average > 1e-9 else 1.0
        total = weights.sum()
        if total > 0:
            return weights / total
        weights[np.argmin(np.abs(grid - average))] = 1.0
        return weights

    @staticmethod
    def _symbol(stock_code: str) -> str:
        raw = (stock_code or "").strip().lower()
        code = normalize_stock_code(stock_code)
        if not code or not code.isdigit() or len(code) != 6:
            return ""
        if raw.startswith(("sh", "sz", "bj")):
            return raw[:2] + code
        if is_bse_code(code):
            return f"bj{code}"
        return f"sh{code}" if code.startswith(("5", "6", "9")) else f"sz{code}"
