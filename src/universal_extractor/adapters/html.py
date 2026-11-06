from bs4 import BeautifulSoup
from urllib.parse import urljoin
from importlib.metadata import version
from ..config import Settings
from ..fetcher import FetchResult, fetch_url
from ..models import Extracted, truncation_info


def _meta(soup, *names: str) -> str | None:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if tag and tag.get("content"):
            return str(tag["content"]).strip()
    return None


def parse_html(result: FetchResult, settings: Settings) -> Extracted:
    if result.content_type.split(";")[0].strip() == "text/plain":
        original = result.data.decode("utf-8", errors="replace").strip()
        content = original[:settings.max_content_chars]
        return Extracted(status="extracted" if content else "unsupported", engine="html",
                         final_url=result.url, content=content or None, markdown=content or None,
                         content_type=result.content_type,truncation=truncation_info(original,content,settings.max_content_chars))
    soup = BeautifulSoup(result.data, "html.parser")
    title = _meta(soup, "og:title", "twitter:title") or (soup.title.get_text(" ", strip=True) if soup.title else None)
    description = _meta(soup, "description", "og:description", "twitter:description")
    author = _meta(soup, "author", "article:author")
    image = _meta(soup, "og:image", "twitter:image")
    images = [urljoin(result.url, image)] if image else []
    meta: dict[str, str] = {}
    for key, names in {
        "site_name": ("og:site_name",),
        "published_at": ("article:published_time", "datePublished"),
        "og_type": ("og:type",),
    }.items():
        found = _meta(soup, *names)
        if found:
            meta[key] = found

    # Light extractor requires no AI model or browser. Trafilatura is optional.
    content = None
    try:
        import trafilatura
        content = trafilatura.extract(result.data.decode("utf-8", errors="replace"), include_comments=False)
    except ImportError:
        pass
    except Exception:
        pass

    backend='httpx+trafilatura' if content else 'httpx+beautifulsoup4'
    meta['underlying_backend']=backend
    meta['backend_version']=version('trafilatura' if content else 'beautifulsoup4')
    if not content:
        for node in soup(["script", "style", "nav", "footer", "header", "noscript", "svg", "form"]):
            node.decompose()
        main = soup.find("article") or soup.find("main") or soup.body
        content = main.get_text("\n", strip=True) if main else ""
    original = (content or "").strip()
    content = original[:settings.max_content_chars]
    status = "extracted" if len(content) >= 80 else ("metadata_only" if title or description or images else "unsupported")
    return Extracted(status=status, engine="html", final_url=result.url, title=title,
                     author=author, description=description,
                     content=content if status == "extracted" else None,
                     markdown=content if status == "extracted" else None,
                     images=images, metadata=meta, content_type=result.content_type,
                     language=str(soup.html.get('lang')) if soup.html and soup.html.get('lang') else None,
                     links=[urljoin(result.url,str(a['href'])) for a in soup.find_all('a',href=True)],
                     truncation=truncation_info(original,content,settings.max_content_chars))


async def extract_html(url: str, settings: Settings) -> Extracted:
    result = await fetch_url(url, settings)
    content_type = result.content_type.split(";")[0].strip()
    if content_type and content_type not in ("text/html", "application/xhtml+xml", "text/plain"):
        raise RuntimeError(f"Non-HTML content type: {content_type}")
    return parse_html(result, settings)
