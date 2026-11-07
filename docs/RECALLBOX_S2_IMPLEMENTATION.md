# S2 implementation and manual verification

7 November 2026, Asia/Kolkata. Baseline: requested main merge `3005dec`.
**S2 code is implemented; real PostgreSQL/provider/device acceptance is BLOCKED.**
No authentication success, database execution or cross-device success is claimed.

## Location and commits

Branch: `feat/s2-memories-sync`. Implementation worktree:
`/tmp/recallbox-s2-worktree`.

The primary checkout changed concurrently from the S2 branch to older local main,
and dependency files were staged there. Work continued in an isolated worktree;
that checkout/index was not reset, unstaged, merged or overwritten. Three unchanged
untracked source copies created by this session during the checkout change were
removed after their committed worktree copies were verified byte-for-byte. S2
commits remain durable in the repository even if the temporary worktree is removed.
Open the worktree in the IDE to review/run S2; the primary checkout is not S2.
Do not blindly switch its branch while unrelated staged work remains.

Implementation commits:

- `a67613b7`: additive database migration and runtime readiness checks.
- `edf35e51`: private note CRUD, revisions, optimistic writes and durable creation retries.
- `22918020`: signed, account-bound incremental sync and API contract.
- `24bd392b`: mobile inbox, creation/detail, conflict handling and sync client.
- The final verification commit contains this guide, README linkage and a
  cancellation-handling fix for a queued sync when its account provider unmounts.

Nothing was pushed or deployed by this task. No host database packages, services,
security settings, public tunnel, paid API or ML integration were installed/enabled.

## Functionality implemented

Migration `0002_memories` adds memories, immutable memory_revisions, durable
idempotency_keys and sync_changes. Existing users gain sync_epoch/sync_floor.
Composite FKs enforce ownership, all four new tables have forced RLS, and runtime
has no DELETE/TRUNCATE/DDL or update access to revisions/events/retry records.
A stateless cursor contract does not require device acknowledgements, so no
unused device_sync_state table was introduced. S1/benchmark SQLite is unchanged.

Authenticated API routes create/list/read/edit/delete plain notes and sync changes.
Every write rechecks the existing session while holding the user's row lock. The
same transaction commits the note, revision, per-user counter, event and (on
create) retry record. Stale edits/deletes return an owned conflict response;
foreign/deleted IDs cannot be read. Idempotent creation retries return the original
result, detect changed bodies and do not resurrect deleted notes. Lists paginate
recent-first with signed account/filter/snapshot anchors. Sync has replay,
pagination, tombstones and cursor expiry/epoch/floor handling. See the exact
[API and consistency contract](RECALLBOX_S2_API.md).

Mobile now opens the private Inbox after sign-in. It includes recent note cards,
empty/error/loading states, pagination, pull-to-refresh, real star/archive actions,
an archive view and account navigation. Creation shows persistence confirmation
only after the API returns a committed result. A request's UUID/key/body are frozen
when an ambiguous save fails, so retry sends the same intent. Editing and deletion
use expected versions; conflicts show the current server note alongside the local
draft, with explicit merge-base/replace choices. Leaving a dirty draft warns first.
Deletion requires confirmation. No memory content is written to disk in S2; drafts
are in-memory and do not survive process death or deliberate discard.

The existing S1 OIDC/session flow is reused. Its client now exposes an authorized
operation wrapper, ignores stale account responses, guards refresh completion
across account changes and reuses the existing single-flight refresh. Foreground
session restoration keeps authenticated navigation mounted so it cannot erase an
editor draft. A keyed authenticated memory provider clears all cached summaries,
cursors and queued work on logout/account change. Sync runs on inbox focus,
foreground and every 15 seconds while active. List/sync/local-write requests are
serialized to avoid stale response overwrites; summaries merge monotonically by
version. Expired cursors rebuild the inbox without replacing editor drafts.

## Host and external blockers

- PostgreSQL server, psql, pg_ctl and pg_config were absent from PATH; no installed
  PostgreSQL/pgvector Homebrew opt/Cellar entries or Postgres.app were found.
  Installing a supported native ARM64 PostgreSQL and its matching pgvector build,
  then provisioning a loopback service/database/roles, is required. Those are host
  package/service changes and were reported before proceeding; not performed.
- No RECALLBOX provider/database environment configuration was supplied. A real
  provider and public native client IDs/redirects remain required. No credentials,
  synthetic login endpoint or accepted fake identity were introduced.
- Approximately 17 GiB free disk remains below the existing 30 GiB pilot gate.
  No models, containers, OCR/browser services or large native toolchain downloads.
- xcode-select still points to CommandLineTools rather than full Xcode. No
  physical-device access/native build or actual Google/Apple login was verified.
  S1 Apple/Google compatibility/link-ownership and npm advisory gates remain open.

## Manual checks actually performed

No automated test files were written/modified and no test suite was run. Negative
HTTP probes used in-process ASGI without lifespan and ephemeral unprovisioned
identity configuration solely to inspect failure behavior. They did not issue an
accepted login/session or substitute for a database. Cursor checks are component
checks, not authenticated cross-account data acceptance.

| Check | Outcome |
| --- | --- |
| Requested baseline | Fetched origin/main at 3005dec before creating S2 branch |
| Python syntax/imports | Product modules and both migrations parse; note model imports succeed |
| Alembic history | 0001_s1 → 0002_memories resolves as a single additive head |
| SQL generation | Fresh full migration and S1→S2 offline SQL generated successfully; not executed |
| Auth boundary | All six S2 method/path combinations return 401 without authentication |
| Private API boundary | /docs and /v1/benchmark return 404; universal_extractor absent from sys.modules |
| Minimal health | In-process /v1/health 200, only status=ok; no readiness claim |
| Input validation | Blank note, owner injection, explicit null edit, empty patch and boolean version rejected |
| Request byte limits | Auth POST >16 KiB rejected 413; memory POST/PATCH >256 KiB rejected 413 |
| Cursor helpers | Valid roundtrip; cross-account, tamper and wrong-purpose rejected 400; expiry/epoch change rejected 410 |
| Real lifespan with closed local DB port | Startup refused rather than using fallback storage |
| Mobile TypeScript | npm run typecheck PASS |
| Android JavaScript export | Metro/Hermes bundle PASS; no native installation/launch claim |
| iOS JavaScript export | Metro/Hermes bundle PASS; source map confirms all S2 routes/store were included |
| Benchmark preservation | No diff under src/universal_extractor or benchmarks against 3005dec |
| Git whitespace | git diff --check PASS |

Native dependency versions/lockfile remain those of S1; no new dependencies were
added. Existing JavaScript dependencies were reused locally by a temporary ignored
symlink for typecheck/bundling, then the symlink was removed. Exported bundles and
source maps are temporary verification artifacts outside Git, not release builds.

### Acceptance requiring real PostgreSQL and authenticated sessions

All following checks remain **BLOCKED**, with no successful synthetic substitutes:

1. Fresh S1 migration, seeded S1→S2 upgrade, pgvector readiness and runtime grant audit.
2. Start a ready product API at 127.0.0.1:8001 with actual DB/provider configuration.
3. Create a note; restart API; retrieve identical persisted note.
4. Edit/star/archive; confirm revision + sync event commit; stale PATCH/DELETE gives 409.
5. Concurrent identical create retries yield one note/revision/event; mismatched body 409.
6. Actual keyset list pages, concurrent page mutations and sync reconciliation.
7. Delete; list/detail suppression; replay only content-free tombstones; retry cannot resurrect.
8. A/B adversarial probes across all methods, SQL RLS/ownership FKs and pooled context reset.
9. Sync replay/pagination/high-water, cross-account cursors over HTTP and expired-cursor recovery.
10. Concurrent user transactions/rollback demonstrate commit-safe sequence behavior.
11. Two-device foreground sync, draft preservation/conflict merge and logout/account-switch isolation.
12. Native builds, screen visual/accessibility QA and real secure session persistence on both platforms.

## Exact local commands

After approved PostgreSQL/pgvector installation, use the
[S1 setup guide](RECALLBOX_S1_IMPLEMENTATION.md) to provision the dedicated database,
roles, extension and real OIDC clients. Do not run role bootstrap again against an
existing populated DB. S2 does not relax S1's credential validation. Keep migration
credentials outside the API process and both files outside Git, mode 0600.

For an independent environment in this worktree:

```sh
cd /tmp/recallbox-s2-worktree
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-product.lock
uv pip install --python .venv/bin/python --no-deps -e .
# Inject only RECALLBOX_MIGRATION_URL from the private migration environment.
.venv/bin/alembic upgrade head
unset RECALLBOX_MIGRATION_URL
# Inject real API configuration from a separate private environment.
.venv/bin/recallbox-api
```

The product CLI binds 127.0.0.1:8001, one worker, 1–3 pool connections. To use the
already-installed Python runtime during local worktree development instead:

```sh
cd /tmp/recallbox-s2-worktree
PYTHONPATH="$PWD/src" /Users/akshat/Desktop/RecallBox/.venv/bin/python -m uvicorn recallbox.app:create_app --factory --host 127.0.0.1 --port 8001 --workers 1 --no-access-log --no-proxy-headers
```

Both startup alternatives still require a real migrated DB and provider config.
No successful listener startup was claimed in this environment.

```sh
cd /tmp/recallbox-s2-worktree/apps/mobile
npm ci
# Configure real public provider/client/API variables in .env.local.
npm run typecheck
npm run ios           # requires full compatible Xcode, signing/device
npm run android       # requires compatible SDK/JDK and connected device
npm start             # localhost development-client Metro; no public tunnel
```

Do not change the API bind to solve phone connectivity. Use the existing S1
approved local-device connection requirements; real iPhone access still needs an
approved secure path. No release cleartext-network bypass is added.

## File manifest

Created:

```text
migrations/versions/0002_memories.py
src/recallbox/cursors.py
src/recallbox/memories.py
src/recallbox/problems.py
src/recallbox/sync.py
apps/mobile/src/memories.tsx
apps/mobile/app/(account)/account.tsx
apps/mobile/app/(account)/new.tsx
apps/mobile/app/(account)/memory/[id].tsx
docs/RECALLBOX_S2_API.md
docs/RECALLBOX_S2_IMPLEMENTATION.md
```

Modified: src/recallbox/app.py, src/recallbox/db.py,
apps/mobile/src/api.ts, apps/mobile/src/session.tsx, apps/mobile/src/ui.tsx,
apps/mobile/app/(account)/_layout.tsx, apps/mobile/app/(account)/index.tsx, README.md.
The old account screen is now account.tsx and the group's index is the Inbox.
No extractor, private SQLite, benchmark, automated test or dependency-lock changes.

## Remaining limits

S1 and S2 acceptance remain blocked until the listed live checks pass. Server
soft-deleted text/revisions and retry/sync rows are retained in S2; physical purge
and deletion/backup semantics still belong to the later privacy slice. A future
retention task must advance sync_floor transactionally before pruning an event
prefix, retain agreed tombstones, and rotate epoch after restore. No unbounded
background cleanup or future processing service is introduced here. Production
admission/durable abuse limits and independent security review remain pre-ingress
work. Full offline drafts/outbox/share ingestion remain S4, URL extraction S3.
