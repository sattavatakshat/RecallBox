"""Extensible content classification for extraction and benchmarking."""
from typing import Literal

from .router import is_pdf, platform_for

ContentCategory = Literal["article", "javascript", "youtube", "instagram", "reddit", "pdf"]
CONTENT_CATEGORIES: tuple[str, ...] = (
    "article", "javascript", "youtube", "instagram", "reddit", "pdf",
)


def classify_content(url: str, hint: str | None = None) -> ContentCategory:
    """Classify conservatively; generic JS sites require an explicit dataset hint."""
    if hint is not None:
        normalized = hint.strip().lower()
        if normalized not in CONTENT_CATEGORIES:
            raise ValueError(f"Unsupported content category: {hint}")
        return normalized  # type: ignore[return-value]
    if is_pdf(url):
        return "pdf"
    platform = platform_for(url)
    if platform in {"youtube", "instagram", "reddit"}:
        return platform  # type: ignore[return-value]
    return "article"
