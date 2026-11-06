import asyncio
from ..config import Settings
from ..models import Extracted, truncation_info


async def extract_crawl4ai(url: str, settings: Settings) -> Extracted:
    try:
        from crawl4ai import AsyncWebCrawler
    except ImportError as exc:
        raise RuntimeError("Crawl4AI is not installed: pip install '.[crawl]'") from exc

    async def _run():
        async with AsyncWebCrawler() as crawler:
            return await crawler.arun(url=url)

    result = await asyncio.wait_for(_run(), timeout=settings.adapter_timeout_seconds)
    if not result.success:
        raise RuntimeError(str(getattr(result, "error_message", "Crawl failed")))
    markdown = getattr(result, "markdown", None)
    content = getattr(markdown, "raw_markdown", None) if markdown is not None else None
    if content is None and isinstance(markdown, str):
        content = markdown
    original = (content or "").strip()
    content = original[:settings.max_content_chars]
    truncation = truncation_info(original,content,settings.max_content_chars,'markdown')
    metadata = getattr(result, "metadata", None) or {}
    media = getattr(result, "media", None) or {}
    images = []
    truncation['images_original_count'] = len(media.get('images', []))
    truncation['images_limit'] = 10
    truncation['images_truncated'] = len(media.get('images', [])) > 10
    for entry in media.get("images", [])[:10]:
        if isinstance(entry, dict) and isinstance(entry.get("src"), str):
            images.append(entry["src"])
    return Extracted(
        status="extracted" if len(content) >= 80 else "metadata_only",
        engine="crawl4ai", final_url=getattr(result, "url", url),
        title=str(metadata.get("title")) if metadata.get("title") else None,
        description=str(metadata.get("description")) if metadata.get("description") else None,
        content=content if len(content) >= 80 else None,
        markdown=content if len(content) >= 80 else None, images=images,
        author=metadata.get('author'),metadata={k:str(v) for k,v in metadata.items() if v is not None},
        content_type='text/html',truncation=truncation,
        links=getattr(result,'links',{}) or {},image_metadata=media.get('images',[])[:10],
    )
