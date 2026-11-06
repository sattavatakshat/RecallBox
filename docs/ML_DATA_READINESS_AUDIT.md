# ML Data Readiness Audit

Audit date: 2026-11-05 (Asia/Kolkata). Project: Universal URL Extractor / Benchmark Lab v0.3. Scope: repository inspection, read-only inspection of the existing database, temporary sample records, in-process API/CLI verification, and execution of the unchanged existing test suite.

Only this report was added. No application code, scoring weights, automated tests, production routing, existing experiment records, or database schemas were changed. No live scrapes, paid AI calls, heavy extraction jobs, or dependency installations were performed. Temporary audit databases contained explicitly synthetic outputs and scores and were removed with their temporary directories.

## A. Executive summary

**Verdict: Partially ready. ML-readiness score: 45/100. Repair storage before collecting the planned 1,000-URL training corpus.**

The system really persists benchmark runs, one aggregated result per engine, output files, candidate identities, current AI evaluations, and current combined scores. Completed records survive a new database connection and a separate Python process. API and CLI benchmark paths both persist records. Missing AI scores remain NULL, distinguishable from legitimate zero scores. These are useful foundations for exploratory benchmarking.

However, it cannot currently reconstruct a complete, reliable historical training dataset six months later without potentially repeating scrapes. Repeated outputs are discarded, a later AI review overwrites the earlier review, artifact writes replace files without checksums or atomic publication, and settings/environment/features are not snapshotted. Cancellation can leave incomplete engine records. Scores lack immutable evaluation lineage, and leaderboard aggregation mixes engine versions and scoring contexts.

Some URL features can be derived later from the original URL, but historical engine availability, configuration, actual backend behavior, discarded repetition outputs, earlier reviews, and source bytes cannot be recovered from what is saved. An intact retained output can be reevaluated; a discarded or silently truncated output cannot be recovered.

## B. Current storage architecture

Default root: `.benchmark_lab`, resolved relative to the process working directory unless `BENCHMARK_DATA_DIR` is set. Running from another directory can therefore create a different database. Configuration is in [config.py](../src/universal_extractor/config.py:19).

Actual database: `.benchmark_lab/experiments.sqlite3`, SQLite schema `PRAGMA user_version=1`, WAL journal mode. There is no ORM or separate migration package. `ExperimentStore` owns schema initialization, connections, SQL, and artifact reads/writes: [experiment_store.py](../src/universal_extractor/experiment_store.py:24).

| Table | Key and purpose | Relationships / limitation |
|---|---|---|
| `benchmark_runs` | TEXT run ID; URL/category/status, dataset/rubric version, reference and timestamps | Parent experiment; no dataset entity or settings snapshot |
| `engine_results` | INTEGER ID; `UNIQUE(run_id,engine)` | FK to run; aggregates all repetitions into one row |
| `review_candidates` | Composite PK `(run_id,engine_result_id)`; unique candidate ID | Separate FKs to run and engine result; does not enforce that both belong to the same run |
| `ai_evaluations` | INTEGER ID; `UNIQUE(run_id,candidate_id)` | FKs to run/result, but candidate ID is not an FK; later imports UPDATE the same row |
| `scores` | Composite PK `(run_id,engine_result_id)` | FKs to run/result; stores current scores only; rubric is not part of the key |
| `regressions` | INTEGER ID; unique run/previous-run/engine/metric | No FKs for the two run IDs; replaced on recomputation |

Explicit indexes are `idx_runs_category(category,status)`, `idx_results_engine(engine,state)`, and `idx_scores_status(status)`, plus SQLite indexes created for primary/unique keys. There are no explicit URL/domain/dataset/engine-version history indexes. Schema definitions: [experiment_store.py](../src/universal_extractor/experiment_store.py:52).

Current relationship is:

```text
benchmark_runs
  ├─ engine_results (one aggregate per engine, NOT one row per repetition)
  │    ├─ artifact_path -> artifacts/<run_id>/<engine>.json
  │    ├─ review_candidates -> anonymous candidate ID
  │    ├─ ai_evaluations (one current row per candidate)
  │    └─ scores (one current combined result)
  └─ reference_artifact -> artifacts/<run_id>/reference.json
```

There is no artifact registry, extraction-attempt table, immutable deterministic-evaluation history, review-packet registry, or training-example table/exporter. `raw_adapter_output` means the adapter's already processed return value, not original HTTP HTML/PDF bytes or the complete external CLI/browser result.

Connections enable foreign keys, commit on successful context exit, and close on error (uncommitted writes roll back). SQLite transactions are per method; files, multiple AI rows, score recalculation, and run-status updates do not share one transaction. This leaves intermediate states possible: [experiment_store.py](../src/universal_extractor/experiment_store.py:35), [evaluation.py](../src/universal_extractor/evaluation.py:108).

### Existing persisted data, inspected read-only

- 1 benchmark run, 1 engine result, 1 candidate, 1 score, 0 AI evaluations, 0 regression rows.
- SQLite integrity check: `ok`. Foreign-key check: 0 violations.
- 1 referenced JSON artifact; readable; 0 orphan JSON files; 0 invalid run timestamps in this small sample.
- Existing artifact keys: `content`, `images`, `markdown`, `metadata`, `status`, `truncated`. It predates current `raw_adapter_output` / `normalized_output` additions and has no artifact schema version. Current code does not backfill these keys.
- Existing root permissions were `0755`; database `0600`. Current constructor would chmod the root to `0700`, but the read-only inspection did not invoke it against the real store. New temporary stores used current initialization.

This sample confirms stored legacy data remains readable, not that a large corpus is consistent.

## C. Field-level audit

Locations below use `R=benchmark_runs`, `E=engine_results`, `A=engine artifact JSON`, `V=ai_evaluations`, `S=scores`, `C=review_candidates`. `Partial` means nullable, derived, aggregated, adapter-dependent, or lacking the required provenance. TEXT JSON columns are not database-validated JSON. All timestamps are ISO-8601 UTC strings written by Python, with no database timestamp constraints.

### Benchmark experiment

| Field | Present? | Storage location | Data type | Gap |
|---|---|---|---|---|
| Unique run ID | Yes | R.id | TEXT PK | Random suffix gives unique executions; not a dataset case/content ID |
| Dataset ID | No | — | — | No independently identified dataset |
| Dataset version | Yes | R.dataset_version | TEXT | User-supplied string; no manifest hash |
| Original URL | Yes | R.url | TEXT | Full query can contain sensitive tokens |
| Normalized URL | No | — | — | E.final_url is a redirect result, not canonical input identity |
| URL domain | Partial | Derivable from R.url | — | No stored normalized hostname or registrable-domain split key |
| Content category | Yes | R.category | TEXT | Generic sites default to article; hint provenance not stored |
| Start timestamp | Yes | R.started_at | nullable TEXT | NULL before execution |
| Completion timestamp | Partial | R.completed_at | nullable TEXT | AI imports update this again; extraction/evaluation completion not separate |
| Benchmark status | Yes | R.status | TEXT | No DB enum CHECK |
| Configuration snapshot | No | R.repetitions/requested_engines_json only | INTEGER / TEXT JSON | Timeouts, limits, enable flags, minimum repetitions absent |
| Framework version | No | Runtime package only | — | Run does not persist code version, commit or dependency lock/hash |
| Reference availability | Partial | R.reference_artifact/reference_verified | nullable TEXT / INTEGER | Availability inferred; no immutable artifact identity/hash or verifier record |

### Extraction attempt

| Field | Present? | Storage location | Data type | Gap |
|---|---|---|---|---|
| Unique attempt ID | Partial | E.id | INTEGER PK | Identifies engine aggregate, not each repetition |
| Parent benchmark ID | Yes | E.run_id | TEXT FK | Correct parent FK on aggregate |
| Engine name | Yes | E.engine | TEXT | No normalized engine registry ID |
| Engine version | Partial | E.engine_version | nullable TEXT | HTML records BeautifulSoup version, not Trafilatura/HTTPX/code versions |
| Underlying backend/tool | Partial | E.backend; A.metadata | nullable TEXT / JSON | Selected representative only; unknown/shared provenance unresolved |
| Adapter configuration | No | — | — | No per-engine configuration snapshot/hash |
| Execution status | Yes | E.state | TEXT | Cancellation can leave RUNNING; runtime unsupported becomes FAILED |
| Start/end timestamps | Partial | E.started_at/completed_at | nullable TEXT | Engine aggregate only; repetition timestamps absent |
| Latency | Yes | E.latency_seconds; E.attempt_details_json | REAL / TEXT JSON | Aggregate median includes failed attempts; no persisted definition/version |
| Error type | Partial | Error string prefix in details | TEXT | Not a structured type/code |
| Sanitized error details | No | E.error / attempt detail error | TEXT | Truncated error strings are not redacted |
| Content extraction status | Partial | E.extraction_status / detail status | nullable TEXT / JSON | Main column NULL for failed/runtime unsupported outputs |
| Extracted character count | Partial | E.output_chars; detail raw_output_characters | INTEGER / JSON number | Counts already clipped adapter text; not original source size |
| Output artifact reference | Partial | E.artifact_path | nullable TEXT | One file for representative successful output; not every attempt |
| Resource measurements | Partial | E.cpu_seconds/rss_before_bytes/rss_after_bytes | nullable REAL/INTEGER | Process CPU/high-water RSS, not isolated per-attempt/child cost |
| Multiple engines | Yes | UNIQUE(E.run_id,E.engine) | Relational | Independent aggregates |
| Repeated executions | Partial | E.attempts/successes/attempt_details_json | INTEGER / TEXT JSON | Repetition outputs, identities, timestamps and per-attempt resource data discarded |

### Extracted content

| Field | Present? | Storage location | Data type | Gap |
|---|---|---|---|---|
| Raw extraction output | Partial | A.raw_adapter_output | JSON object | Current representative only; already adapter-processed; absent in legacy artifact |
| Normalized text | Yes | A.content / A.normalized_output.content | string | One selected output; subject to truncation |
| Markdown | Partial | A.markdown | string | HTML engine stores plain text here; structural Markdown not guaranteed |
| Title | Partial | E.title / metadata / raw payload | nullable TEXT/string | Adapter-dependent |
| Description | Partial | A.metadata.description / raw payload | string/null | Adapter-dependent |
| Author | Partial | A.metadata.author / raw payload | string/null | Adapter-dependent; Crawl4AI return drops author metadata |
| Publication date | Partial | A.metadata.published_at | string | HTML supports selected meta tags; no common date field/type |
| Images | Partial | A.images; raw/normalized output | array of URL strings | Crawl caps at 10; runner caps at 20 without omission flags |
| Image-associated metadata | No | — | — | Alt text, dimensions, captions, provenance omitted |
| Links | No | — | — | No link collection in common output |
| Source URL | Partial | R.url; E.final_url; raw payload.final_url | TEXT/string/null | No immutable fetch record or redirect chain |
| Content type | No | FetchResult only transiently | — | MIME not propagated into Extracted/storage |
| Language | No | No common field | — | No standardized language or detector version |
| Completeness status | Partial | extraction_status, artifact.truncated, AI completeness | TEXT/bool/REAL | Extracted is not proof of complete extraction |
| Content hash | No | — | — | Run/candidate ID hashes are NOT content checksums |
| Extraction provenance | Partial | Engine/backend versions, timestamps | mixed | No source snapshot hash, tool configuration, fetch headers, parser model version |
| Truncation metadata | Partial | A.truncated; review packet flags | boolean | Adapter truncation and image drops are silent; original lengths not retained |
| Stable artifact identity | Partial | Relative path | TEXT | Mutable filename; no artifact ID, digest, size/schema/version registry |

### Deterministic evaluation

| Field | Present? | Storage location | Data type | Gap |
|---|---|---|---|---|
| Metadata metric | Yes | S.metadata_score | nullable REAL | Aggregate only; no per-field comparison evidence |
| Extraction success/failure | Partial | E.state/successes/detail success | TEXT/INTEGER/bool | Metadata-only counts as success; distinguish from full-content success |
| Repeated reliability | Yes | E.attempts/successes; S.reliability_score | INTEGER / nullable REAL | Configured minimum not snapshotted; all failures have NULL score row components |
| Latency metric | Yes | E.latency_seconds; S.latency_score | nullable REAL | Definition and threshold live in code |
| Resource consumption | Partial | E resource columns | nullable numeric | Not part of persisted independent evaluation evidence |
| Metric calculation version | Partial | S.rubric_version | TEXT | No exact formula/config/code hash snapshot |
| Individual metric scores | Yes | S metadata/reliability/latency | nullable REAL | Latest values only |
| Scoring evidence | Partial | S.reasons_json, E details, reference metadata | TEXT JSON | Missing reasons exist; positive per-metric evidence absent |
| Missing metric indicators | Partial | NULL components; reasons_json | NULL / array | No structured missing-reason codes; subtotal can be zero with missing components |

### AI evaluation

| Field | Present? | Storage location | Data type | Gap |
|---|---|---|---|---|
| Evaluation ID | Yes | V.id | INTEGER PK | Identity retained while content is replaced on subsequent imports |
| Benchmark ID | Yes | V.run_id | TEXT FK | No composite constraint matching result/run |
| Attempt/candidate ID | Partial | V.engine_result_id/candidate_id | INTEGER FK / TEXT | Aggregate, not repetition; candidate has no FK |
| Evaluator type | Partial | R.evaluation_mode | TEXT | Request mode only; no per-evaluation manual/API field |
| Evaluator model | Partial | V.evaluator_model | TEXT | Default ChatGPT-manual denotes a channel, not a known model; no explicit unknown/null |
| Prompt version | Yes | V.prompt_version | TEXT | Arbitrary versions accepted; exact prompt/hash not stored |
| Scoring rubric version | Partial | R/S.rubric_version | TEXT | Not explicitly linked to V; incoming ratings have no rubric ID |
| Reference artifact ID | Partial | R.reference_artifact indirectly | nullable TEXT | No immutable reference ID/hash on each evaluation |
| Fidelity | Yes | V.fidelity | nullable REAL | 0–5 validated at API/model layer only |
| Completeness | Yes | V.completeness | nullable REAL | Same validation limitation |
| Structure | Yes | V.structure | nullable REAL | Same validation limitation |
| Grounding | Yes | V.grounding | nullable REAL | Same validation limitation |
| Total AI score | Yes | V.ai_score | nullable REAL | Computed 0–60; submitted original total not retained separately |
| Confidence | Yes | V.confidence | TEXT | low/medium/high; model validation only |
| Evidence/explanations | Yes | V.evidence_json/missing_json/unsupported_json/notes | TEXT JSON/TEXT | No durable review-packet hash or citations to exact artifact bytes |
| Evaluation timestamp | Partial | V.created_at | TEXT | Import time, replaced on reimport; source evaluation time unknown |
| Evaluation status | Yes | V.status | TEXT | Model validated, no database CHECK |
| Original AI response | No | — | — | No submitted JSONL/raw response artifact, response hash, API response ID/usage |
| Multiple reviews/history | No | Unique run/candidate + UPDATE | — | A second review overwrites the first |

### Final benchmark result

| Field | Present? | Storage location | Data type | Gap |
|---|---|---|---|---|
| Engine ID | Partial | S.engine_result_id -> E.engine | INTEGER FK / TEXT | No immutable engine build ID |
| Content category | Yes | Join R.category | TEXT | Available via parent |
| AI score | Yes | S.ai_score | nullable REAL | Current evaluation only |
| Deterministic score | Yes | S.deterministic_score | nullable REAL | Subtotal may exist while some components missing |
| Combined score | Yes | S.final_score | nullable REAL | Gated on required evidence; verified experimentally |
| Scoring eligibility | Partial | S.status/reasons_json; transient deterministic_complete | TEXT/JSON/bool | Complete flag not stored; no selection policy ID |
| Evaluation status | Yes | S.status | TEXT | Latest state only |
| Confidence/uncertainty | Partial | V.confidence; computed leaderboard margin/uncertainty | TEXT / runtime numeric | No immutable final-result confidence snapshot |
| Winner selection criteria | Partial | scoring.py code; optional routing JSON | code/JSON | No per-run winner record, candidate set or policy version |
| Dataset version | Yes | Join R.dataset_version | TEXT | No dataset membership/reference manifest identity |
| Scoring version | Partial | S.rubric_version | TEXT | Not in primary key; mixed contexts aggregated in leaderboard |

## D. Data flow and ML leakage audit

1. **Submission:** API validates request/syntax, creates R, then queues the ID ([app.py](../src/universal_extractor/app.py:75)). CLI benchmark creates R and awaits execution ([cli.py](../src/universal_extractor/cli.py:30)). Production `/v1/extract` and CLI `extract` return responses without writing benchmark data ([app.py](../src/universal_extractor/app.py:68), [cli.py](../src/universal_extractor/cli.py:144)); they are not a training-data collection path.
2. **Execution:** Runner revalidates DNS/URL, calculates current eligibility, writes skipped engine aggregates, and calls each enabled engine sequentially ([benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:42)). Availability is recomputed at execution, not snapshotted at submission.
3. **Repetitions:** Each engine is marked RUNNING before repetitions. Per-repetition status/latency/errors accumulate in memory. Only the highest-ranked first output is selected; later equal-status outputs are discarded. Data commits after all repetitions for that engine ([benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:85)).
4. **Artifacts:** File is written before final E update and candidate assignment. Current file contains selected raw adapter return and normalized fields; legacy files can lack them ([benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:139)). These are mutable JSON files, not preserved source responses.
5. **Metrics:** Current code calculates metadata correspondence, repeated success ratio and threshold-based median latency. Scores and missing reasons are upserted into S ([benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:175), [scoring.py](../src/universal_extractor/scoring.py:27)).
6. **AI review:** Candidate mapping goes to SQLite; blinded packet is generated on demand, caps text at 25,000 characters and drops URL query/fragment. Import validates IDs, ratings, total and reference/truncation claims, then upserts V and recalculates S ([evaluation.py](../src/universal_extractor/evaluation.py:40)). The exact packet and original score submission are not retained.
7. **Final results:** API returns SQL rows plus files. Leaderboard groups by category/engine only and computes recommendations in memory ([scoring.py](../src/universal_extractor/scoring.py:92)). It does not separate engine versions, datasets or rubrics. SQL preserves some versions, but the resulting pooled recommendation is not suitable as a historical training label.
8. **Future training examples:** No dedicated exporter exists. A custom query can join R/E/S/V and derive hostname/path features; missing configuration, source observations and historical review data remain unrecoverable.

### Features available before extraction versus outcomes

| Pre-extraction input | Current recoverability | Leakage rule |
|---|---|---|
| Original hostname, path length/depth, suffix, query shape | Derive from saved R.url | Redact values; preserve only approved features and normalization version |
| Registrable domain for grouped splits | Derive with a specified public-suffix policy | Hostname alone does not unify subdomains; keep normalization/list version |
| Platform/category | R.category and URL | Record whether category was manually supplied or inferred before extraction |
| Expected file/content type | URL suffix can be derived | Observed MIME after extraction must not be treated as an original URL feature |
| Initial HTTP metadata | Not saved | Optional safe preflight must be separately timestamped and available at routing time |
| Engine availability/configuration | Not snapshotted | Requested/skipped engine results are not a complete historical availability snapshot |
| Environment/framework metadata | Not saved per run | Capture Python/OS/architecture, resource budget, dependency/code versions |

Post-extraction labels are success, quality, AI completeness, metadata match, latency/resource cost, final score and selected winner. Keep these in an outcome export keyed by run/attempt ID. Never include `output_chars`, final URL, extracted title/body, AI scores, success counts, latency, error strings, or the winning engine in the model input table unless that exact observation is explicitly available in the intended routing stage.

A manual read-only projection of run ID, URL-derived domain/path length, category and requested engines contained no outcome columns. This establishes that a limited leakage-free projection is possible; it is **not** a shipped CSV/Parquet exporter and does not recover missing availability/configuration. Existing CSV output is leaderboard/legacy score aggregation only ([cli.py](../src/universal_extractor/cli.py:175)). There is no Parquet export.

Additional label concerns:

- `metadata_only` counts as successful execution, so current success rate cannot be labeled full-content success without reinterpretation of attempt details.
- Skipped engines are separated from failures at eligibility time. Runtime `unsupported` is recorded as FAILED with NULL aggregate extraction status, although detail JSON retains `unsupported`.
- Failed/cancelled runs are excluded from leaderboard queries, so a training export based only on leaderboard rows introduces selection bias ([experiment_store.py](../src/universal_extractor/experiment_store.py:303)).
- Repeated URLs count as separate leaderboard samples. There is no distinct-domain/URL coverage minimum; uncertainty does not account for correlated repetitions, shared references, datasets or reviewers.
- Dataset CLI automatically treats any supplied reference artifact as verified and drops expected limitations from stored experiment metadata ([cli.py](../src/universal_extractor/cli.py:70)). Human verification requires stronger provenance.

## E. Verification evidence

No automated test case was created or changed. Existing suite was run once as requested: `.venv/bin/pytest -q` → **44 passed in 0.69s**. That confirms existing expectations, not the additional audit requirements. Existing tests cover basic independent execution, score import and fixtures but do not establish immutable multi-review history or per-repetition output preservation.

Manual probes used inline Python, temporary stores and tiny injected local adapter functions. API requests used HTTPX ASGI transport in process; CLI verification called actual command dispatch with an injected local runner. DNS/network extraction was bypassed only in these temporary probes. This was not a real socket-server or live-platform test. One initial CLI probe attempted nested `asyncio.run`; that verification harness failed, then CLI dispatch was successfully repeated outside the active event loop. No product defect is inferred from that harness error.

| Requirement / probe | Actual observation | Assessment |
|---|---|---|
| Persistent benchmark creation | Run row present after execution and reconnection | Verified |
| Multiple engines and repetitions | HTML called 3 times; Crawl4AI-local failure function 3 times; Docling skipped | Verified isolation |
| Success/failure retention | Separate COMPLETED/FAILED/SKIPPED rows; three detail entries each for executed engines | Verified aggregates, not complete attempt records |
| Repetition output retention | Repetitions returned distinguishable content; only repetition 1 content retained | Gap reproduced |
| Artifact recovery | Stored normalized/raw output recoverable from temporary file | Verified current format |
| AI import via API | HTTP 200; stored numeric AI zero; combined score 40 with all deterministic evidence | Verified using synthetic zero ratings only |
| Missing versus zero | Before import AI/final scores NULL; after zero import AI exactly 0 | Verified |
| Identical score reimport | One AI row after two identical imports | No duplicate row; timestamp is still rewritten |
| Second independent review | Later model/rating retained; row count remains 1; earlier review gone | Gap reproduced |
| New process/reconnection | Separate Python process queried 1 run and 1 evaluation in temporary database | Verified committed persistence |
| History query by engine/category/version | Joined query returned the three engine aggregate records and dataset version | Query possible; full review/repetition history missing |
| Feature-only projection | URL-derived domain/path/category projection contains no outcome fields | Possible manually; built-in exporter absent |
| Missing artifact | Reader raises `ValueError` | Detectable on access |
| Corrupt JSON artifact | Reader raises `JSONDecodeError` | Detectable on access |
| Valid JSON content substitution | Modified file accepted with no checksum error | Integrity gap reproduced |
| Repeated artifact filename | Same path overwritten; earlier content unavailable | History loss reproduced |
| Adapter truncation | Plain-text parser returned 80 characters from 1,000; no truncation field | Silent truncation reproduced |
| Run/result consistency | Candidate for run B accepted an engine result belonging to run A | Relationship gap reproduced |
| Parent FK | Inserting engine result with nonexistent run rejected | Verified ordinary FK enforcement |
| Invalid values via SQL | Negative attempts/latency and invalid timestamp accepted in temporary store | Missing DB constraints reproduced |
| Error sanitization | Synthetic token marker retained in stored error | Redaction gap reproduced; no real secret used |
| Review URL redaction | Synthetic token from URL query absent in packet | Verified this limited redaction only |
| Prompt version | Unknown prompt version accepted by score API (HTTP 200) | Compatibility not enforced |
| API persistence | POST 202; worker completed; results 200; new store read COMPLETED | Verified local route/background persistence |
| CLI persistence | Actual benchmark command dispatch committed COMPLETED record | Verified with local adapter |
| Cancellation while adapter active | R=CANCELLED, E=RUNNING, attempts=0, no E completion timestamp | Inconsistent lifecycle reproduced |
| Concurrent DB writes | Four threads committed eight independently identified runs | Basic SQLite write serialization verified; not same-run/process contention |

Not experimentally verified: OS kill/power failure, full backup restore, disk-full behavior, multiple API workers recovering the same job, live browser/PDF subprocess cleanup, actual ChatGPT/API scoring, CSV round-trip as training data, and Parquet export. Crash/recovery risks below are code-level findings unless explicitly listed above.

## F. Prioritized gap analysis

### P0 — Data loss and invalid relationships

1. **P0-1: Reviews and scores overwrite history.** `UNIQUE(run_id,candidate_id)` and AI UPSERT replace ratings, evidence, model, prompt and timestamp; score UPSERT replaces the final result. A second review cannot coexist with the first. [experiment_store.py](../src/universal_extractor/experiment_store.py:82), [experiment_store.py](../src/universal_extractor/experiment_store.py:263), [experiment_store.py](../src/universal_extractor/experiment_store.py:287). Reimport avoids duplicate rows but is not an immutable, auditable idempotent operation.
2. **P0-2: Per-repetition outputs and in-flight evidence are lost.** Only one representative survives; all attempt details stay in memory until the engine finishes. A crash/cancellation before then loses completed repetition measurements, and restart reruns already completed engines rather than appending attempts. [benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:90), [benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:113), [experiment_store.py](../src/universal_extractor/experiment_store.py:253). Active cancellation demonstrably leaves E RUNNING under a CANCELLED parent.
3. **P0-3: Artifact publication is mutable and not atomic.** Direct `write_text` truncates/replaces existing paths; no digest/size or file/DB transaction, so interruption can corrupt files or orphan them. Valid JSON substitution is undetectable. [experiment_store.py](../src/universal_extractor/experiment_store.py:146). Reference is written before its run INSERT, creating another orphan window ([experiment_store.py](../src/universal_extractor/experiment_store.py:127)).
4. **P0-4: Independent FKs allow incorrect run/result/candidate combinations.** Actual cross-run candidate insertion succeeds. AI candidate ID lacks an FK; scores do not enforce run/result pairing; regressions lack run FKs. Normal API import checks mitigate some paths but cannot guarantee database consistency. [experiment_store.py](../src/universal_extractor/experiment_store.py:75).
5. **P0-5: Silent upstream truncation prevents future reconstruction.** HTML, Crawl4AI, Agent Reach and Docling slice text before the runner sees its original length. Runner's downstream flag can consequently be false even after source data loss. Image limits also omit counts/flags. [adapters/html.py](../src/universal_extractor/adapters/html.py:18), [adapters/crawl.py](../src/universal_extractor/adapters/crawl.py:23), [adapters/agent.py](../src/universal_extractor/adapters/agent.py:23), [adapters/documents.py](../src/universal_extractor/adapters/documents.py:36).

### P1 — Training-critical features, labels, provenance and versioning

1. **P1-1:** No submission-time domain/features/config/environment/availability snapshot, dataset ID/manifest hash, framework build identity, or adapter config. Settings are only current process state ([config.py](../src/universal_extractor/config.py:10)); eligibility/version reporting is current runtime state ([capabilities.py](../src/universal_extractor/capabilities.py:47)).
2. **P1-2:** Evaluation lineage lacks rubric/reference/packet hashes, evaluator type, exact prompt, original response and input/output versions. Unknown manual model is not represented separately. Incoming arbitrary prompt versions are accepted ([benchmark_models.py](../src/universal_extractor/benchmark_models.py:55), [evaluation.py](../src/universal_extractor/evaluation.py:83)). Each score write uses the current rubric constant, while conflict updates do not update the stored rubric field, so future rescoring could overwrite values under a stale version tag ([experiment_store.py](../src/universal_extractor/experiment_store.py:287)).
3. **P1-3:** Score history and leaderboard context are insufficient: category/engine grouping pools dataset/rubric/build versions. No durable per-case winner/selection policy; zero score sorts using `value or -1`, treating a valid zero as missing for ordering ([scoring.py](../src/universal_extractor/scoring.py:122)).
4. **P1-4:** Incomplete label semantics: metadata-only counts as success; runtime unsupported becomes failure; no common completeness/language/MIME/links/image-metadata schema. Raw source bytes/full external envelope are absent ([models.py](../src/universal_extractor/models.py:33), [benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:108)).
5. **P1-5:** Sensitive content is not sanitized before storage/export. Dropping the top-level URL query does not scrub candidate/reference text, metadata, source notes, signed image URLs, exception strings or private session content. Synthetic error-token retention was reproduced. Store permissions are useful, but not a redaction/consent/retention system ([evaluation.py](../src/universal_extractor/evaluation.py:40), [benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:122)).
6. **P1-6:** No database CHECKs for status/score ranges, nonnegative counts/latencies, JSON or timestamp order; direct store inputs bypass Pydantic. Import saves each review separately before rescoring, so a partial write/compute failure can leave stale scores. Imports are not restricted to finished runs ([evaluation.py](../src/universal_extractor/evaluation.py:72)).
7. **P1-7:** Recovery queues at most `queue_size` historical jobs; no worker refill from persisted backlog. Shutdown marks active run CANCELLED (not resumable RUNNING) but leaves its result RUNNING; recovery sets all RUNNING results PENDING regardless of parent. Multiple API workers/CLI processes have no run claim/lease, so same-run execution can overwrite files. Single-worker sequentiality applies only within one manager ([benchmark_runner.py](../src/universal_extractor/benchmark_runner.py:214), [experiment_store.py](../src/universal_extractor/experiment_store.py:253)).
8. **P1-8:** Reference verification is a boolean assertion and dataset CLI sets it automatically. No reviewed-by/reviewed-at, immutable revision or permission evidence; mutation or source changes cannot be audited ([cli.py](../src/universal_extractor/cli.py:70)).

### P2 — Storage and analytics improvements

- Add a feature-only and separate outcome CSV exporter with schema versions; optional Parquet later without adding a heavy dependency during this audit.
- Add artifact inventory/repair/quarantine reports, backup/restore procedure, disk quota, explicit retention/consent policy, and orphan reconciliation. There is no total storage-growth bound.
- Add run/engine-version/domain/dataset/rubric indexes, bounded result pagination and timestamp validation. Repeated file reads are not an integrity monitor.
- Preserve positive metadata comparison evidence, explicit missing-value reason codes, source byte counts, and resource-measurement scope. Current process CPU excludes external child CPU; high-water RSS does not measure each job's incremental memory.
- Version persisted artifacts, review packets, feature normalization/public-suffix policy and decision policy independently from the package version.

## G. Recommended schema changes and migration sequence

These are concrete proposals only. **No migration was executed.** Keep SQLite and existing extraction interfaces; use versioned, additive tables and append-only evidence. Back up the DB together with artifacts before any later migration, including a WAL-consistent SQLite backup.

### Proposed schema v2: experiment and input snapshots

Add nullable fields to `benchmark_runs` (NULL for legacy unknowns, never fabricated):

```sql
ALTER TABLE benchmark_runs ADD COLUMN dataset_id TEXT;
ALTER TABLE benchmark_runs ADD COLUMN dataset_manifest_sha256 TEXT;
ALTER TABLE benchmark_runs ADD COLUMN normalized_url TEXT;
ALTER TABLE benchmark_runs ADD COLUMN url_hostname TEXT;
ALTER TABLE benchmark_runs ADD COLUMN registrable_domain TEXT;
ALTER TABLE benchmark_runs ADD COLUMN config_snapshot_json TEXT;
ALTER TABLE benchmark_runs ADD COLUMN environment_snapshot_json TEXT;
ALTER TABLE benchmark_runs ADD COLUMN framework_version TEXT;
ALTER TABLE benchmark_runs ADD COLUMN code_revision TEXT;
ALTER TABLE benchmark_runs ADD COLUMN extraction_completed_at TEXT;
ALTER TABLE benchmark_runs ADD COLUMN evaluation_completed_at TEXT;
```

Create `run_input_features(run_id PK/FK, schema_version TEXT, captured_at TEXT, features_json TEXT CHECK(json_valid(features_json)), availability_json TEXT CHECK(json_valid(availability_json)), preflight_json TEXT NULL, provenance_json TEXT)`. Freeze this before extraction; store query shape, not secret values. Preflight HTTP data is optional, with explicit stage/timestamp and safe header allowlist. Add `datasets(id,version,manifest_sha256,created_at, PRIMARY KEY(id,version))` and `dataset_cases(dataset_id,dataset_version,case_id,normalized_url,reference_artifact_id,permissions_json,limitations_json)`.

### Proposed schema v3: immutable attempts and artifacts

Create the following tables alongside the old aggregate tables:

- `extraction_attempts(id TEXT PK, run_id TEXT FK, engine TEXT, engine_version TEXT NULL, adapter_version TEXT NULL, backend TEXT NULL, backend_version TEXT NULL, repetition_index INTEGER, execution_generation INTEGER, config_json TEXT, state TEXT CHECK(...), extraction_status TEXT CHECK(...), started_at TEXT, completed_at TEXT NULL, latency_seconds REAL CHECK(latency_seconds>=0), error_type TEXT NULL, error_code TEXT NULL, sanitized_error TEXT NULL, output_chars INTEGER CHECK(output_chars>=0), resource_json TEXT, UNIQUE(run_id,engine,execution_generation,repetition_index), UNIQUE(run_id,id))`.
- `artifacts(id TEXT PK, relative_path TEXT UNIQUE, sha256 TEXT, byte_size INTEGER CHECK(byte_size>=0), schema_version TEXT, kind TEXT, content_type TEXT NULL, created_at TEXT, privacy_status TEXT, original_chars INTEGER NULL, stored_chars INTEGER NULL, truncated INTEGER CHECK(truncated IN(0,1)), truncation_reason TEXT NULL, CHECK(stored_chars IS NULL OR original_chars IS NULL OR stored_chars<=original_chars))`.
- `attempt_artifacts(attempt_id TEXT FK, artifact_id TEXT FK, role TEXT, PRIMARY KEY(attempt_id,artifact_id,role))`.
- `reference_revisions(id TEXT PK, artifact_id TEXT FK, verified INTEGER, verified_by TEXT NULL, verified_at TEXT NULL, source TEXT, permissions_json TEXT, metadata_json TEXT, content_sha256 TEXT)`.

Normalize artifact payloads to include source/final URL, text/Markdown, metadata, language/MIME if observed, structured images/links, completeness, hashes, and provenance. Use explicit null/unknown for unavailable fields. Keep raw output only where authorized; preserve redaction records. Write each repetition immediately, use immutable digest-based filenames and temporary-file + flush/fsync + atomic rename publication. File and DB cannot share an atomic transaction: use STAGED/AVAILABLE artifact states and restart reconciliation. Journal interrupted attempts as INTERRUPTED/CANCELLED rather than erasing them.

Legacy `engine_results` rows may become aggregate views, but existing data must be preserved. Do not invent three complete attempt rows from an aggregate count of three: migrate available detail entries with `legacy_incomplete=true`, link the representative artifact only where justified, and mark discarded outputs unavailable. Backfill missing raw fields as unknown.

### Proposed schema v4: evaluation and result history

- `rubrics(id TEXT PK, version TEXT, definition_json TEXT, definition_sha256 TEXT UNIQUE)`; preserve existing weights.
- `review_packets(id TEXT PK, run_id TEXT FK, artifact_id TEXT FK, prompt_version TEXT, prompt_sha256 TEXT, rubric_id TEXT FK, created_at TEXT)`.
- `review_packet_candidates(packet_id TEXT FK, candidate_id TEXT, run_id TEXT, attempt_id TEXT, artifact_id TEXT FK, reference_revision_id TEXT NULL FK, PRIMARY KEY(packet_id,candidate_id), FOREIGN KEY(run_id,attempt_id) REFERENCES extraction_attempts(run_id,id))`.
- `ai_evaluation_events(id TEXT PK, packet_id TEXT, candidate_id TEXT, evaluator_type TEXT CHECK(evaluator_type IN ('manual','api','unknown')), evaluator_model TEXT NULL, prompt_version TEXT, prompt_sha256 TEXT, rubric_id TEXT FK, reference_revision_id TEXT NULL FK, fidelity REAL NULL CHECK(fidelity BETWEEN 0 AND 5), completeness REAL NULL CHECK(completeness BETWEEN 0 AND 5), structure REAL NULL CHECK(structure BETWEEN 0 AND 5), grounding REAL NULL CHECK(grounding BETWEEN 0 AND 5), ai_score REAL NULL CHECK(ai_score BETWEEN 0 AND 60), confidence TEXT, evidence_json TEXT, status TEXT, raw_response_artifact_id TEXT NULL FK, submitted_at TEXT NULL, imported_at TEXT, idempotency_key TEXT UNIQUE, FOREIGN KEY(packet_id,candidate_id) REFERENCES review_packet_candidates(packet_id,candidate_id))`.
- `deterministic_evaluation_events(id TEXT PK, attempt_id TEXT FK, rubric_id TEXT FK, calculation_version TEXT, reference_revision_id TEXT NULL FK, metrics_json TEXT, missing_json TEXT, evidence_json TEXT, created_at TEXT)`; use `deterministic_evaluation_attempts(evaluation_id,attempt_id)` when a reliability evaluation covers multiple attempts, preserving its exact input set.
- `final_result_events(id TEXT PK, run_id TEXT FK, engine TEXT, rubric_id TEXT FK, ai_evaluation_id TEXT NULL FK, deterministic_evaluation_id TEXT NULL FK, ai_score REAL NULL, deterministic_score REAL NULL, combined_score REAL NULL CHECK(combined_score BETWEEN 0 AND 100), eligible INTEGER, status TEXT, confidence_json TEXT, missing_json TEXT, selection_policy_version TEXT, created_at TEXT)`. Require a verified evidence chain before any combined score.
- `winner_decisions(id TEXT PK, run_id TEXT FK, policy_version TEXT, selected_result_id TEXT NULL FK, compared_result_ids_json TEXT, reason_json TEXT, created_at TEXT)`; insufficient candidate coverage yields no winner.

Idempotency key should hash canonical submitted content plus packet/candidate/evaluator/rubric identity (with an explicit evaluation-session ID if intentionally preserving two identical independent reviews). Same import returns the original event without changing its timestamp; changed review creates a new event. Keep current-result views with an explicit latest/adjudicated selection policy. Preserve original submissions with privacy controls and retain all historical scores.

Migrate existing AI rows once as legacy events; earlier overwritten reviews cannot be recovered. Require packet/reference hashes for new verified events. Old rows without those hashes retain `legacy_unbound` provenance and should not silently qualify for fully verified training labels. Add composite parent constraints when linking run, candidate and attempt; use actual run FKs in regression events.

### Proposed indexes and operational rules

```sql
CREATE INDEX idx_runs_dataset_domain
 ON benchmark_runs(dataset_id,dataset_version,registrable_domain,created_at);
CREATE INDEX idx_attempt_engine_version
 ON extraction_attempts(engine,engine_version,run_id,started_at);
CREATE INDEX idx_attempt_run_state ON extraction_attempts(run_id,state);
CREATE INDEX idx_ai_candidate_history
 ON ai_evaluation_events(packet_id,candidate_id,rubric_id,imported_at);
CREATE INDEX idx_final_context ON final_result_events(rubric_id,engine,run_id,created_at);
```

Use explicit migration functions keyed by user_version; initialization is currently CREATE IF NOT EXISTS, which cannot evolve existing table columns or constraints. Commit all score-import event inserts/result selection in one transaction once artifacts have been safely staged. Add job claims/leases before supporting multiple processes; recovery must refill the bounded worker from persisted pending work and skip immutable completed attempts. Do not mutate a stored rubric definition when code defaults change.

### Export contract for future training

Produce two explicitly separate, versioned exports joined by run/attempt IDs:

1. `input_features.csv`: IDs, pre-extraction URL features/domain, category/source, availability/config/environment snapshot identifiers; no output-derived fields.
2. `outcomes.csv`: per-attempt statuses and measurements, evaluation/reference/rubric IDs, verified quality components, optional final score, winner policy/result ID, missing-label reasons.

Keep failed/unsupported/interrupted/skipped records with distinct meanings. Split by registrable domain and time/dataset as appropriate; pin engine version and evaluation context. Parquet may later serialize the same contract. Metadata presence and real numeric zero must remain distinct from missing evidence. Include a manifest with row counts, checksums, schema versions, filtering rules, and data provenance. No training pipeline is proposed here.

## H. ML-readiness score and decision

This is an engineering audit rubric, not a benchmark-quality score. Each category awards partial credit for implemented and inspected behavior; it does not imply statistical validation from the one real experiment.

| Dimension | Maximum | Awarded | Evidence and deductions |
|---|---:|---:|---|
| Data completeness | 20 | 12 | Runs, aggregate metrics, outputs and missing scores persist; no full repetition/source history or complete content schema |
| Referential integrity | 15 | 9 | Real PKs/FKs/unique constraints, WAL and transactions; cross-run links and artifact relationships incomplete |
| Evaluation provenance | 15 | 6 | Component ratings, confidence, evidence, model/prompt strings; overwritten reviews and missing immutable packet/reference linkage |
| Reproducibility | 15 | 5 | Dataset/rubric/selected engine versions and times; no settings/environment/source hashes, true migration history or immutable results |
| Training feature suitability | 15 | 5 | URL/category derivable; no frozen feature/availability snapshots, distinct-domain coverage or leakage-safe export contract |
| Exportability | 10 | 3 | JSON API, blinded JSONL and aggregate CSV; no per-attempt feature/outcome CSV/Parquet dataset exporter |
| Security and data quality | 10 | 5 | URL checks, local storage permissions, model validation, malformed artifact detection; missing checksums/redaction/quotas/DB validation |
| **Total** | **100** | **45** | **Partially ready** |

Recommendation: continue tiny exploratory runs only if their limitations are acceptable. Before the 1,000-URL collection, fix P0 history/attempt/artifact/relationship/truncation issues and P1 experiment snapshots, evaluation lineage and label semantics. Then validate the repaired storage with temporary records and a small controlled collection before scaling.

**Answer to the six-month question:** the current store can reconstruct some aggregate results and reevaluate an intact representative output. It cannot reliably reconstruct all training examples without rerunning scrapes because information is already discarded or overwritten at collection time. Repairing storage before collection avoids irreversible gaps; training a model now is not part of this audit.
