# Universal URL Extractor: working architecture

This document describes the storage-hardened implementation (SQLite schema 3). Schema 2 introduced the history layout; schema 3 adds tighter context/timestamp guards. The project extracts authorized public URLs and compares eligible engines. It does not train a model, automatically promote benchmark routing, or provide a frontend.

## Entry points and layout

Run from the project root with Python 3.12 and the existing `.venv`:

```bash
source .venv/bin/activate
export BENCHMARK_DATA_DIR="$PWD/.benchmark_lab"
export ENABLE_CRAWL4AI=true ENABLE_AGENT_REACH=true ENABLE_DOCLING=true
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

`src/universal_extractor/app.py` creates the FastAPI application. `cli.py` implements `universal-extractor`; a bare URL still means production extraction. Application startup starts one benchmark manager; shutdown interrupts its active job and awaits cleanup.

| Path | Responsibility |
|---|---|
| `src/universal_extractor/service.py` | Production first-success routing and social-preview honesty rules |
| `router.py`, `categories.py` | Platform/PDF detection and optional explicit category hints |
| `security.py`, `fetcher.py` | URL/DNS validation, private-network rejection, redirect validation, bounded HTTP download |
| `models.py` | Common extraction output plus truncation/provenance fields |
| `config.py` | Environment settings and local data path |
| `resources.py` | Shared in-process heavy-adapter lock for production extraction and benchmarks |
| `capabilities.py` | Enabled/installed engines, categories and identifiable tool versions |
| `adapters/html.py` | HTTPX + BeautifulSoup/optional Trafilatura; lightweight HTML/plain text |
| `adapters/crawl.py` | Lazy Crawl4AI browser rendering; browser context manager cleanup |
| `adapters/agent.py` | Agent Reach CLI; safe argv, bounded streams, timeout/cancellation kill |
| `adapters/documents.py` | Bounded PDF download and killable Docling conversion child |
| `benchmark_models.py` | Request, reference, AI import and dataset validation |
| `benchmark_runner.py` | Durable repetitions, interruption/cancellation, derived engine summaries and bounded worker |
| `experiment_store.py` | Existing v1 SQL compatibility layer and public ExperimentStore class |
| `storage_v2.py` | Additive migration, immutable artifacts/history, snapshots, relational constraints, integrity reports and local job claims |
| `evaluation.py` | Frozen blinded packets, manual import and optional official-SDK evaluator |
| `scoring.py` | Unchanged 60/40 weights, evidence gates, version-separated leaderboards and comparisons |
| `data_export.py` | Separate input-feature, observation, evaluation-history and derived-score exports |
| `benchmarking.py`, `scripts/` | Older file-based review/smoke helpers retained for compatibility |
| `benchmarks/datasets/` | Dataset manifest/schema; real 48-URL corpus still requires curation |
| `.benchmark_lab/` | Default SQLite/artifact data; exclude from source control |
| `storage-backups/`, `beta-evidence/` | Local backup and controlled live evidence; excluded from source control |
| `tests/` | Existing automated suite; unchanged during hardening |

## API

| Route | Behavior |
|---|---|
| `GET /health` | Engine configuration/capabilities; benchmark concurrency information |
| `POST /v1/extract` | Original normalized extraction response; does not create a benchmark |
| `POST /v1/benchmark` | Persist run/snapshots; enqueue and return 202/run ID |
| `GET /v1/benchmark/{id}` | Run status and engine aggregate counters |
| `GET /v1/benchmark/{id}/results` | Compatibility engine results plus every attempt, snapshots and AI history |
| `GET /v1/benchmark/{id}/history` | Attempts, immutable evaluation/score events and lifecycle transitions |
| `GET /v1/benchmark/{id}/review-packet` | Frozen blinded JSONL download after extraction finishes |
| `GET /v1/benchmark/{id}/review-prompt` | Exact manual scoring prompt |
| `POST /v1/benchmark/{id}/ai-scores` | Validated, transactional append-only review import and score derivation |
| `POST /v1/benchmark/{id}/cancel` | Request cancellation; worker propagates it to active adapter |
| `GET /v1/leaderboard` | Category rankings, separated by engine version/dataset/rubric; JSON or CSV |
| `GET /v1/storage/integrity` | Hash, size, reference, orphan/staged-file and active-attempt inventory |

Swagger documentation is at `/docs`. Keep the beta server local and use one Uvicorn worker. There is no authentication/multi-tenant deployment contract.

## URL processing, engines and execution

URL safety validation is shared with extraction; benchmark submission checks syntax and each actual adapter call revalidates DNS. HTTP fetches validate redirects and enforce byte limits. Browser/CLI internal redirects still require restricted network egress before accepting hostile public traffic. Credential-bearing benchmark query parameters are rejected rather than persisted; exception/content fields use a conservative redaction policy.

Generic web URLs default to `article`; explicitly mark JavaScript cases. PDF URLs use Docling. Web/video/social categories allow HTML, Crawl4AI and Agent Reach where installed/enabled. Agent Reach channel authentication is not inferred from installation; failures are recorded and no login is activated automatically.

Production routing still returns its first successful result. Benchmarking runs every eligible engine independently and preserves every repetition under a unique attempt ID. An adapter error never prevents the next engine. Eligibility skips, unsupported results, failures, timeouts, metadata-only output, cancellation and interrupted execution remain distinct. Full-content reliability counts `COMPLETED` attempts; metadata-only attempts remain `PARTIAL`.

The in-process queue is bounded. A SQLite claim serializes benchmark execution across local managers/CLI processes; each run also has an owner PID/token. Heavy engines are sequential. Recovery refills the bounded worker from durable queued work rather than loading an unbounded queue. Failed repetitions are evidence and are not silently retried. On resume, completed/partial/failed/timeout repetitions remain untouched; interrupted repetitions receive new IDs, retaining their old interrupted record.

Docling runs in a child so cancellation can terminate model work before temporary-file cleanup. This trades warm-model reuse for isolation on an 8 GB machine. Process CPU/RSS observations are explicitly scoped to the parent; they are not full child resource accounting.

## Storage and provenance

SQLite migrations 2 and 3 are additive. Old run/result/review/score tables and files remain, and their original row values are archived in `legacy_records`. Missing old snapshots, raw outputs and repetition histories stay unknown. No original row is invented into a complete historical attempt.

Each new run captures an immutable settings snapshot (including scoring definitions, limits, repetition/selection settings), runtime versions/code hash, and pre-extraction URL/domain/path/availability features. Secrets and arbitrary environment variables are not collected. Safely observed MIME/HTTP-preflight data remain null because no preflight request is currently performed. A browser build is only identified if available through captured runtime information; unknown versions stay null.

Every attempt commits its terminal outcome immediately. Outputs are JSON artifacts with UUID identities, SHA-256, size/type/encoding, and run-scoped foreign keys. Publication uses an fsynced temporary file and an atomic hard link that refuses replacement. Registry rows and historical events reject UPDATE/DELETE. File changes are detected on every read. The integrity command reports missing/corrupt/unregistered/staged files; it never deletes them. Interrupted publication can leave an orphan, which is detectable and must be investigated before removal.

Adapters report text/Markdown clipping with original/stored lengths, limits and reason. Image limits are also reported by Crawl4AI. Absence of clipping means completeness is unknown, not proof that a full article/video was available. `raw_adapter_output` is the safely retained adapter representation, not a promise to archive source HTML/PDF bytes. Redaction and deliberate retention limits are explicit.

`BENCHMARK_STORAGE_MAX_BYTES` defaults to 2 GB of registered artifacts; exceeding it fails publication with an explicit error. Backups/SQLite/export files require separate operational disk monitoring. There is no automatic deletion/retention job.

## Scoring and AI review

AI weights remain fidelity 25, completeness 20, structure 8, grounding 7. Deterministic weights remain metadata 10, reliability 20 and latency 10. A final score requires verified reference evidence, a compatible verified AI review, adequate repetitions and all deterministic components. Missing remains null; measured zero remains zero. Truncated review evidence cannot become verified.

Each attempt with an output receives a private candidate binding. A finished run exports a frozen blinded packet; packet bytes, exact prompt and reference artifact/hash are retained. Only recognized descriptive metadata is exposed; engine names/versions/backends are excluded from packet structure. Source text remains untrusted evidence, never evaluator instructions.

Manual workflow:

```bash
universal-extractor export-review RUN_ID review.jsonl --prompt-output scoring-prompt.txt
# Upload review.jsonl to ChatGPT and use scoring-prompt.txt. Save actual JSONL response.
universal-extractor import-scores RUN_ID scores.jsonl
```

Each review is an immutable event with candidate/attempt/artifact/reference/packet/response/prompt/rubric lineage. Unknown manual model names are null. Identical payload+packet imports return the existing event ID; a changed review creates another event. `review_session_id` distinguishes intentionally independent identical reviews. Incompatible prompt/rubric versions are rejected. Imports and derived score history commit in one SQLite transaction.

The compatibility engine summary uses the first completed representative attempt (otherwise first partial); its current AI score is the latest review for that same attempt. Every other attempt/review remains visible and exportable. `score_events` retain each changed derivation, including its exact attempt inputs and settings. This policy avoids presenting unreviewed repetitions as individually reviewed.

The optional official OpenAI SDK integration remains explicitly disabled by default and requires separately billed API access. It uses structured outputs and caps, never a consumer ChatGPT browser session. No paid evaluation was performed during beta verification.

Leaderboards separate build, dataset and rubric contexts, report shared backends, and require enough verified distinct URLs before recommendations. Recommendations are review artifacts; production routing is never updated automatically. Statistical intervals remain descriptive and do not establish causal engine superiority.

## Cancellation, recovery and export

Explicit cancellation polls the durable flag and cancels the adapter task, terminalizes the active attempt, retains earlier outputs and marks the run CANCELLED. Server shutdown marks active work INTERRUPTED; restart marks stale attempts INTERRUPTED, removes dead local PID claims and queues resumable runs. Append-only lifecycle transitions separate extraction/evaluation completion history. Local PID claims do not support multi-host distributed execution.

```bash
universal-extractor storage-integrity
universal-extractor export-data training-exports/beta-v2 --dataset-version controlled-live-v2
```

The output directory must be new. CSV exports contain `input_features` (including safe configuration/environment snapshots), `attempt_outcomes`, `evaluation_history`, `derived_scores`, `artifact_inventory`, and `legacy_coverage`, plus a manifest with filters/checksums/coverage. Only the first table is model input. Artifact inventory resolves output/reference/packet/response identities to stable paths, sizes and hashes. Outcome rows distinguish raw observations, verified labels, provisional reviews and engine aggregates. Parquet is available only if `pyarrow` is already installed; it is not installed automatically. See the V2 audit for actual verification and limitations.

## Extension points

To add an extractor, implement an async adapter returning `Extracted`, register capabilities/categories and installed/version detection in `capabilities.py`, and register its callable in `BenchmarkRunner.adapters`. Supply backend provenance and truncation information. Production fallback routing in `service.py` needs a change only if that engine should join production extraction. Scoring, persistence and export use the common result/attempt interface and need no engine-specific rewrite. New scoring rubrics require separately versioned definitions and evaluation contexts; do not mutate an old definition.
