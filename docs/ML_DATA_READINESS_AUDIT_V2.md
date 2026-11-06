# Storage hardening readiness reassessment

Date: 2026-11-05, Asia/Kolkata. Baseline: [original audit](ML_DATA_READINESS_AUDIT.md), 45/100. Final schema: 3. This report distinguishes implemented repairs, temporary synthetic verification and actual public-source observations.

## Verdict

**86/100 — ready for controlled collection of new experiments with explicit reference/review provenance.** The demonstrated P0 storage defects are repaired for new data. Historical information already discarded before hardening remains unavailable and is marked legacy/unknown; it must not be represented as complete training evidence.

Proceed with a staged collection, retaining the immutable store and artifacts together. Curate authorized references and perform real blinded reviews before treating observations as verified labels. The live beta observations have no AI labels or final 100-point scores. They demonstrate storage/execution behavior, not an engine-quality leaderboard or a validated ML router.

No automated test was created, edited, refactored or run during this implementation task. No ML training, frontend, paid AI evaluation, social login activation or dependency installation was performed. Scoring weights are unchanged.

## Repairs against the original audit

| Original issue | Root cause | Implemented repair and primary files | Actual verification | Remaining limitation |
|---|---|---|---|---|
| P0: later reviews overwrite history | Unique run/candidate UPSERT replaced evidence | `evaluation_events` append-only with session-aware idempotency; `storage_v2.py`, `evaluation.py`, `benchmark_models.py` | Two distinct reviews retained; first row unchanged; duplicate import returned same ID | Legacy overwritten reviews cannot be recovered |
| P0: repeated outputs discarded | One representative aggregate, repetition details buffered in memory | `extraction_attempts`; persist each execution/output immediately; `benchmark_runner.py` | Three HTML repetitions yielded three distinct recoverable outputs; three failed competitor attempts also retained | Interrupted in-memory work is recorded as interrupted, not fabricated as completed |
| P0: mutable/corrupt artifacts | Stable filename replaced by write_text; no registry hash | UUID artifacts, fsync, atomic no-replace publication, SHA-256/size registry, read checks; `storage_v2.py` | Valid JSON byte change rejected; files/read-only history registry protected; integrity scans clean | Power-failure and disk-full fault injection were not performed |
| P0: cross-run relationships accepted | Independent FKs failed to validate full context | Composite candidate/run/attempt/artifact FKs, plus context triggers through score/reference/snapshot chain; migrations 2/3 | Cross-run binding rejected by SQLite; foreign-key checks clean | Direct administrative file/DB replacement remains outside application guarantees |
| P0: silent truncation | Adapter slicing occurred before runner length checks | Each adapter reports original/stored lengths, limit, representation/reason; runner clipping is explicit; `models.py`, `adapters/*`, runner | 1,000-character plain-text source clipped to 80 with explicit metadata | Original complete source bytes are not universally archived; no clipping does not prove semantic completeness |
| P1: configuration snapshot missing | Only current environment and engine selection available | Immutable limits, flags, repetitions, selection, rubric definition and dataset settings in run_snapshots | Snapshot recovered with run and referenced by attempts | Explicit user-supplied dataset identities still require disciplined curation |
| P1: environment/availability missing | Runtime checks not saved | Python/OS/architecture, package/tool/browser-cache versions and framework code hash captured | Snapshots inspected; final new snapshot includes these fields | Unknown browser/model/backend versions stay unknown; cached browser build is not proof of exact runtime binary |
| P1: pre-extraction features missing | Outcomes and URL were only reconstructable inputs | Immutable feature JSON with stage/timestamp/domain/path/category/platform/availability; `storage_v2.py` | Separate feature CSV has no output/count/latency/score columns | No HTTP preflight is collected; MIME/HTTP fields are explicitly null |
| P1: cancellation/recovery incomplete | Only parent run terminalized; engine details buffered | Active attempt terminalization, durable transitions, killable Docling child, Agent Reach cleanup, bounded backlog refill, local claims; runner/adapters | First completed output survived cancellation of repetition 2; dead-owner recovery preserved INTERRUPTED row and added COMPLETED replacement | Local PID claims are single-host; abrupt power-loss, PID reuse and multi-host operation not validated |
| P1: no training exporter | Only aggregate leaderboard CSV existed | Feature/observation/evaluation/derived-score CSVs plus checksummed manifest; `data_export.py`, CLI | Actual CLI export: 7 feature rows, 25 observations, 0 AI labels; filters/provenance/null indicators verified | Parquet optional on existing pyarrow; no new dependency installed |
| P1: evaluation lineage incomplete | No retained packet/reference/response or score input set | Frozen packet/prompt artifact, exact attempt/output hashes, reference binding, normalized and original sanitized submissions, rubric/calculation versions and immutable score history | Synthetic zero and 60-point AI reviews produced distinct retained derivations; unknown model persisted null | Real ChatGPT review is external/manual and remains pending |

Additional P1 repairs from the full audit:

- Numeric/JSON/timestamp checks and cross-context guards protect new writes. AI scores require valid dimensions, totals, evidence, compatible prompt/rubric and finished extraction. Unknown manual model information is NULL.
- Imports and score-history derivation use one SQLite transaction. Exact duplicate reimports do not mutate the original evaluation timestamp or identity.
- Current compatibility summaries remain mutable projections; authoritative attempts, artifacts and evaluations reject historical mutation. Old table rows are archived once with legacy provenance.
- Recovered work skips already terminal repetitions. A bounded worker polls the persisted backlog. A database-wide local benchmark claim prevents concurrent benchmark jobs; the shared in-process resource lock also serializes heavy production extraction against benchmark adapters.
- Credential-bearing query parameters are rejected for persisted benchmarks; conservative recursive redaction applies to stored output/error/submission data. No arbitrary environment variables or browser credentials are snapshotted.
- Dataset reference files default to unverified rather than becoming ground truth automatically. Reference permissions, limitations and manifest identity are retained where supplied.
- Metadata-only execution is PARTIAL and does not count as full-content success. Runtime unsupported output is SKIPPED. Timeout and failure remain distinct at attempt level.
- Leaderboards separate engine version, dataset and rubric contexts and require multiple verified distinct URLs for recommendations. Numeric zero is not sorted as missing. Regression comparisons now exclude runs created after the run being compared.
- Artifact inventory identifies missing/corrupt files, broken legacy references, unregistered files, unused registry entries and interrupted staging files. Artifact quota failures are explicit; no retention job deletes evidence.
- Agent Reach's modern `items` envelope is normalized correctly; YouTube/Bilibili `read` is metadata-only. Video transcript completeness is never inferred from a webpage fetch.

## Preservation, migration and rollback evidence

Actual main database: `.benchmark_lab/experiments.sqlite3`; artifacts `.benchmark_lab/artifacts/`.

Pre-change backup: `storage-backups/20261105T101347069562Z/`. SQLite backup API was used; artifacts were copied and checksummed. Backup database integrity returned `ok`; every manifest checksum matched. Restore was verified in a new temporary directory and migrated there before upgrading the actual store.

Original table counts: benchmark_runs 1; engine_results 1; review_candidates 1; scores 1; ai_evaluations 0; regressions 0. Original row values were compared against the backup after migration and remained identical. Four original records were archived in legacy_records. Original artifact bytes were registered without rewriting them.

Migration 2 creates additive history/snapshot/artifact tables and integrity controls. Migration 3 adds further snapshot/timestamp/packet/reference/score-context/rating guards. Both are logged. Final main-store schema is 3; SQLite integrity is `ok`; foreign-key violations are zero. Main history still contains its original single experiment; live verification used a separate store.

Automatic migration backups additionally reside under each data root's `backups/` directory. [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) gives backup/rollback instructions. Restore into a new directory after stopping workers; never replace a live WAL store or discard post-backup observations. Current code upgrades old copies automatically, so use pre-hardening code if inspecting the unupgraded v1 layout.

## Manual verification evidence

Temporary smoke work used local injected adapter functions and temporary databases; all synthetic ratings were explicitly identified as storage probes and removed with those directories. They were not added to the live store or presented as actual AI judgments. No automated test files were added or changed.

| Check | Observation |
|---|---|
| Run and independent attempts | Three successful HTML and three failed competitor attempts persisted independently |
| All repetition outputs | Three distinct content artifacts recovered |
| Review history | Two different evaluations present; first row unchanged |
| Duplicate import | Same evaluation ID returned; no duplicate review event |
| Missing versus zero | Unreviewed AI/final scores NULL; synthetic valid AI zero retained; later synthetic 60-point review produced 100 only with all required reference/deterministic evidence |
| Cross-run mismatch | SQLite rejected candidate/attempt/artifact mismatch |
| Immutability | Attempted SQL UPDATE of evaluation history rejected |
| Artifact corruption | Changed bytes, including syntactically valid data, caused an integrity error |
| Truncation | Original 1,000 / stored 80 / limit 80 / reason content_limit recorded |
| Reconnection/process | Fresh separate Python process read six attempts and two review events |
| Cancellation | Parent CANCELLED; attempts COMPLETED then CANCELLED; first artifact retained |
| Recovery | Dead-owner attempt became INTERRUPTED, run QUEUED, resume added a new COMPLETED attempt without erasing old evidence |
| API fixture smoke | POST benchmark 202; results/history routes 200 with persisted attempts |
| Actual API restart | Earlier live run still returned HTTP 200 with its four attempted/skipped engine records |
| Original endpoint | Real `/v1/extract` HTML call returned 200/extracted for example.com |
| CSV export | Feature columns exclude AI/final score, content lengths and durations; observations retain failure/null/provenance fields |
| Compilation | All source modules compiled successfully |

No claim is made that OS-kill/power-loss recovery, distributed execution, disk-full restoration, new automated regression cases or the paid evaluator were tested. The initial audit's 44 passing tests are historical evidence, not a test-suite result for this changed implementation.

## Controlled public-source batch

Data root: `beta-evidence/live-v2/`, separate from the main store. All eligible engines ran independently and sequentially. The initial five cases used one repetition, 25-second adapter timeouts and 12-second fetch timeouts. Each case recorded four engine decisions including category skips. No login, CAPTCHA/paywall bypass or paid AI call was used.

| Source | Actual observation |
|---|---|
| `https://example.com` | HTML completed: 156 characters, about 0.27 s. Crawl4AI completed: 952 characters, about 3.11 s. Agent Reach failed with upstream certificate validation errors. Docling skipped |
| Python tutorial index | HTML completed: 2,299 characters, about 0.24 s. Crawl4AI completed: 21,937 characters, about 0.69 s. Agent Reach reported upstream provider failures/cooldown. Docling skipped |
| `https://quotes.toscrape.com/js/` | HTML metadata-only/PARTIAL, no body text. Crawl4AI completed: 1,665 characters, about 2.41 s. Agent Reach provider unavailable. Docling skipped |
| W3C public dummy PDF | Docling TIMEOUT at about 25.16 s; process terminated. Other engines skipped. Successful PDF conversion remains unverified under this resource budget |
| YouTube `BaW_jenozKc` | Agent Reach reported video unavailable. HTML/browser page text was captured, but this is not verified video/transcript content |
| Replacement YouTube `jNQXAC9IVRw` | Public metadata available via `yt-dlp`; envelope inspection exposed normalization gap, which was repaired without changing past artifacts |
| Final metadata normalization check | `br-7b075fbc2f-4346886c41eb`: Agent Reach PARTIAL / metadata_only, backend yt-dlp, title “Me at the zoo”; content scope explicitly says captions were not requested |

Some first-batch observations predate the final Agent Reach normalization and guard refinements; their captured code hashes/provenance and original bytes were preserved. They are not rewritten as though collected by the later implementation. Text length and `COMPLETED` indicate returned extraction, not verified content fidelity.

Final live-store inspection: 7 runs, 25 attempt/skip observations, 19 registered artifacts, no real AI evaluation events. Integrity inventory returned no hash/size errors, missing references, orphan/staged files or foreign-key violations, and no running attempts. These are tiny beta samples, not statistical evidence for an engine recommendation.

Actual review packet for manual ChatGPT use:

```text
beta-evidence/live-v2/youtube-normalized-review.jsonl
beta-evidence/live-v2/SCORING_PROMPT.txt
```

The article/JavaScript/static JSONL packets and `live-results.json` are in the same directory. Packets without references support provisional review only. There is no fabricated reference, real AI score or fully verified leaderboard entry.

Actual final CLI export: `training-exports/live-final-v3/manifest.json`. It describes 7 feature rows, 25 attempt observations, 0 evaluation events, 25 derived-score events and 19 artifact inventory entries. Configuration/environment snapshots are included in feature rows; artifact inventory retains reference/packet/output identity, path and hash lineage. Raw failures, skips, pending labels and versions are retained. Derived scores have missing final-score components; they are not verified labels. Earlier export revisions are preserved too.

## Revised readiness score

Same dimensions and maxima as the original audit:

| Dimension | Maximum | Original | Revised | Reason for remaining deduction |
|---|---:|---:|---:|---|
| Data completeness | 20 | 12 | 17 | Complete source bytes and semantic completeness are not universally available; legacy discarded outputs remain missing |
| Referential integrity | 15 | 9 | 14 | Strong new composite/trigger constraints; legacy schema retained with marked provenance |
| Evaluation provenance | 15 | 6 | 14 | Frozen packets, references and append-only events; real external human/model identity still depends on supplied review provenance |
| Reproducibility | 15 | 5 | 12 | Settings/code/dependency snapshots and durable attempts; live sites/access conditions/model artifacts can change; power-loss restore untested |
| Training feature suitability | 15 | 5 | 13 | Timestamped separate features/domain grouping; HTTP preflight fields absent and category hints still require disciplined use |
| Exportability | 10 | 3 | 8 | Working CSV contract/manifest; Parquet depends on optional existing pyarrow and is not claimed verified |
| Security and data quality | 10 | 5 | 8 | Checksums, constraints, atomic publication, redaction and quota; generic PII detection, isolated child resource accounting and public-service network containment remain limited |
| **Total** | **100** | **45** | **86** | **Controlled collection ready; verified training labels still require real references/reviews** |

No demonstrated new-data critical history-loss issue remains open. The score does not assert that legacy data is repaired retroactively or that the extraction engines work reliably across all public sources. Run a curated pilot before the 1,000-URL collection, use enough repetitions and actual authorized references, and inspect failed/partial attempts rather than dropping them.

## Run and reproduce

```bash
cd "/Users/akshatjain/Desktop/Recall Box/universal-url-extractor"
source .venv/bin/activate
export BENCHMARK_DATA_DIR="$PWD/.benchmark_lab"
export ENABLE_CRAWL4AI=true ENABLE_AGENT_REACH=true ENABLE_DOCLING=true
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

Submit a controlled URL (replace with your authorized source):

```bash
curl -sS -X POST http://127.0.0.1:8000/v1/benchmark \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","engines":"all_eligible","repetitions":3,"evaluation_mode":"manual","dataset_version":"pilot-v1"}'
curl -sS http://127.0.0.1:8000/v1/benchmark/RUN_ID/results
curl -sS http://127.0.0.1:8000/v1/benchmark/RUN_ID/history
```

Export, manually review and import actual scores:

```bash
universal-extractor export-review RUN_ID review.jsonl --prompt-output prompt.txt
# Review with ChatGPT; save its actual strict JSONL response as scores.jsonl.
universal-extractor import-scores RUN_ID scores.jsonl
universal-extractor storage-integrity
universal-extractor export-data training-exports/new-pilot --dataset-version pilot-v1
```

Read [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md), [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) and [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for module responsibilities, diagrams, constraints, migrations and safe rollback. The temporary verification servers were stopped after the checks.
