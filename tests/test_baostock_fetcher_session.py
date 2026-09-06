from threading import Event, Thread

from data_provider.baostock_fetcher import BaostockFetcher


class _Result:
    error_code = "0"
    error_msg = ""


class _FakeBaostock:
    def __init__(self):
        self.login_calls = 0
        self.logout_calls = 0

    def login(self):
        self.login_calls += 1
        return _Result()

    def logout(self):
        self.logout_calls += 1
        return _Result()


def test_baostock_session_serializes_connections_across_fetcher_instances():
    """Baostock has a process-global socket, so separate fetchers must not overlap."""
    fake_baostock = _FakeBaostock()
    first_fetcher = BaostockFetcher()
    second_fetcher = BaostockFetcher()
    first_fetcher._bs_module = fake_baostock
    second_fetcher._bs_module = fake_baostock
    first_entered = Event()
    release_first = Event()
    second_entered = Event()

    def first_request():
        with first_fetcher._baostock_session():
            first_entered.set()
            release_first.wait(timeout=2)

    def second_request():
        with second_fetcher._baostock_session():
            second_entered.set()

    first_thread = Thread(target=first_request)
    second_thread = Thread(target=second_request)
    first_thread.start()
    assert first_entered.wait(timeout=1)
    second_thread.start()

    try:
        assert not second_entered.wait(timeout=0.1)
    finally:
        release_first.set()
        first_thread.join(timeout=2)
        second_thread.join(timeout=2)

    assert not first_thread.is_alive()
    assert not second_thread.is_alive()
    assert fake_baostock.login_calls == 2
    assert fake_baostock.logout_calls == 2
