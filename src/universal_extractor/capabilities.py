"""Adapter capability and runtime availability reporting."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from importlib import metadata, util
from functools import lru_cache
import shutil
import subprocess

from .config import Settings


@dataclass(frozen=True)
class EngineCapability:
    name: str
    categories: tuple[str, ...]
    enabled: bool
    installed: bool
    version: str | None
    heavy: bool
    backend: str
    reason: str | None = None

    @property
    def available(self) -> bool:
        return self.enabled and self.installed

    def model_dump(self) -> dict:
        return {**asdict(self), "available": self.available}


ENGINE_CATEGORIES = {
    "html": ("article", "javascript", "youtube", "instagram", "reddit"),
    "crawl4ai": ("article", "javascript", "youtube", "instagram", "reddit"),
    "agent_reach": ("article", "javascript", "youtube", "instagram", "reddit"),
    "docling": ("pdf",),
}


def _version(distribution: str) -> str | None:
    try:
        return metadata.version(distribution)
    except metadata.PackageNotFoundError:
        return None


def engine_capabilities(settings: Settings) -> dict[str, EngineCapability]:
    specs = {
        "html": (True, util.find_spec("bs4") is not None, _version("beautifulsoup4"), False, "httpx+trafilatura"),
        "crawl4ai": (settings.enable_crawl4ai, util.find_spec("crawl4ai") is not None,
                     _version("crawl4ai"), True, "crawl4ai/playwright"),
        "agent_reach": (settings.enable_agent_reach, shutil.which("agent-reach") is not None,
                        _agent_version(), True, "agent-reach"),
        "docling": (settings.enable_docling, util.find_spec("docling") is not None,
                    _version("docling"), True, "docling"),
    }
    result = {}
    for name, (enabled, installed, version, heavy, backend) in specs.items():
        reason = None
        if not enabled:
            reason = "disabled by configuration"
        elif not installed:
            reason = "dependency or executable is not installed"
        result[name] = EngineCapability(name, ENGINE_CATEGORIES[name], enabled, installed,
                                        version, heavy, backend, reason)
    return result


@lru_cache(maxsize=1)
def _agent_version() -> str | None:
    executable = shutil.which("agent-reach")
    if not executable:
        return None
    installed = _version("agent-reach")
    if installed:
        return installed
    try:
        result = subprocess.run([executable, "doctor", "--text"], capture_output=True,
                                text=True, timeout=3, check=False)
        first = result.stdout.splitlines()[0].strip()
        if first.startswith("Agent Reach "):
            return first.removeprefix("Agent Reach ")
    except (OSError, subprocess.SubprocessError, IndexError):
        pass
    return "unknown"


def eligible_engines(category: str, settings: Settings,
                     requested: list[str] | None = None) -> tuple[list[EngineCapability], list[EngineCapability]]:
    capabilities = engine_capabilities(settings)
    names = list(capabilities) if requested is None else requested
    unknown = sorted(set(names) - set(capabilities))
    if unknown:
        raise ValueError(f"Unknown engines: {', '.join(unknown)}")
    eligible, skipped = [], []
    for name in names:
        cap = capabilities[name]
        if category not in cap.categories:
            skipped.append(EngineCapability(**{**asdict(cap), "reason": f"unsupported for {category}"}))
        elif not cap.available:
            skipped.append(cap)
        else:
            eligible.append(cap)
    return eligible, skipped
