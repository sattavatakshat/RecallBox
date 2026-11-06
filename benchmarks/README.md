# Universal Extraction Benchmark Lab v0.3

The storage-hardened implementation uses SQLite schema 3. Every repetition now has its own durable attempt/output and anonymous candidate; AI reviews and score derivations are append-only. See [architecture](../docs/PROJECT_ARCHITECTURE.md), [schema](../docs/DATABASE_SCHEMA.md) and [V2 readiness evidence](../docs/ML_DATA_READINESS_AUDIT_V2.md). Old aggregate records are retained; unavailable historical attempt data is not reconstructed. Dataset reference files require an explicit `reference_verified:true` declaration after human review.

This lab measures extraction engines; it does not silently change `/v1/extract` routing. Benchmark jobs use the same URL security validation as production extraction, run eligible engines independently and sequentially, persist measurements in SQLite, keep large outputs in local files, and require evidence before producing a verified score.

## Architecture and storage

The five components are:

1. Extractor core: existing normalized adapters and `/v1/extract` fallback behavior.
2. Orchestrator: category/capability detection, bounded one-worker queue, independent engine calls, cancellation, recovery, repetitions, timing, CPU/RSS observations, raw adapter-return snapshots, normalized outputs, and failure isolation.
3. Evaluation: blinded manual ChatGPT JSONL workflow plus an explicitly enabled OpenAI API boundary.
4. Experiment tracking: `.benchmark_lab/experiments.sqlite3` plus mode-`0600` JSON artifacts under `.benchmark_lab/artifacts/{run_id}`.
5. Analysis: evidence-gated scores, category leaderboards, uncertainty/sample coverage, routing recommendations, and comparable-run regression detection.

SQLite uses WAL mode and schema versioning. Interrupted `RUNNING` jobs are returned to the bounded queue when the API process restarts. Dataset CLI runs can use `--resume`. Extracted artifacts and private candidate mappings must not be uploaded; only the blinded review packet should leave the machine.

## Setup and server

The lightweight HTML engine is always enabled. Enable only installed optional engines:

```bash
cd "/Users/akshatjain/Desktop/Recall Box/universal-url-extractor"
source .venv/bin/activate
export ENABLE_CRAWL4AI=true
export ENABLE_AGENT_REACH=true
export ENABLE_DOCLING=true
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

Keep the beta API on localhost. Browser and document engines are sequential by default to fit an M2 MacBook Air with 8 GB RAM.

## Benchmark one URL

API:

```bash
curl -sS -X POST http://127.0.0.1:8000/v1/benchmark \
  -H 'Content-Type: application/json' \
  -d '{
    "url":"https://example.com/article",
    "engines":"all_eligible",
    "evaluation_mode":"manual",
    "category":"article",
    "repetitions":3,
    "dataset_version":"manual-v1"
  }'
```

Representative immediate response:

```json
{"run_id":"br-abc1234567-0123456789ab","status":"QUEUED","category":"article","status_url":"/v1/benchmark/br-abc1234567-0123456789ab"}
```

The ID above demonstrates the shape only. Inspect without inventing results:

```bash
curl -sS http://127.0.0.1:8000/v1/benchmark/RUN_ID
curl -sS http://127.0.0.1:8000/v1/benchmark/RUN_ID/results
curl -sS -X POST http://127.0.0.1:8000/v1/benchmark/RUN_ID/cancel
```

CLI (waits for completion and prints the stored result):

```bash
universal-extractor benchmark https://example.com/article \
  --category article --repetitions 3 --dataset-version manual-v1
```

## Verified references

An API request may include a reference:

```json
{
  "url":"https://example.com/article",
  "repetitions":3,
  "reference":{
    "content":"Human-verified or authorized source snapshot...",
    "metadata":{"title":"Verified title","author":"Verified author"},
    "source":"authorized snapshot 2026-11-05",
    "verified":true,
    "notes":"Permission and review notes"
  }
}
```

The longest candidate and majority agreement are never ground truth. Without a verified reference, AI output is provisional or insufficient and cannot produce a final score.

## Manual ChatGPT export → score → import

Export via API:

```bash
curl -sS http://127.0.0.1:8000/v1/benchmark/RUN_ID/review-packet \
  -o review-RUN_ID.jsonl
curl -sS http://127.0.0.1:8000/v1/benchmark/RUN_ID/review-prompt \
  -o scoring-prompt.txt
```

Or CLI:

```bash
universal-extractor export-review RUN_ID review.jsonl \
  --prompt-output scoring-prompt.txt

# Generate bounded upload files containing at most five runs each:
universal-extractor export-review-batch review-batches RUN_ID_1 RUN_ID_2 RUN_ID_3 \
  --batch-size 5
```

Upload only `review.jsonl` to ChatGPT and paste [`CHATGPT_SCORING_PROMPT.md`](CHATGPT_SCORING_PROMPT.md). The packet contains anonymous IDs, redacts URL query/fragment values, excludes engine names/versions/backends, and labels page text as untrusted evidence. Save ChatGPT's strict JSONL response as `scores.jsonl`.

Import via CLI:

```bash
universal-extractor import-scores RUN_ID scores.jsonl
```

Or wrap the JSONL objects in `{"scores":[...]}` and POST them:

```bash
curl -sS -X POST http://127.0.0.1:8000/v1/benchmark/RUN_ID/ai-scores \
  -H 'Content-Type: application/json' --data-binary @scores-request.json
```

Import rejects unknown/duplicate candidate IDs, mismatched benchmark IDs, out-of-range values, inconsistent totals, incomplete rating sets, and `VERIFIED` claims without a verified reference. The private candidate-to-engine mapping stays in SQLite.

For practical uploads, use batches of 5–10 short packets. Review text is capped at 25,000 characters per reference/candidate; truncation is explicit and a truncated packet cannot be imported as `VERIFIED`.

## Scoring and evidence states

The rubric is versioned as `v0.3.0`:

| Component | Points | Evidence requirement |
|---|---:|---|
| Fidelity | 25 | Verified source/reference |
| Completeness | 20 | Verified source/reference |
| Structure/readability | 8 | Reference and candidate |
| Grounding/no hallucination | 7 | Verified source/reference |
| Metadata quality | 10 | Recognized verified reference fields |
| Reliability | 20 | At least 3 measured repetitions |
| Latency | 10 | Measured median and documented category target |

Latency receives 10 at or below the target and declines proportionally above it. Targets: article 3s, JavaScript 10s, YouTube/Instagram 8s, Reddit 6s, PDF 15s. These are rubric constants, not rankings against the current sample.

States:

- `VERIFIED`: every required deterministic component, verified reference, and verified AI review exist; `final_score` is available.
- `PROVISIONAL`: comparative AI review without verified ground truth; no final score.
- `PARTIAL`: some scored evidence exists but required components are missing.
- `INSUFFICIENT_EVIDENCE`: reference or evaluation evidence cannot support a score.
- `PENDING`: evaluation has not arrived.

Metadata-only extraction remains metadata-only. Disabled, missing, unconfigured, or category-inapplicable engines are `SKIPPED`, not failed. Adapter exceptions and timeouts are `FAILED` and never stop other engines.

## Datasets and reproducibility

[`datasets/dataset.schema.json`](datasets/dataset.schema.json) documents each JSONL entry. `reference_artifact` must be relative and remain below the dataset directory. The target [`datasets/beta_urls.jsonl`](datasets/beta_urls.jsonl) is intentionally unpopulated: add eight authorized URLs for each of six categories (48 total) only after permissions and human reference review. Merely listing a URL never triggers a scrape.

```bash
universal-extractor dataset benchmarks/datasets/beta_urls.jsonl \
  --dataset-version beta-v1 --repetitions 3 --evaluation-mode manual --resume
```

To reproduce an experiment, preserve the dataset/reference files, dataset version, engine versions, environment flags, rubric/prompt versions, and database/artifacts. Use the same repetitions and access context. A dataset/rubric change is excluded from regression comparison.

## Leaderboards, exports, and routing review

```bash
curl -sS 'http://127.0.0.1:8000/v1/leaderboard?category=article&minimum_samples=3'
curl -sS 'http://127.0.0.1:8000/v1/leaderboard?category=article&format=csv' -o leaderboard.csv

universal-extractor leaderboard --category article --minimum-samples 3 \
  --csv leaderboard.csv --routing-output routing-review.json
```

Rankings include total and verified sample counts, mean verified score, a 95% margin when possible, success/failure rates, median latency, coverage, underlying backends, shared-backend warnings, and uncertainty. A fallback must use a different identifiable backend from the primary; wrappers around one backend are not counted as independent fallback evidence. Fewer than the requested verified samples cannot produce a recommendation. Routing output has `auto_apply:false`; v0.3 never modifies production routing.

Regression tracking compares only historical runs with the same URL, dataset version, category, and rubric. It records success-rate drops, latency increases over 30%, and final-score movements over five points. Engine and backend versions remain attached to results for diagnosis.

## Optional OpenAI API evaluator

Manual ChatGPT evaluation uses the interactive product and does not require API credits. Automated API evaluation is separately billed and disabled by default:

```bash
export OPENAI_API_KEY='...'
export ENABLE_OPENAI_EVALUATOR=true
export OPENAI_EVALUATOR_MODEL=gpt-5-mini
export OPENAI_EVALUATOR_MAX_OUTPUT_TOKENS=4000
```

Then request `"evaluation_mode":"openai"` with a verified reference. The adapter uses the official SDK, a per-call output-token cap, timeout, retries, and the same strict schema validation. No cookies, consumer ChatGPT automation, or undocumented endpoints are used. API cost budgets beyond the per-call output cap remain a future enhancement; keep the integration disabled unless explicitly intended.

## Add another extractor

1. Implement an async adapter returning `Extracted` in `src/universal_extractor/adapters/` and lazy-load heavy dependencies.
2. Add its production behavior only if desired; benchmark capability does not imply production routing.
3. Register category support, enabled/installed/version detection, backend provenance, and heavy status in `capabilities.py`.
4. Register the callable in `BenchmarkRunner.adapters`.
5. Add mocked eligibility, success, partial, failure, timeout, and security tests.
6. Document any shared upstream backend so wrappers are not interpreted as independent evidence.

## Limitations

- URL-level classification defaults generic sites to `article`; mark JavaScript-heavy dataset entries explicitly.
- RSS observations are process high-water marks, not isolated per-child peaks.
- Agent Reach backend provenance is recorded only when its result envelope identifies it.
- Web content changes over time; authorized snapshots and timestamps matter.
- SSRF checks are defense in depth, not a substitute for restricted egress/worker isolation on a public service.
- The lab does not bypass authentication, CAPTCHAs, paywalls, terms, or robots policies.
- No shipped real-world benchmark has been executed or scored.

The older `create_ai_review_bundle.py` and `compile_ai_reviews.py` scripts remain for v0.2 file compatibility. New experiments should use the SQLite-backed CLI/API workflow above.
