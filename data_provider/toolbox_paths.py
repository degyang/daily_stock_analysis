"""Local discovery for the optional a-stock-data and global-stock-data toolboxes.

The toolboxes are separately maintained repositories linked below the DSA project
root.  This module deliberately discovers paths only: runtime adapters are added
in later phases, while existing DSA fetchers remain untouched when a link is
missing or invalid.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Tuple


_TOOLBOX_NAMES = ("a-stock-data", "global-stock-data")
_PROJECT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class ToolboxPath:
    """The discovered state of one local toolbox repository."""

    name: str
    path: Path
    available: bool
    reason: str = ""


@dataclass(frozen=True)
class ToolboxDiscovery:
    """All toolbox path states for one DSA project root."""

    project_root: Path
    sources: Tuple[ToolboxPath, ...]

    @property
    def available_names(self) -> Tuple[str, ...]:
        return tuple(source.name for source in self.sources if source.available)

    @property
    def unavailable_sources(self) -> Tuple[ToolboxPath, ...]:
        return tuple(source for source in self.sources if not source.available)

    @property
    def is_complete(self) -> bool:
        return len(self.available_names) == len(self.sources)

    def summary(self) -> str:
        available = ", ".join(self.available_names) or "none"
        unavailable = "; ".join(
            f"{source.name}: {source.reason}" for source in self.unavailable_sources
        )
        return f"available={available}; unavailable={unavailable or 'none'}"


def discover_toolbox_paths(project_root: Path | None = None) -> ToolboxDiscovery:
    """Discover local toolboxes without importing or executing their code.

    ``project_root`` is injectable for deterministic tests.  Production callers
    always derive it from this DSA source tree, so no machine-specific path is
    stored in configuration or source code.
    """

    root = (project_root or _PROJECT_ROOT).resolve()
    sources = []
    for name in _TOOLBOX_NAMES:
        path = root / "third_party" / name
        if path.is_symlink() and not path.exists():
            sources.append(ToolboxPath(name, path, False, "broken symlink"))
        elif not path.exists():
            sources.append(ToolboxPath(name, path, False, "path not found"))
        elif not path.is_dir():
            sources.append(ToolboxPath(name, path, False, "path is not a directory"))
        else:
            sources.append(ToolboxPath(name, path, True))
    return ToolboxDiscovery(project_root=root, sources=tuple(sources))
