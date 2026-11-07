# RecallBox product requirements

Status: proposed product; repository inspection completed 7 November 2026 (Asia/Kolkata), baseline `c1ef5ed`. This document defines the full release scope. Intermediate slices are development milestones, not a reduction of the release target.

## Product and user outcome

A private Android and iOS memory library: save a URL, screenshot, PDF, video or note from a phone; recover its useful information later through search, collections, recipes, travel plans and learning queues. Processing must report its actual coverage, source and failure state. No fabricated transcripts, generated facts presented as extraction, fake accounts or simulated sync.

The primary deployment is a single MacBook Air M2, 8 GB RAM, residential network. This supports a measured, invite-only pilot before any wider release. Availability depends on this host, power and ISP. Processing happens locally except explicitly configured identity, HTTPS ingress, push transport and encrypted backup destinations. No paid AI API is approved.

## What exists today

| Capability | Actual implementation and limit |
|---|---|
| HTTP API / CLI | `universal_extractor/app.py`, `cli.py`; extraction and benchmark endpoints, no authentication or product tenancy |
| URL text | `service.py`, `fetcher.py`, `adapters/html.py`; bounded HTTP fetch, optional Trafilatura, preview-aware normalization |
| Rendered pages / platform readers / PDF | Optional Crawl4AI, Agent Reach and Docling adapters; installed availability and end-to-end operation on this checkout are unverified |
| Classification | `router.py`, `categories.py`; URL/domain/category heuristics for extraction, not semantic memory organization |
| Experiments | SQLite schema 3, append-only attempts/evaluations/scores, immutable hash-checked JSON artifacts, durable local benchmark recovery |
| Evaluation / export | Blinded manual review, optional explicitly enabled paid evaluator, CSV feature/outcome separation; no trained router |
| Full product | Accounts, mobile UI, product DB, media upload, OCR service, transcription service, embeddings, search, collections, actions, notifications, sync and deletion workflows are absent |

Historical reports describe earlier runs on another local path. Their results are historical evidence, not verification of this checkout. No benchmark store is present here; no initialization, migration or alteration of benchmark history was performed.

## Feature-to-system contract

All routes below are **proposed** under `/v1`; ownership always comes from the authenticated account. Each slice must work on two physical devices before its corresponding feature is called complete. Worker names are handlers in one deployment, not microservices. See [database design](RECALLBOX_DATABASE_DESIGN.md) for table definitions and [release gates](RECALLBOX_RELEASE_GATES.md) for dependencies.

| Feature / screen | API contract | Data | Worker / acceptance behavior | Slice |
|---|---|---|---|---|
| Welcome, sign in, account | `POST /auth/exchange`, `/auth/refresh`, `/auth/logout`; `GET /me` | users, identities, sessions | Real native browser identity flow, private account, logout and revocation work | S1 |
| Inbox, note editor, memory detail | `POST /memories`; `GET /memories`, `/memories/{id}`; `PATCH /memories/{id}` | memories, memory_revisions, idempotency_keys | Note persists after restart; optimistic edits reject stale versions | S2 |
| Add link, processing details | `POST /memories` with URL; `GET /jobs/{id}`; `POST /memories/{id}/reprocess` | memories, jobs, processing_runs, content_revisions | Save returns 202 with durable job; supported URL becomes source-attributed text; blocked/partial stays explicit | S3 |
| Native share sheet, offline outbox | Same create/upload APIs with stable client ID and idempotency key | device-local outbox, uploads, memories | Android intents and iOS extension receive text, files and multiple items; retry after app kill creates no duplicates | S4 |
| Screenshot and PDF import, attachment viewer | `POST /uploads`; `PUT /uploads/{id}/parts/{part}`; `POST /uploads/{id}/complete`; `GET /assets/{id}/content` | uploads, upload_parts, assets, content_revisions | Validate bytes and quotas; PDF text extraction/OCR and screenshot OCR retain page/bounding-box evidence; rotate/corrupt/encrypted inputs handled | S5 |
| Video import, transcript viewer | Same upload API; memory detail includes transcript segments | assets, content_revisions, processing_runs | Local transcription of permitted uploaded media, with timing/language; public captions only where actually supported; never claim a webpage is a transcript | S6 |
| Labels, organization suggestions | `GET /memories/{id}/labels`; `PUT /memories/{id}/labels` | labels, memory_labels, processing_runs | Deterministic rules plus local embedding label similarity; confidence/provenance visible, corrections persist, uncertain items remain unclassified | S7 |
| Search and filters | `POST /search` with query, filters and cursor | memory_chunks, embeddings, memories, labels | Owner-scoped keyword plus semantic retrieval, source snippets; unavailable embedding processing reported, keyword mode remains useful | S7 |
| Collections, saved/starred/archive | `GET/POST /collections`; `PATCH/DELETE /collections/{id}`; `PUT/DELETE /collections/{id}/memories/{memory_id}`; memory PATCH | collections, collection_items, memories | Per-user collection CRUD, item order and pin/archive persist and sync | S8 |
| Recipe detail, shopping list | `POST /actions` kind recipe; `PATCH /actions/{id}`; `PUT /actions/{id}/items/{item_id}` | actions, action_sources, action_items | Structured recipe ingredients/steps from source markup or explicit user entry; servings scaling and shopping checks are real; missing quantities remain missing | S9 |
| Travel board, itinerary editor | Actions routes with kind travel | actions, action_sources, action_items | User-selected places and source evidence, date/timezone-aware day ordering, editable schedule; no invented opening hours, transit times or bookings | S9 |
| Learning queue, progress | Actions routes with kind learning | actions, action_items, action_sources | Add/reorder/read/complete real saved materials; persist progress across devices; no fabricated teaching content | S9 |
| Reminders, notifications, settings | `POST /devices`; `DELETE /devices/{id}`; `GET/PUT /notification-preferences`; `POST/PATCH/DELETE /reminders`; `GET /notifications` | devices, preferences, reminders, notifications, outbox_events | Durable scheduler sends generic push, checks receipt, retries boundedly; permission denial and offline delivery have in-app fallback | S10 |
| Cross-device sync / sync status | `GET /sync?cursor=...`; writes carry expected version and client operation ID | sync_changes, device_sync_state | Cursor pagination, tombstones, replay and expired-cursor full refresh; no content disappears on conflicting edits | S2, S4, S11 |
| Privacy, export, deletion | `POST /exports`; `GET /exports/{id}`; `DELETE /memories/{id}`; `DELETE /me`; `GET /deletion-requests/{id}` | exports, deletion_requests, deletion_ledger, jobs | Re-auth for account delete/export; immediate logical removal, bounded physical purge including derivatives; encrypted backups expire on declared schedule | S11 |
| Feedback / report extraction | `POST /feedback`; `GET /feedback/{id}` | feedback | Persist issue linked only to owner's memory; submitting content for diagnosis requires separate explicit consent; never enters benchmark datasets automatically | S11 |

## Behavioral requirements

- Text, source URLs, original uploads and extracted representations stay distinct. Display full, partial, metadata-only, unsupported and failed coverage. Users can keep originals and fix labels even if processing fails.
- Native tabs: Inbox, Search, Collections, Actions; account/settings reachable consistently. Include empty/error/offline/loading states, accessible text scaling, screen-reader labels, dark mode, safe-area handling and keyboard behavior.
- Save confirmation means local durable capture or server durable acceptance; distinguish these states. Server acceptance requires metadata and job in the same transaction. Heavy work never runs inside an upload or save request.
- Offline access includes chosen cached memories and pending saves. The server remains authoritative for sync; local media retention is bounded and account-scoped. Logout clears account caches and queued operations after offering export/discard of unsent work.
- Automatic classification uses real local inference and conservative rules without router training. The full actions scope can be delivered with structured source parsing and interactive editors; unrestricted generative planning is not a release dependency. Any later LLM must have a separate quality, RAM and privacy decision.
- Search sees only current, non-deleted revisions. Completion of ingestion includes a sync event. Search indexing failure must not lose the saved item.
- Notifications carry an opaque identifier and generic text; open only after authentication. In-app durable status is authoritative; OS background execution and push arrival are not guaranteed.

## Proposed pilot limits and quality targets

These are initial budgets for measurement, not measured capacity or contractual guarantees. Default: 5 invited accounts; 100 saves/account/day; 3 pending heavy jobs/account; 20 pending jobs/account; 100 outstanding jobs globally; 1 GiB active media/account within a 5 GiB product media cap. Storage admission uses reservations and host free-space checks. Host shortage can override every account limit.

Text request limit 256 KiB, note 100,000 characters, URL 4,096 characters. Image 10 MiB / 25 megapixels, PDF 20 MiB / 50 pages, video 100 MiB / 10 minutes; at most 4 MiB per resumable upload part. Limits are enforced on actual bytes/decoded dimensions/duration as well as declarations. Safe rejection is part of functionality, not success disguised as a preview.

On an otherwise ready host, target metadata API p95 under 500 ms, scoped search p95 under 1 s on 10,000 memories, lightweight article processing p95 under 30 s excluding queue wait. OCR/transcription publish measured progress and estimated queue delay only after calibration. A pilot load run must validate these targets; exceeding them pauses invitations or changes the budget. Retain the complete feature target if rollout is delayed.

## Privacy and release definition

No scraped/private user content in application logs, analytics, Git, benchmark packets or model training by default. No personal browser cookies in workers. Explicit retention: incomplete uploads 24 hours; temporary scratch until job end with hourly stale cleanup; active originals until user deletion; logical deletion immediate, primary data/derivatives purge within 24 hours; backups expire within 30 days; minimal content-free security logs 30 days; deletion ledger 90 days to cover restore windows. State limitations honestly: server processing is not end-to-end encryption, and a trusted host operator can access decrypted data.

The complete release requires every table row above, both platforms, privacy/deletion/restore verification, isolated workers, measured host readiness and external ingress gates. Nothing in this PRD claims these features have been implemented. See [architecture](RECALLBOX_MOBILE_ARCHITECTURE.md), [hosting plan](MAC_M2_HOSTING_PLAN.md) and [release gates](RECALLBOX_RELEASE_GATES.md).
