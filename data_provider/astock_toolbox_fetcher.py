"""A-share quote adapter derived from the locally linked a-stock-data toolbox.

The upstream toolbox is a Skill document, not an importable Python package.  This
adapter keeps a small, tested implementation of its Tencent quote contract in
DSA, so runtime behaviour never depends on parsing Markdown.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import requests

from .base import is_bse_code, normalize_stock_code
from .realtime_types import RealtimeSource, UnifiedRealtimeQuote, safe_float
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
