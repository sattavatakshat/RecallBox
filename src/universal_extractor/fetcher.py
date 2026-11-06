import httpx
from dataclasses import dataclass
from urllib.parse import urljoin
from .config import Settings
from .security import validate_url


class FetchError(RuntimeError):
    pass


@dataclass
class FetchResult:
    url: str
    content_type: str
    data: bytes
    status_code: int


async def fetch_url(url: str, settings: Settings) -> FetchResult:
    """Fetch with manual public-URL validation across up to 4 redirects.

    This is defense in depth, not a substitute for network egress restrictions:
    DNS rebinding can occur after validation and before HTTPX connects.
    """
    current = url
    async with httpx.AsyncClient(follow_redirects=False, trust_env=False,
                                 timeout=settings.fetch_timeout_seconds,
                                 headers={"User-Agent": "UniversalExtractorLocal/0.1 (+research)"}) as client:
        for _ in range(5):
            await validate_url(current)
            try:
                async with client.stream("GET", current) as resp:
                    if resp.status_code in (301, 302, 303, 307, 308):
                        location = resp.headers.get("location")
                        if not location:
                            raise FetchError("Redirect without Location")
                        current = urljoin(current, location)
                        continue
                    if resp.status_code in (401, 403, 429):
                        raise FetchError(f"Source restricted or rate limited (HTTP {resp.status_code})")
                    if resp.status_code >= 400:
                        raise FetchError(f"HTTP {resp.status_code}")
                    length = resp.headers.get("content-length")
                    try:
                        announced_length = int(length) if length else 0
                    except ValueError:
                        announced_length = 0
                    if announced_length > settings.max_response_bytes:
                        raise FetchError("Response exceeds size limit")
                    chunks = []
                    total = 0
                    async for chunk in resp.aiter_bytes():
                        total += len(chunk)
                        if total > settings.max_response_bytes:
                            raise FetchError("Response exceeds size limit")
                        chunks.append(chunk)
                    return FetchResult(str(resp.url), resp.headers.get("content-type", "").lower(), b"".join(chunks), resp.status_code)
            except httpx.HTTPError as exc:
                raise FetchError(f"Network request failed: {type(exc).__name__}") from exc
    raise FetchError("Too many redirects")
