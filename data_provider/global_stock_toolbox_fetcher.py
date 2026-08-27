"""US/HK quote and daily-bar adapter derived from global-stock-data.

The linked upstream project distributes its implementations in a Skill document.
This module retains a small direct Yahoo chart implementation in DSA rather than
loading Markdown at runtime.  It is deliberately limited to the Phase 2 market
data contract; richer global capabilities are added by later adapters.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import pandas as pd
import requests

from .base import BaseFetcher, DataFetchError, STANDARD_COLUMNS
from .realtime_types import RealtimeSource, UnifiedRealtimeQuote, safe_float


class GlobalStockToolboxFetcher(BaseFetcher):
    """Fetch US and Hong Kong quote/K-line data from Yahoo's chart endpoint."""

    name = "GlobalStockToolboxFetcher"
    priority = -9
    _CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    _TIMEOUT_SECONDS = 12

    def _fetch_raw_data(self, stock_code: str, start_date: str, end_date: str) -> pd.DataFrame:
        symbol = self._symbol(stock_code)
        if not symbol:
            raise DataFetchError(f"GlobalStockToolboxFetcher unsupported code: {stock_code}")
        start = int(datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc).timestamp())
        end = int(datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc).timestamp()) + 86400
        payload = self._request_chart(symbol, {"period1": start, "period2": end, "interval": "1d"})
        result = self._result(payload)
        timestamps = result.get("timestamp") or []
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        rows = []
        for index, timestamp in enumerate(timestamps):
            values = {key: (quote.get(key) or [None] * len(timestamps))[index] for key in ("open", "high", "low", "close", "volume")}
            if any(values[key] is None for key in ("open", "high", "low", "close")):
                continue
            rows.append({
                "date": datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%d"),
                **values,
                "amount": None,
            })
        return pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume", "amount"])

    def _normalize_data(self, df: pd.DataFrame, stock_code: str) -> pd.DataFrame:
        if df.empty:
            return pd.DataFrame(columns=STANDARD_COLUMNS)
        normalized = df.copy()
        for column in ("open", "high", "low", "close", "volume", "amount"):
            normalized[column] = pd.to_numeric(normalized[column], errors="coerce")
        normalized["pct_chg"] = normalized["close"].pct_change().fillna(0.0) * 100
        return normalized[STANDARD_COLUMNS]

    def get_realtime_quote(self, stock_code: str) -> Optional[UnifiedRealtimeQuote]:
        symbol = self._symbol(stock_code)
        if not symbol:
            return None
        result = self._result(self._request_chart(symbol, {"range": "5d", "interval": "1m"}))
        meta = result.get("meta") or {}
        price = safe_float(meta.get("regularMarketPrice"))
        if price is None or price <= 0:
            return None
        market = "hk" if symbol.endswith(".HK") else "us"
        return UnifiedRealtimeQuote(
            code=stock_code.strip().upper(),
            name=str(meta.get("longName") or meta.get("shortName") or stock_code).strip(),
            source=RealtimeSource.GLOBAL_STOCK_TOOLBOX,
            price=price,
            pre_close=safe_float(meta.get("previousClose") or meta.get("chartPreviousClose")),
            open_price=safe_float(meta.get("regularMarketOpen")),
            high=safe_float(meta.get("regularMarketDayHigh")),
            low=safe_float(meta.get("regularMarketDayLow")),
            volume=int(safe_float(meta.get("regularMarketVolume"), 0) or 0),
            currency=str(meta.get("currency") or "").upper() or None,
            market=market,
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )

    @classmethod
    def _symbol(cls, stock_code: str) -> str:
        code = (stock_code or "").strip().upper()
        if code.startswith("HK") and code[2:].isdigit():
            return f"{str(int(code[2:])).zfill(4)}.HK"
        if code.isdigit() and len(code) in (4, 5):
            return f"{code.zfill(4)}.HK"
        if code.replace(".", "").isalpha() and 1 <= len(code) <= 6:
            return code
        return ""

    def _request_chart(self, symbol: str, params: dict) -> dict:
        response = requests.get(
            self._CHART_URL.format(symbol=symbol),
            params=params,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=self._TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _result(payload: dict) -> dict:
        result = ((payload.get("chart") or {}).get("result") or [None])[0]
        if not isinstance(result, dict):
            raise DataFetchError("global-stock-data returned no chart result")
        return result
