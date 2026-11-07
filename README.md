# Universal URL Extractor — local-first MVP

RecallBox's planned product is a complete Android/iOS memory app; this extractor remains one subsystem. The product foundation is documented in the [product PRD](docs/RECALLBOX_PRODUCT_PRD.md), [mobile/backend architecture](docs/RECALLBOX_MOBILE_ARCHITECTURE.md), [Mac host assessment](docs/MAC_M2_HOSTING_PLAN.md), [product database design](docs/RECALLBOX_DATABASE_DESIGN.md), and [implementation/release gates](docs/RECALLBOX_RELEASE_GATES.md). These describe proposed functionality, not a shipped mobile product. The existing benchmark lab stays private and independent.

For a passive, read-only Mac inventory, run `python3 scripts/inspect_mac_host.py`. Keep its output private; upload/download measurement requires the explicit `--active-network` option.

Storage hardening is implemented with additive SQLite migrations through schema 3, per-repetition attempts, immutable hash-checked artifacts, append-only evaluation/score history, and separate feature/label CSV exports. See [working architecture](docs/PROJECT_ARCHITECTURE.md), [data-flow diagrams](docs/ARCHITECTURE_DIAGRAMS.md), [database ER/schema](docs/DATABASE_SCHEMA.md), and the [updated readiness audit](docs/ML_DATA_READINESS_AUDIT_V2.md). Existing v1 records are preserved with unknown legacy provenance where measurements were never captured.

```bash
universal-extractor storage-integrity
universal-extractor export-data training-exports/new-export --rubric-version v0.3.0
```

Use a new export directory for each export. Dataset references are unverified by default; set `reference_verified` explicitly only after human review. Manual AI evaluation requires exporting the frozen review packet first. Live beta failures and pending reviews are recorded in the updated audit; no real AI scores were fabricated.

A working Python/FastAPI URL extraction service with **separate adapters**:

- **HTML reader (default):** lightweight extraction with HTTPX + BeautifulSoup; optionally Trafilatura. Runs without paid APIs or browser installation.
- **Crawl4AI (opt-in):** rendered pages/Markdown, when a normal HTTP request cannot capture the text.
- **Agent Reach (opt-in):** specialized platform reader CLI, for supported social/video sites. The correct project is `Panniantong/Agent-Reach`, **not** the unrelated PyPI package with the same name.
- **Docling (opt-in):** download a PDF and extract Markdown locally.

This is an **MVP, not a universal guaranteed scraper**. A login page, missing subtitles, access limits or paywalls cannot automatically be bypassed. It does not transcribe video, understand an Instagram Reel, or provide search/embeddings.

## 1. Run locally (lightweight default)

Recommended: Python 3.11 or 3.12; on a small Mac, start with the HTML adapter. Run commands in this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000 --reload
```

Test in another terminal:

```bash
curl http://127.0.0.1:8000/health
curl -s -X POST http://127.0.0.1:8000/v1/extract \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

Open `http://127.0.0.1:8000/docs` to try Swagger UI. Or run:

```bash
universal-extractor 'https://example.com'
```

## 2. Add Crawl4AI (optional)

```bash
pip install -e '.[crawl]'
crawl4ai-setup
export ENABLE_CRAWL4AI=true
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

The dependency is large and installs browser tooling. It is optional to preserve RAM/storage on constrained machines.

## 3. Add Agent Reach (optional)

Read **the actual installation instructions** first: <https://github.com/Panniantong/Agent-Reach/blob/main/docs/install.md>. Its repository currently specifies:

```bash
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
agent-reach setup
agent-reach channels
agent-reach doctor
```

Then restart this API with:

```bash
export ENABLE_AGENT_REACH=true
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

Agent Reach can reuse browser sessions for certain platforms; **review the install and channel permissions before enabling those channels**, especially on a personal browser profile. Do not enable social logins as part of a shared public service. The adapter calls `agent-reach read URL`, parses the JSON result envelope (or plain-text output), and treats errors explicitly. Missing subtitles and inaccessible media still fail.

## 4. Add Docling (optional)

```bash
pip install -e '.[documents]'
export ENABLE_DOCLING=true
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

PDF processing can be CPU, memory and storage intensive. Docling may download local models on first execution. Start with small PDFs.

## 5. API response schema

`POST /v1/extract` accepts:

```json
{"url":"https://example.com/article", "engine":"auto"}
```

`engine` is optional; supported: `auto`, `html`, `crawl4ai`, `agent_reach`, `docling`.

Example **shape** (not an actual fetch result):

```json
{
  "url": "https://example.com/article",
  "final_url": "https://example.com/article",
  "platform": "web",
  "status": "extracted",
  "engine": "html",
  "title": "Example title",
  "author": null,
  "description": null,
  "content": "Extracted text from the page...",
  "markdown": "Extracted text from the page...",
  "images": [],
  "metadata": {},
  "attempted_engines": ["html"],
  "warnings": [],
  "error": null,
  "extracted_at": "2026-11-05T00:00:00+00:00"
}
```

Statuses: `extracted` = text extracted; `metadata_only` = page title/description/image available but no substantial body; `unsupported` = no enabled adapter, or unsupported content; `failed` = attempts unsuccessful. Malformed or private-network URLs return HTTP 400.

For Instagram, Facebook, X and LinkedIn, a generic HTML fallback is **never** labeled full content; it may return `metadata_only` when a public preview is visible. A `status=extracted` result **does not mean** the full intended article or video was available. Store attribution and inspect extracted content quality.

## 6. Routing (MVP)

```text
POST /v1/extract
   -> syntactic check + public DNS check
   -> *.pdf: Docling if enabled; else unsupported
   -> known social/video host: Agent Reach if enabled -> Crawl4AI if enabled -> HTML
   -> other websites: Crawl4AI if enabled -> HTML
   -> normalized JSON with warnings and attempted adapters
```

HTML fallback fetches up to 12 MB with timeout and 4 manually validated redirects. Source HTTP 403/429 returns failure (not a fabricated summary). No browser automation is needed for initial testing.

## 7. Tests

```bash
pytest -q
```

Tests mock HTTP/DNS: **green tests do not certify live websites**. Next, run a manual smoke matrix: 10 public articles, 5 JS pages, 5 YouTube links, 5 social links, 5 PDFs. Measure extraction completeness, error reason, runtime and resource consumption.

## 8. Security and production gaps — important

This API is deliberately bound to `127.0.0.1`; **do not deploy it to a public server as-is**. It checks URL scheme, credentials, non-standard ports, DNS addresses, manual HTTP redirects and size limits, but those checks are not a comprehensive SSRF defense: DNS rebinding can occur, and Crawl4AI/Agent Reach can follow redirects internally. Use outbound network filtering and isolated workers before accepting untrusted URLs. Further required hardening:

- worker queues, bounded concurrency, retries/backoff and idempotency
- authentication, tenant isolation, rate limits, audit logs and usage quotas
- safe DNS/redirect enforcement and restricted egress at the network layer
- total CPU/memory timeouts for browsers and PDF converter processes
- cache, dedupe and observability; download consent/retention policy
- site-specific terms, `robots.txt` consideration, and authorized account access

The service does not intentionally circumvent paywalls, CAPTCHAs, or account restrictions. Respect applicable website terms and laws.

## References

- Crawl4AI: https://github.com/unclecode/crawl4ai
- Agent Reach: https://github.com/Panniantong/Agent-Reach
- Docling: https://github.com/docling-project/docling
- Trafilatura: https://github.com/adbar/trafilatura

### Optional batch smoke matrix

Add one URL per line to `urls.txt`, then run:

```bash
python scripts/smoke_matrix.py urls.txt results.csv
```

The CSV reports status, adapter, extracted character count, runtime and failure reason. It processes one URL at a time to limit memory use on small machines.

## 9. Universal Extraction Benchmark Lab v0.3

The benchmark lab is a separate evidence-gathering path; it does not change production routing. For each URL it validates the target, classifies content, records unavailable engines as `SKIPPED`, independently executes every eligible enabled engine, stores large outputs as private local artifacts, and persists measurements in SQLite. Heavy adapters run sequentially with concurrency 1.

```text
URL -> security validation -> category/capabilities
    -> HTML -----------\
    -> Crawl4AI --------+-> artifacts + SQLite -> blind AI review -> scores
    -> Agent Reach -----+                       -> leaderboard/regressions
    -> Docling --------/
```

Start all installed engines:

```bash
source .venv/bin/activate
export ENABLE_CRAWL4AI=true ENABLE_AGENT_REACH=true ENABLE_DOCLING=true
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

Start one asynchronous benchmark:

```bash
curl -sS -X POST http://127.0.0.1:8000/v1/benchmark \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","engines":"all_eligible","evaluation_mode":"manual","repetitions":3}'
```

The response contains a `run_id`. Inspect `/v1/benchmark/{run_id}`, `/results`, and `/review-packet`. A generic website runs HTML, Crawl4AI, and Agent Reach independently when all three are enabled; first success never short-circuits benchmark execution.

CLI equivalents:

```bash
universal-extractor benchmark https://example.com --repetitions 3
universal-extractor dataset benchmarks/datasets/beta_urls.jsonl --dataset-version beta-v1 --repetitions 3 --resume
universal-extractor leaderboard --category article --csv article-leaderboard.csv --routing-output routing-review.json
```

The 100-point rubric is AI fidelity 25, completeness 20, structure 8, grounding 7; deterministic metadata 10, repeated reliability 20, and threshold-based latency 10. A final score exists only with a verified reference, a verified AI review, reference metadata, and at least three repetitions. Otherwise the status remains `PENDING`, `PARTIAL`, `PROVISIONAL`, or `INSUFFICIENT_EVIDENCE` with reasons.

See [`benchmarks/README.md`](benchmarks/README.md) for the complete export/import workflow, dataset format, API examples, reproducibility, optional paid OpenAI evaluator, and extension guide. The shipped 48-URL target file is intentionally empty; no real-world results or permissions are fabricated.
