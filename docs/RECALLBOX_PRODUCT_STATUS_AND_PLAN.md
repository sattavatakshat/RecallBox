# RecallBox — Product Delivery Control Center

**Updated:** 2026-11-15 (Asia/Kolkata)  
**Baseline:** main includes merged Sunday MVP PR #3, squash commit 7042e77702d39f8c95d48865723ce2cb9b450d9b  
**Purpose:** single engineering backlog and verification ledger, not a list of promises.

## Evidence and completion rules

- **Planned**: design/docs exist but runtime implementation does not.
- **Source implemented**: code is in main and reviewed; deployment and real behaviour may be unverified.
- **Static verified**: exact source revision passes syntax/type checks only.
- **Device verified**: actual signed-in operation observed on a native app with the real database/provider, and retained after restart.
- **Beta accepted**: relevant privacy, isolation, failure, recovery and host checks passed for invited users.
- Every item needs a commit/PR, observed PASS/FAIL/BLOCKED result, date, device/host configuration, and owner. No unobserved PASS.

Our product promise: **Save it once. Find it when it matters. Put it to use.** The extractor/benchmark lab is separate infrastructure, not a working RecallBox ingestion pipeline.

## Source inventory and remaining acceptance

| ID | Area | Current evidence | State | Main acceptance gap |
|---|---|---|---|---|
| RB-01 | Expo Android app, welcome and sign-in screens | Source in main; older emulator install/launch evidence | Source implemented | Current branch APK/device smoke |
| RB-02 | Auth0 native PKCE, refresh, logout, accounts | Product API/mobile source; Auth0 client setup recorded | Source implemented | Real callback, restoration/revocation and 2 real users |
| RB-03 | PostgreSQL + ownership/RLS | Migrations 0001/0002 previously applied locally | Partially verified | Apply 0003/0004 locally, owner isolation against live data |
| RB-04 | Notes CRUD, revisions, idempotency, conflict UI | Product API and editor code | Source implemented | Persist/restart/retry/conflict checks |
| RB-05 | Cursor sync, archive, starred | Source with signed cursor filters | Source implemented | Cross-device/reconnect/restart/tombstones |
| RB-06 | HTTP(S) link bookmark and open original | Sunday MVP branch merged | Source implemented | Save/open/restart and invalid-URL rejection |
| RB-07 | Case-insensitive literal keyword search | GET /v1/search and Expo search screen | Source implemented | Real owner-scoped search; no semantic claims |
| RB-08 | Private manual Collections and memberships | Migration 0004, API, Expo screens | Source implemented | Create/rename/add/remove/delete, 2-user checks |
| RB-09 | Shared native UI language | Warm paper/forest styling; basic screens | Source implemented | Compare with approved UX blueprint and real device |
| RB-10 | URL extraction framework | Separate Universal Extractor service/CLI and lab | Experimental tooling | Connect through isolated, secure processing worker |
| RB-11 | Native share receiver, offline outbox, instant save | Product vision only | Planned | Real Android share/retry after kill/offline |
| RB-12 | Durable processing jobs, status, evidence and finalized library | Product vision only | Planned | Source-attributed article result with honest partial/failure status |
| RB-13 | PDF and screenshot upload/OCR | Product vision only | Planned | Actual OCR content, bounded files, secure download |
| RB-14 | Embeddings, semantic retrieval, automatic label suggestions | Product vision only | Planned | Meaning-based retrieval and manual override |
| RB-15 | Video import and local transcript | Product vision only | Planned | Authorized local media, timestamps, bounded workload |
| RB-16 | Source-linked recipe, travel, learning actions | Product vision only | Planned | Editable, persistent, grounded action artefacts |
| RB-17 | Reminders/notifications | Product vision only | Planned | Permission-aware real device delivery and durable state |
| RB-18 | Export, account removal, purge, backup/restore | Product vision only | Planned | Complete per-user deletion and audited recovery |
| RB-19 | Public HTTPS ingress, host operation, iOS parity | Mac hosting plan and Expo source only | Planned | Private invitation rollout, both-platform proof |

**Static CI observed:** PR #3 head 4975c6c6ce349ad4f9f7a6f52ec6fbaec71a5b45 passed Python syntax and Expo TypeScript checks in GitHub Actions run 43692503937 on 2026-11-15. This does **not** prove migration, authentication, APK behaviour, access control or production readiness.

## Non-negotiable product and architectural decisions

1. **Instant Save UX**: acknowledge only durable local capture or server acceptance; clearly distinguish processing from finalized content. Do not show unfinished processing as a complete memory.
2. **Truthful ingestion**: always preserve URL/original, extraction status, source provenance, and partial/metadata-only/unsupported/error states. A social URL is not a video transcript.
3. **Automatic organization with manual override**: high-confidence metadata and labels can be proposed, but edits persist and never fabricate evidence.
4. **Actions are opt-in and source-grounded**: recipes, travel itineraries and study queues only claim information actually captured or entered.
5. **Privacy by architecture**: real Auth0 PKCE; owned user data, RLS, no leaking note content to benchmark lab, no public database/listener, safe worker network egress, quotas and deletion.
6. **Mac M2 / 8 GB constraints**: keep FastAPI/PostgreSQL lightweight; serialize memory-intensive extract/OCR/transcription tasks; measure actual RAM/disk and failures. No paid API is required for the product's core flow.
7. **Independent extractor**: maintain extraction engine API and benchmark dataset separately; integrate through a deliberately scoped ingestion worker. Defer ML router training until a verified ~1,000 URL benchmark dataset exists.
8. **Design authority**: RecallBox_Final_UX_Blueprint.md and RecallBox Final Claude Design.html plus approved UX choices; screen changes require parity review. No fake screens or decorative nonworking controls.

## Ordered delivery milestones

### M0 — Mainline stability and operator acceptance (P0; next)

**Build**: keep main green; inspect local uncommitted changes; back up product DB; apply additive migrations 0003_bookmark_links then 0004_collections; start local API with existing private Auth0/DB config; run read-only preflight; build/launch real Android native app.

**Manual acceptance**: real Auth0 sign-in/callback and refresh; note create/edit/delete/restart; URL save/open/validate; literal search; starred/archive; Collections CRUD and memberships; server restart; ambiguous network retry/idempotency; two accounts never see each other's IDs/lists/counts. Capture PASS/FAIL/BLOCKED with evidence, fix failures before calling this milestone done.

**Gate:** M0 accepted only on real provider + DB + Android runtime. Do not expose host publicly.

### M1 — Durable URL ingestion and processing (P0)

- Define memory source vs extracted revision vs processing job; add owned status APIs and bounded state transitions.
- Use an isolated worker adapter to call the independent Universal Extractor; enforce network egress/redirect/DNS controls before handling arbitrary URLs, without exposing open SSRF infrastructure.
- Persist original URL immediately, queue work durably, store real text/metadata with provenance; classify partial/unsupported/failed honestly and support retry/reprocess.
- Finalized Library only displays usable results; processing remains trackable separately.
- **Gate:** Chrome public article -> safe save -> real result -> reload/search; worker crash and URL denial don't lose saved originals.

### M2 — Native quick capture and offline resilience (P0)

- Implement Android share receiver for URL/text and a durable on-device outbox with client operation IDs; follow approved instant confirmation behaviour.
- Support app killed, expired token, offline retry, duplicate intents and logout cache boundaries.
- Extend to iOS share extension after Android path is reliable.
- **Gate:** Share a supported link from another app, kill app mid-flight, recover without duplicate records or false success.

### M3 — Search and automatic organization (P1)

- Add simple deterministic labels and manual override; integrate local embeddings/chunking for content actually extracted or typed.
- Combine owner-scoped lexical + semantic retrieval; show snippets, source and retrieval coverage. Preserve keyword-only fallback.
- **Gate:** find a saved Bandra restaurant without matching the exact saved title; never retrieve account B's data.

### M4 — Screenshot/PDF ingestion (P1)

- Add bounded upload/asset storage, checksums, quotas, secure download and private ownership.
- Use local OCR/PDF engines; retain page/provenance and accurate failure/partial states.
- **Gate:** imported screenshot and text/scanned PDF become searchable, with adverse-format/oversize and restart checks.

### M5 — Video and richer capture (P2)

- Support permitted user-uploaded media with bounded local Whisper transcription, timestamps and language/error state.
- Social URL metadata remains metadata-only unless actual authorized captions/content were obtained; never imply reel comprehension from a link.
- **Gate:** short supported video yields verified transcript and source; unsupported input is accurately rejected.

### M6 — Act on saved knowledge (P2)

- Three source-linked, user-approved modes: recipe + shopping checklist; destination shortlist + editable travel itinerary; reading/learning queue + progress.
- No fabricated ingredients, opening hours, transit metrics, or learning content.
- **Gate:** each action persists/reloads and remains independently editable.

### M7 — Reminders, preferences, full privacy/recovery (required for outside users)

- Device registration, timezone-aware reminders, push/in-app fallback, consent and access controls.
- Export, delete account, derivative purge, retry cancellation, cache clearing, backup expiry and tested restore/deletion ledger.
- **Gate:** deletion and restore cannot resurrect removed personal content; no notification leaks saved source text.

### M8 — Invite-only release and polish (not a public launch claim)

- Match approved mobile UX and accessibility states; validate both Android and iOS, loading/offline/error states and observable sync.
- Capacity/load/soak tests on actual Mac M2 host, encrypted backup restores, logs/alerts, safe HTTPS ingress, rate limits, resource limits.
- Invite a few friends only after privacy and access gates pass. Measure saves per user, usable processing rate, search success and actual retention; prioritize observed failures.
- **Gate:** independently installed signed-in mobile app passes the full product PRD and recovery checklist for its stated supported scope.

## Working rules to prevent scattered development

- Keep **one active vertical slice**; don't open unrelated implementation work until the active slice is accepted or explicitly blocked.
- For every new feature: issue/backlog ID -> short contract and acceptance -> implementation PR -> static checks -> manual smoke -> verified status update.
- Each slice records backend routes, migration, mobile UI, worker/integration, error/retry/privacy states and native acceptance. Omit irrelevant components only with explanation.
- Use small manual checks during prototype volatility; don't start an expansive automatic test-writing project. Add regression automation once contracts stabilize.
- Keep status rows above current as part of every feature PR; do not mark a feature done from a green typecheck.
- Review priority every milestone against a real saved-items task, not a vague percentage complete.

## Immediate operator action

Follow docs/RECALLBOX_SUNDAY_MVP_HANDOFF.md on the actual Mac, **after backing up local DB and reviewing git status**. Check out main (not the old draft branch); apply migration head 0004_collections; run secret-safe local preflight, API/Expo startup and the 11-step manual acceptance matrix. Record the results here. If full device acceptance is blocked by real credentials or host state, explicitly mark BLOCKED rather than silently advancing.

**Release status as of this update:** source merged to main; static CI green pre-merge; no current live-device acceptance, migration-0004 evidence, external access or beta launch claim.
