from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from data_provider.base import BaseFetcher, DataFetcherManager
from data_provider.toolbox_paths import discover_toolbox_paths


class StubFetcher(BaseFetcher):
    name = "StubFetcher"
    priority = 0

    def _fetch_raw_data(self, *args, **kwargs):
        return []

    def _normalize_data(self, raw_data):
        return raw_data


class ToolboxPathDiscoveryTestCase(unittest.TestCase):
    def test_missing_paths_are_reported_without_absolute_configuration(self) -> None:
        with TemporaryDirectory() as temp_dir:
            discovery = discover_toolbox_paths(Path(temp_dir))

        self.assertFalse(discovery.is_complete)
        self.assertEqual(discovery.available_names, ())
        self.assertEqual(
            {source.name: source.reason for source in discovery.unavailable_sources},
            {
                "a-stock-data": "path not found",
                "global-stock-data": "path not found",
            },
        )

    def test_present_toolbox_directories_are_discovered(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            third_party = root / "third_party"
            for name in ("a-stock-data", "global-stock-data"):
                (third_party / name).mkdir(parents=True)

            discovery = discover_toolbox_paths(root)

        self.assertTrue(discovery.is_complete)
        self.assertEqual(
            discovery.available_names,
            ("a-stock-data", "global-stock-data"),
        )

    def test_broken_symlink_is_distinguished_from_missing_path(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            third_party = root / "third_party"
            third_party.mkdir()
            (third_party / "a-stock-data").symlink_to(root / "does-not-exist")

            discovery = discover_toolbox_paths(root)

        sources = {source.name: source for source in discovery.sources}
        self.assertEqual(sources["a-stock-data"].reason, "broken symlink")
        self.assertEqual(sources["global-stock-data"].reason, "path not found")

    def test_missing_toolboxes_keep_existing_fetchers_active(self) -> None:
        with TemporaryDirectory() as temp_dir:
            discovery = discover_toolbox_paths(Path(temp_dir))
            with patch(
                "src.config.get_config",
                return_value=SimpleNamespace(enable_toolbox_data_sources=True),
            ), patch(
                "data_provider.toolbox_paths.discover_toolbox_paths",
                return_value=discovery,
            ):
                manager = DataFetcherManager(fetchers=[StubFetcher()])

        self.assertIs(manager.toolbox_discovery, discovery)
        self.assertEqual(
            [fetcher.name for fetcher in manager._get_fetchers_snapshot()],
            ["StubFetcher"],
        )
