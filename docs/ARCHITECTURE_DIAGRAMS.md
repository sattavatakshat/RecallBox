# Implemented data flows (schema 3, history layout from schema 2)

## A. System architecture

```mermaid
flowchart LR
 U[Public URL] --> API[FastAPI or CLI]
 API --> SEC[URL and DNS validation]
 SEC --> C[Category and platform]
 C --> R{Execution path}
 R -->|extract| P[Production fallback router]
 R -->|benchmark| B[Durable independent-engine runner]
 P --> E[HTML / Crawl4AI / Agent Reach / Docling]
 B --> E
 E --> N[Normalized result and clipping metadata]
 N -->|benchmark| S[SQLite + immutable JSON artifacts]
 S --> Q[Frozen blinded review packet]
 Q --> AI[Manual ChatGPT or explicitly enabled API]
 AI --> I[Validated append-only import]
 I --> S
 S --> D[Deterministic metrics and score events]
 D --> L[Version-separated leaderboard]
 S --> X[Separate features / observations / labels export]
```

## B. Independent engines and repetitions

```mermaid
flowchart TD
 A[Persist run and pre-extraction snapshots] --> Q[Bounded queue / durable backlog]
 Q --> CLAIM[Acquire local SQLite benchmark claim]
 CLAIM --> CHECK[Revalidate URL; calculate availability]
 CHECK --> SKIP[Persist ineligible engine as SKIPPED]
 CHECK --> ENG[Next eligible engine, sequentially]
 ENG --> REP[Persist unique RUNNING attempt for next repetition]
 REP --> CALL[Adapter with timeout and cancellation watcher]
 CALL --> OK[Raw adapter result and normalization]
 CALL --> ERR[FAILED / TIMEOUT / CANCELLED / INTERRUPTED]
 OK --> ART[Publish immutable artifact + hash/size registry]
 ART --> FIN[Commit terminal attempt and private candidate binding]
 ERR --> FIN
 FIN --> AGG[Derive compatibility engine aggregate]
 AGG -->|more repetitions| REP
 AGG -->|more engines, even after success| ENG
 AGG -->|all finished| MET[Persist deterministic/combined score events]
 MET --> WAIT[Await evaluation or finish unevaluated run]
```

## C. AI scoring and history

```mermaid
flowchart LR
 AT[Attempt] --> OA[Immutable output artifact]
 OA --> CB[Private candidate binding]
 REF[Immutable reference artifact] --> PK[Freeze blinded packet + exact prompt]
 CB --> PK
 PK --> CHAT[Manual ChatGPT JSONL]
 PK --> OPT[Optional official API structured output]
 CHAT --> VAL[Validate identity, rubric, prompt, evidence, totals]
 OPT --> VAL
 VAL --> KEY{Import identity already exists?}
 KEY -->|yes| OLD[Return original evaluation ID]
 KEY -->|no| HIST[Append evaluation event + original normalized submission]
 HIST --> SEL[Latest review of representative attempt]
 HIST --> ALL[Full history retained for every attempt]
 DET[Measured repetitions + metadata + latency] --> COMB[Evidence-gated combined score]
 SEL --> COMB
 COMB --> SE[Append score event; update current projection]
 ALL --> EXP[Historical labels export]
 SE --> LEAD[Context-separated leaderboard]
```

## D. Cancellation and recovery

```mermaid
stateDiagram-v2
 [*] --> QUEUED
 QUEUED --> RUNNING: worker obtains claim
 RUNNING --> AWAITING_EVALUATION: extraction finished
 RUNNING --> COMPLETED: evaluation_mode none
 RUNNING --> FAILED: run-level error
 RUNNING --> CANCELLED: explicit cancel flag
 RUNNING --> INTERRUPTED: shutdown / abandoned process
 INTERRUPTED --> QUEUED: restart finds no live owner
 AWAITING_EVALUATION --> COMPLETED: all candidate reviews received
 CANCELLED --> [*]
 COMPLETED --> [*]
 FAILED --> [*]
 note right of INTERRUPTED
   Active attempt becomes INTERRUPTED.
   Previous terminal attempts/artifacts remain.
   Resume creates a new attempt only for unfinished repetition.
 end note
```

Attempt states additionally distinguish COMPLETED, PARTIAL, FAILED, TIMEOUT and SKIPPED. A successful HTTP/API call is not proof of complete or high-quality extracted content.
