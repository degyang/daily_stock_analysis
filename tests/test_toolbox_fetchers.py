from unittest.mock import Mock, patch

from data_provider.astock_toolbox_fetcher import AStockToolboxFetcher
from data_provider.global_stock_toolbox_fetcher import GlobalStockToolboxFetcher


def test_astock_toolbox_quote_normalizes_tencent_fields():
    values = [""] * 53
    values[1], values[3], values[4], values[5] = "贵州茅台", "100.0", "99.0", "98.0"
    values[31], values[32], values[33], values[34] = "1", "1.01", "101", "97"
    values[37], values[38], values[39], values[43] = "1000", "2", "20", "4"
    values[44], values[45], values[46], values[49] = "10", "11", "3", "1.5"
    response = Mock(status_code=200, text=f'v_sh600519="{"~".join(values)}";')
    response.encoding = "gbk"
    response.raise_for_status = Mock()

    with patch("data_provider.astock_toolbox_fetcher.requests.get", return_value=response):
        quote = AStockToolboxFetcher().get_realtime_quote("600519")

    assert quote is not None
    assert quote.source.value == "a_stock_toolbox"
    assert quote.price == 100.0
    assert quote.total_mv == 1_100_000_000


def test_global_toolbox_hk_symbol_is_normalized_and_chart_rows_are_standardized():
    payload = {
        "chart": {"result": [{
            "timestamp": [1787788800, 1787875200],
            "indicators": {"quote": [{
                "open": [440.0, 441.0], "high": [445.0, 446.0],
                "low": [438.0, 439.0], "close": [443.0, 444.0], "volume": [100, 200],
            }]},
        }]},
    }
    fetcher = GlobalStockToolboxFetcher()
    with patch.object(fetcher, "_request_chart", return_value=payload) as request_chart:
        df = fetcher.get_daily_data("HK00700", "2026-08-01", "2026-08-27")

    assert request_chart.call_args.args[0] == "0700.HK"
    assert list(df.columns[:8]) == ["date", "open", "high", "low", "close", "volume", "amount", "pct_chg"]
    assert len(df) == 2
