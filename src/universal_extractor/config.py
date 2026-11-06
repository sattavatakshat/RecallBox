from dataclasses import dataclass
import os
from pathlib import Path


def _flag(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    enable_crawl4ai: bool = False
    enable_agent_reach: bool = False
    enable_docling: bool = False
    max_response_bytes: int = 12_000_000
    max_content_chars: int = 120_000
    fetch_timeout_seconds: float = 18.0
    adapter_timeout_seconds: float = 35.0
    benchmark_data_dir: str = ".benchmark_lab"
    benchmark_queue_size: int = 8
    benchmark_max_repetitions: int = 5
    benchmark_min_reliability_runs: int = 3
    benchmark_artifact_max_chars: int = 120_000
    benchmark_storage_max_bytes: int = 2_000_000_000
    enable_openai_evaluator: bool = False
    openai_evaluator_model: str = "gpt-5-mini"
    openai_evaluator_max_output_tokens: int = 4_000
    openai_evaluator_timeout_seconds: float = 60.0
    openai_evaluator_max_retries: int = 2

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            enable_crawl4ai=_flag("ENABLE_CRAWL4AI"),
            enable_agent_reach=_flag("ENABLE_AGENT_REACH"),
            enable_docling=_flag("ENABLE_DOCLING"),
            max_response_bytes=int(os.getenv("MAX_RESPONSE_BYTES", "12000000")),
            max_content_chars=int(os.getenv("MAX_CONTENT_CHARS", "120000")),
            fetch_timeout_seconds=float(os.getenv("FETCH_TIMEOUT_SECONDS", "18")),
            adapter_timeout_seconds=float(os.getenv("ADAPTER_TIMEOUT_SECONDS", "35")),
            benchmark_data_dir=os.getenv("BENCHMARK_DATA_DIR", ".benchmark_lab"),
            benchmark_queue_size=max(1, int(os.getenv("BENCHMARK_QUEUE_SIZE", "8"))),
            benchmark_max_repetitions=max(1, int(os.getenv("BENCHMARK_MAX_REPETITIONS", "5"))),
            benchmark_min_reliability_runs=max(2, int(os.getenv("BENCHMARK_MIN_RELIABILITY_RUNS", "3"))),
            benchmark_artifact_max_chars=max(1_000, int(os.getenv("BENCHMARK_ARTIFACT_MAX_CHARS", "120000"))),
            benchmark_storage_max_bytes=max(1_000_000,int(os.getenv('BENCHMARK_STORAGE_MAX_BYTES','2000000000'))),
            enable_openai_evaluator=_flag("ENABLE_OPENAI_EVALUATOR"),
            openai_evaluator_model=os.getenv("OPENAI_EVALUATOR_MODEL", "gpt-5-mini"),
            openai_evaluator_max_output_tokens=max(256, int(os.getenv("OPENAI_EVALUATOR_MAX_OUTPUT_TOKENS", "4000"))),
            openai_evaluator_timeout_seconds=float(os.getenv("OPENAI_EVALUATOR_TIMEOUT_SECONDS", "60")),
            openai_evaluator_max_retries=max(0, int(os.getenv("OPENAI_EVALUATOR_MAX_RETRIES", "2"))),
        )

    @property
    def benchmark_path(self) -> Path:
        return Path(self.benchmark_data_dir).expanduser().resolve()
