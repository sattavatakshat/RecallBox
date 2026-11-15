# Universal URL Extractor

**A local-first, open-source Python toolkit for extracting content from URLs and comparing extraction engines with reproducible evidence.**

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue)
![Status: Experimental](https://img.shields.io/badge/status-experimental-orange)

> **Project status:** Working experimental extractor/benchmark lab and a local RecallBox Android prototype. The prototype has real Auth0 authentication, PostgreSQL persistence, capture and local search. See [startup commands and limits](docs/RECALLBOX_PROTOTYPE.md). Public deployment remains gated.

## Why this exists

A single URL can represent a static article, a JavaScript-rendered page, a PDF, or a social/video page with restricted access. Different extraction engines produce different results, and a successful HTTP response does not establish that the intended content was captured.

Universal URL Extractor aims to make this work **modular, measurable, and transparent**:

- Extract available content into a normalized JSON response.
- Compare supported engines on the *same* URL, including failures, missing content, latency, and provenance.
- Keep raw benchmark evidence and evaluation history locally.
- Avoid overstating what was retrieved or treating one engine's output as ground truth.

## Two related projects — not the same product

| | Universal URL Extractor | RecallBox |
|---|---|---|
| **What it is** | Reusable developer infrastructure | Planned personal digital-memory application |
| **Status** | Working experimental implementation in this repo | Local Android prototype in this repo |
| **Focus** | URL extraction, normalized output, engine benchmarking | Save, rediscover, and eventually act on personal saved content |
| **Typical user** | Developers, researchers, knowledge-system builders | People saving links, articles, screenshots, and notes |
| **Boundary** | Does **not** provide semantic search, user accounts, or a consumer UI | Separate FastAPI/Expo stack; not yet connected to extractor workers |

RecallBox consumes the extractor as a separate local product. The complete release target remains [the RecallBox PRD](docs/RECALLBOX_PRODUCT_PRD.md).

## What works in v0.3

### Extraction API and CLI
- `POST /v1/extract` and the `universal-extractor` CLI.
- Lightweight HTML extraction via HTTPX/BeautifulSoup; optional Trafilatura.
- Optional Crawl4AI for rendered pages, Agent Reach for supported platform-specific reads, and Docling for PDFs.
- Normalized response including engine, status, content/Markdown, metadata, warnings, errors, and attempted engines.
- Clear `extracted`, `metadata_only`, `unsupported`, and `failed` distinctions.

### Benchmark Lab
- Independent eligible engine runs rather than stopping at the first success.
- Repeated attempts, local SQLite experiment history, immutable artifacts and captured provenance.
- Manual/blinded evaluation workflow and optional, explicitly enabled OpenAI API scoring.
- Evidence-gated scores, category leaderboards, data exports, and comparison tools.

**Not shipped:** guaranteed social/video understanding, audio transcription, image OCR, a trained ML router, a verified 1,000-URL benchmark corpus, or production-grade multi-tenant hosting. RecallBox's separate prototype provides its own UI and local embeddings/search.

## Quick start

Requires Python **3.11+**. The default installation does not need a browser, a paid API, or external accounts.

```bash
git clone https://github.com/sattavatakshat/RecallBox.git
cd RecallBox
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

Try it in another terminal:

```bash
curl http://127.0.0.1:8000/health

curl -sS -X POST http://127.0.0.1:8000/v1/extract \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","engine":"auto"}'
```

Interactive API docs: `http://127.0.0.1:8000/docs`.

The CLI also supports:

```bash
universal-extractor https://example.com
```

### Optional engines

Install only the adapters you need, and enable them explicitly:

```bash
# Optional HTML readability
python -m pip install -e '.[readability]'

# Optional JavaScript-rendered pages (larger browser setup)
python -m pip install -e '.[crawl]'
crawl4ai-setup
export ENABLE_CRAWL4AI=true

# Optional PDFs (resource-intensive local models)
python -m pip install -e '.[documents]'
export ENABLE_DOCLING=true
```

Agent Reach is installed separately from the upstream project. Review its [official installation guide](https://github.com/Panniantong/Agent-Reach/blob/main/docs/install.md) and account permissions before enabling `ENABLE_AGENT_REACH=true`. Do **not** mistake the similarly named PyPI package for the upstream project.

See [technical reference](docs/TECHNICAL_REFERENCE.md) for engine behavior, schema examples, environment options, and limitations.

## Run an experiment

With optional engines installed and enabled:

```bash
curl -sS -X POST http://127.0.0.1:8000/v1/benchmark \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","engines":"all_eligible","evaluation_mode":"manual","repetitions":3}'
```

This submits a benchmark job and returns a `run_id`. A completed run is **not automatically a verified quality score**: the lab requires appropriate reference evidence and review.

For dataset schemas, blinded review, score import, storage model, and evidence requirements, see [Benchmark Lab documentation](benchmarks/README.md).

## How it fits together

```text
User / application
       |
       v
Universal URL Extractor
  |-- URL validation and classification
  |-- HTML / Crawl4AI / Agent Reach / Docling adapters
  |-- normalized result + provenance
       |
       +--> optional Benchmark Lab
            |-- independent engine attempts
            |-- SQLite history and local artifacts
            |-- human-verified references / optional AI review
            +-- evidence-gated scores and reports

Separate local application:
RecallBox ingestion -> personal library -> semantic retrieval -> user actions
          ^
          | may use Universal URL Extractor
```

The extractor is intended to remain usable independently of RecallBox.

## Security, privacy, and responsible use

**Do not expose the current localhost API directly to the internet.** Basic URL, DNS, redirect, and size checks are not a complete server-side request forgery (SSRF) defense, especially when browsers or third-party tools follow their own redirects. Network isolation, authentication, quotas, bounded workers, and other safeguards are required before handling untrusted public traffic.

- Respect robots policies, website terms, copyright, access restrictions, and source attribution.
- Do not use this project to bypass CAPTCHAs, paywalls, or authentication.
- `metadata_only` is not full-content extraction. Social previews do not imply a reel/video was understood.
- Review benchmark artifacts before sharing: they may contain copyrighted or sensitive extracted material.
- Optional API evaluation is separately billed and disabled by default.

## Project documentation

- [Technical reference](docs/TECHNICAL_REFERENCE.md) — extracted from the prior README to preserve existing usage and implementation notes
- [Benchmark Lab](benchmarks/README.md) — evaluation, datasets, review process, and scoring
- [Architecture](docs/PROJECT_ARCHITECTURE.md) · [Diagrams](docs/ARCHITECTURE_DIAGRAMS.md) · [Database schema](docs/DATABASE_SCHEMA.md)
- [Roadmap](ROADMAP.md) — current state, next milestones, and deferred ideas
- [RecallBox vision](docs/RECALLBOX_VISION.md) — product direction distinct from this extractor
- [Contributing](CONTRIBUTING.md) — contribution process and lightweight local verification

## Contributing

Bug reports, documentation improvements, supported-adapter ideas, security hardening, and carefully documented benchmark improvements are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing significant changes.

## License

Copyright 2026 Akshat Jain. Project-owned content is available under the [Apache License 2.0](LICENSE). Third-party tools and libraries remain subject to their own licenses. See [NOTICE](NOTICE).

The repository is newly public; no community adoption, benchmark results, or production security guarantees are implied.

## RecallBox product implementation

For the current Android prototype, start with [the local run guide](docs/RECALLBOX_PROTOTYPE.md). The S1/S2 guides below retain historical implementation and acceptance records.

The S1 product API and Expo foundations are documented in
[the S1 implementation guide](docs/RECALLBOX_S1_IMPLEMENTATION.md). Current real
PostgreSQL/Auth0/Android acceptance is recorded in the prototype run guide above.
The extractor and private benchmark laboratory retain their existing entry points
and SQLite storage. iOS native acceptance remains open.

S2 adds private plain-text notes, versioned edits, durable create retries and a
cursor-based mobile Inbox/sync client. See the
[S2 implementation and verification guide](docs/RECALLBOX_S2_IMPLEMENTATION.md)
and [API contract](docs/RECALLBOX_S2_API.md). The current prototype adds capture,
durable ingestion and local search. No public deployment is configured.

The integrated source also includes HTTP(S) bookmarks and manual Collections.
Migrate through `0004_collections`; capture and semantic migrations precede bookmarks
so existing saved media and vectors remain intact. The Sunday planning documents
record earlier acceptance gates; see [the prototype guide](docs/RECALLBOX_PROTOTYPE.md)
for historical execution evidence. Physical-device acceptance of this merge is pending.
