from .adapters.agent import extract_agent_reach
from .adapters.crawl import extract_crawl4ai
from .adapters.documents import extract_docling
from .adapters.html import extract_html
from .config import Settings
from .models import ExtractRequest, ExtractResponse, Extracted
from .router import is_pdf, platform_for
from .security import validate_url
from .resources import run_adapter


def normalize_adapter_result(name: str, platform: str, result: Extracted,
                             warnings: list[str]) -> Extracted:
    """Apply honesty rules consistently to production and benchmark calls."""
    if (name == "html" and platform in {"instagram", "facebook", "twitter", "linkedin"}
            and result.status == "extracted"):
        result.status = "metadata_only" if result.title or result.description or result.images else "unsupported"
        result.content = None
        result.markdown = None
        warnings.append(f"{platform}: generic HTML was treated as preview metadata, not full post content")
    return result


class ExtractionService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def plan(self, url: str, engine: str) -> list[str]:
        if engine != "auto":
            return [engine]
        if is_pdf(url):
            return ["docling"] if self.settings.enable_docling else []
        if platform_for(url) != "web":
            options = []
            if self.settings.enable_agent_reach:
                options.append("agent_reach")
            if self.settings.enable_crawl4ai:
                options.append("crawl4ai")
            options.append("html")
            return options
        options = ["crawl4ai"] if self.settings.enable_crawl4ai else []
        options.append("html")
        return options

    async def extract(self, request: ExtractRequest) -> ExtractResponse:
        await validate_url(request.url)
        platform = "pdf" if is_pdf(request.url) else platform_for(request.url)
        attempted = []
        warnings = []
        partial: Extracted | None = None
        adapters = {
            "agent_reach": extract_agent_reach,
            "crawl4ai": extract_crawl4ai,
            "docling": extract_docling,
            "html": extract_html,
        }
        plan = self.plan(request.url, request.engine)
        if not plan:
            return ExtractResponse(url=request.url, platform=platform, status="unsupported",
                                   error="PDF extraction requires the optional Docling adapter. Enable it first.")
        for name in plan:
            attempted.append(name)
            try:
                result = await run_adapter(adapters[name],name,request.url,self.settings)
                # A generic HTML fetch of a login-heavy social site must never be
                # represented as the complete post/reel. Only trust its public preview.
                result = normalize_adapter_result(name, platform, result, warnings)
                if result.status == "extracted":
                    return self._response(request.url, platform, result, attempted, warnings)
                if result.status == "metadata_only" and partial is None:
                    partial = result
                if request.engine != "auto":
                    break
            except Exception as exc:
                warnings.append(f"{name}: {type(exc).__name__}: {str(exc)[:300]}")
        if partial:
            return self._response(request.url, platform, partial, attempted, warnings)
        return ExtractResponse(url=request.url, platform=platform,
                               status="failed" if attempted else "unsupported",
                               attempted_engines=attempted, warnings=warnings,
                               error="No enabled adapter could extract this URL")

    @staticmethod
    def _response(url: str, platform: str, data: Extracted,
                  attempted: list[str], warnings: list[str]) -> ExtractResponse:
        return ExtractResponse(
            url=url, final_url=data.final_url, platform=platform, status=data.status,
            engine=data.engine, title=data.title, author=data.author,
            description=data.description, content=data.content,
            markdown=data.markdown, images=data.images, metadata=data.metadata,
            attempted_engines=attempted, warnings=warnings,
        )
