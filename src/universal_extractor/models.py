from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field

Engine = Literal["auto", "crawl4ai", "agent_reach", "docling", "html"]
Status = Literal["extracted", "metadata_only", "unsupported", "failed", "blocked"]


class ExtractRequest(BaseModel):
    url: str = Field(min_length=10, max_length=4096)
    engine: Engine = "auto"


class ExtractResponse(BaseModel):
    url: str
    final_url: str | None = None
    platform: str
    status: Status
    engine: str | None = None
    title: str | None = None
    author: str | None = None
    description: str | None = None
    content: str | None = None
    markdown: str | None = None
    images: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
    attempted_engines: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    extracted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Extracted:
    def __init__(self, status: Status, engine: str, final_url: str | None = None,
                 title: str | None = None, author: str | None = None,
                 description: str | None = None, content: str | None = None,
                 markdown: str | None = None, images: list[str] | None = None,
                 metadata: dict[str, str] | None = None, truncation: dict | None = None,
                 raw_output: dict | None = None, content_type: str | None = None,
                 language: str | None = None, links: list | None = None,
                 image_metadata: list | None = None):
        self.status = status
        self.engine = engine
        self.final_url = final_url
        self.title = title
        self.author = author
        self.description = description
        self.content = content
        self.markdown = markdown
        self.images = images or []
        self.metadata = metadata or {}
        self.truncation = truncation or {'truncated': False, 'completeness': 'unknown'}
        self.raw_output = raw_output
        self.content_type = content_type
        self.language = language
        self.links = links or []
        self.image_metadata = image_metadata or []


def truncation_info(original: str, stored: str, limit: int, representation: str = 'text') -> dict:
    return {'truncated':len(original)>len(stored), 'configured_limit':limit,
            'original_length':len(original),'stored_length':len(stored),
            'reason':'content_limit' if len(original)>len(stored) else None,
            'representation':representation,'original_complete_retained':False,
            'completeness':'truncated' if len(original)>len(stored) else 'unknown'}
