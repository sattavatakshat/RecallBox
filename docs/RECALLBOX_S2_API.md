# S2 note and synchronization contract

Additive migration head: `0002_memories`. All routes require the existing product
Bearer session and derive the owner from it. No owner_id field is accepted.
Only plain-text notes are supported; no extraction/job/media endpoints exist.
Request bodies are bounded at 256 KiB (auth remains 16 KiB). Content is 1–100,000
characters, cannot be blank, and title is at most 240 characters.

- `POST /v1/memories`, header `Idempotency-Key: <UUID>`, JSON `{title,content}`:
  returns 201 and `{id,kind,title,content,version,starred,archived,created_at,updated_at}`.
  The key is per owner/route, independent of session. Normalized validated payload
  hash mismatch returns 409 `idempotency_mismatch`. Identical retry returns the
  original version-one response, with no new note/revision/event. After deletion,
  replay returns 410 `memory_deleted` rather than resurrecting content. Keys are
  usable for 24 hours; expired retained keys return 409 `idempotency_expired`.
  No automatic cleanup/reuse of old keys during S2. A new key means a new intent.
- `GET /v1/memories?archived=false&limit=20&cursor=...`: returns
  `{items,next_cursor,sync_cursor}`. Summaries replace content with a 200-character
  preview. Maximum page size 50; recent-first `(created_at,id)` keyset order.
  Pagination cursor binds account, epoch, filter, creation high-water and anchor.
  New creations after that high-water are delivered by sync instead of shifting
  pages. Archive membership/current fields can change while paginating: use the
  initial sync_cursor to reconcile those changes. Keep the first-page sync cursor
  while fetching further pages; never advance it by loading a later list page.
- `GET /v1/memories/{id}`: live owned detail; absent, deleted and foreign IDs all
  return the same 404 `memory_not_found`.
- `PATCH /v1/memories/{id}`: JSON `{expected_version, title?,content?,starred?,archived?}`.
  At least one non-null editable field required. Returns updated detail. A stale
  version returns 409 `version_conflict` with the latest owned detail in
  `error.current`. Preserve the local draft and let the user reconcile. Identical
  no-op PATCH creates no new revision/event. Unknown/deleted/foreign remains 404.
- `DELETE /v1/memories/{id}?expected_version=N`: soft delete and content-free sync
  tombstone in one transaction; 204. A stale live version is 409; repeated delete
  of an already-deleted owned ID is 204. A foreign ID is always 404. Deleted notes
  disappear from every list/detail response. Revisions/primary text await the
  later reviewed physical purge lifecycle; soft delete is not physical erasure.
- `GET /v1/sync?cursor=...&limit=20`: returns
  `{changes,has_more,next_cursor}`. A change has a decimal-string `sequence` and
  either `{operation:'upsert',memory:<summary>}` or
  `{operation:'delete',id,version}`. Fetch while has_more, then retain next_cursor
  for the next poll. Omitting the cursor replays retained events from zero; it is
  not the recommended inbox bootstrap for an existing account.

Each write locks the user row, revalidates the session, updates memory + revision,
increments the user's transactional counter and inserts the matching sync event
before COMMIT. Unlike a bare PostgreSQL sequence, rollback does not consume/publish
that counter and no later committed cursor can skip an uncommitted earlier write.
Creation's durable idempotency row commits in the same transaction. All owned
links use composite FKs, RLS is enabled and forced, and runtime cannot update
immutable revision/event/retry rows or DELETE/TRUNCATE them.

Sync is a **current-state delta feed**, not historical content playback: each event
returns the entity's current version as of the request's repeatable-read snapshot.
Multiple changes may repeat the same current summary. Deleted entities produce
only tombstones even when replaying a pre-deletion event. Apply versions
monotonically and idempotently. Detail content is fetched separately. Poll batches
carry a fixed high-water until drained, then the next poll can observe newer work.

Bootstrap the mobile cache by loading the first inbox page and retaining its sync
cursor; load more pages with its next_cursor, merge summaries by ID/version and
apply changes from that first sync cursor. No memory metadata/content is persisted
on disk in S2. Caches and cursors are scoped to the authenticated account and
cleared by unmounting the authenticated provider on logout/account switch.
The app rechecks sync on foreground, focus and periodically while active.

Cursors are HS256 signed under a key derived for cursor use, bound to owner,
purpose and per-user epoch, and expire after 30 days. Tampered, cross-account or
wrong-purpose cursor returns 400 `invalid_cursor`; expired/rotated epoch or a
position below users.sync_floor returns 410 `cursor_expired`. Rebuild from a fresh
list page on 410; unsaved editor drafts stay separate and are not overwritten.
S2 retains events/tombstones; no destructive background retention service is
installed. Before an operator later prunes events, lock the user row, advance
sync_floor through the purged prefix in the SAME transaction and retain tombstones
for the agreed 30-day minimum. Rotate sync_epoch on a restore/reset. The runtime
cannot change epoch/floor. Device acknowledgements are not part of this stateless
contract, so device_sync_state is deliberately not introduced.

Read snapshots use PostgreSQL repeatable read; ownership context is SET LOCAL and
resets on commit/rollback. See [PostgreSQL isolation semantics](https://www.postgresql.org/docs/current/transaction-iso.html).
No real PostgreSQL execution or provider-authenticated acceptance is implied by
this contract; actual checks are recorded separately in the implementation guide.
