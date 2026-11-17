# RB-13 Collection Detail

## Existing implementation audit

- RB-12 already creates real collections, opens the existing `collection/[id]` route, and refreshes counts on returning from a collection. Its owner-scoped list counts active memberships joined to nondeleted memories.
- Detail previously rendered every returned row inside a ScrollView, used loaded-row length as the count, and had no way to retrieve records beyond its bounded response (mobile requested 100; server default was 50, maximum 100).
- Membership PUT already locks the collection, validates memory ownership, and uses a unique owner/collection/memory key. Repeating PUT on an active membership is a no-op; restoring a removed membership updates its addition time. DELETE removes only membership. Collection deletion is soft and does not delete memories.
- Rename/delete already require the collection version. Names are trimmed, limited to 80 characters and unique case-insensitively within an owner's active collections.
- The existing Add to Collection route supported memory-to-collection and collection-to-memory modes, but only individual Add buttons, no search or multi-selection, and an enrichment-readiness filter that hid durable originals.
- RB-06 MemoryCard already supplies real titles, source/type, saved dates, and honest source placeholders. There is no verified thumbnail API.
- Memory Detail already preserves its preceding route for ordinary Back. Its delete action previously hardcoded Library; it now returns to the preceding destination when possible.
- The old collection trip CTA selected a single source using topic/title heuristics. It was removed from this surface; evidence-based source actions and their trip APIs remain in Memory Detail.
- Existing RB-11 uncommitted changes were present before implementation in Organize, account layout, TypeScript configuration, organization helpers, tests and documentation. They are excluded from the RB-13 commit.

## Visual implementation

The existing route now has a compact Collections back control and collection action menu, real multiline DM Serif Display title, total count, compact outlined Add saved items action, and virtualized shared MemoryCard rows with separate overflow controls. Empty collections show “Nothing here yet.” and the requested copy, with a primary Add action. No wordmark, avatar, bottom tabs or FAB is introduced.

All typography, ivory/forest backgrounds, text, lime accents, spacing, radii, dividers and controls use RB-DS-01. There are no new design tokens, fonts, icon libraries, dependencies or fabricated media. Placeholders intentionally follow RB-06's shared source-type treatment rather than guessing a map thumbnail from a URL. Both themes derive from OS appearance. Native confirmations, safe insets, keyboard avoidance, 48dp targets, modal accessibility focus, focus restoration and Android Back are retained/implemented.

## Multi-select picker

The same Add to Collection route retains its single-memory mode and now provides a virtualized multi-select collection mode. IDs, not indexes, own selection. Both row and checkbox toggle it; existing members are marked Added and disabled. Selection survives paging and changing search. Cancel performs no mutations. A persistent footer shows selection count and Add N items.

`GET /v1/collections/{id}/candidates` applies the existing keyword-search matching approach (full text plus literal metadata substring) across the owner's real, nondeleted memories, including archived saves. It is independent of enrichment readiness, verifies file assets, and uses the shared durable-original visibility rule in the client. It returns 20 rows by default, maximum 50, with a signed owner/epoch/collection/query-bound cursor and a creation-sequence high-water mark. Already-added status is computed in the page query, including memberships outside the first collection page. Search is debounced and older responses cannot replace a newer query.

Confirmation first reconciles selected IDs in batches of at most 100. It skips existing memberships, sends the existing idempotent PUT for remaining IDs, tracks each acknowledgement, then batch-checks requests whose outcome was uncertain. Confirmed IDs are removed from selection. Partial failures state the confirmed count and remaining unconfirmed count; failed/uncertain selections remain available for retry. Every retry reconciles before writing, so confirmed successes are not blindly replayed. Complete success returns to the existing detail route. Navigation is guarded during writes. There is no offline success or offline mutation queue.

## Collection management

Collection More offers only Rename and Delete. The rename sheet validates nonempty text and the 80-character limit, surfaces server duplicate-name errors, preserves failed drafts, and requires explicit Review latest name after a conflict or uncertain rename. A subsequent Save applies the draft against the reviewed version.

Delete uses the requested native confirmation and version check. A conflict leaves the screen intact and asks for refresh/review; an uncertain response is checked before reporting success. Confirmed deletion returns to Collections.

Item More offers Remove from this collection. The requested native confirmation explains that Library keeps the original. The client checks membership, calls only membership DELETE if needed, reconciles uncertain outcomes, updates confirmed rows/counts, then refreshes authoritative data. No collection operation calls memory deletion.

## Counts and pagination

The existing detail GET now adds `item_count`, `next_cursor`, and per-row `collection_added_at`, while retaining its existing fields, default limit and maximum limit. Count and page are read within one owner-scoped repeatable-read transaction. The count includes all active memberships joined to nondeleted owned memories, including archived memories, consistent with the Hub. It never uses page length. An absent count on an older server is reported as unavailable rather than zero.

Collection pages use `(collection_items.added_at DESC, memory.id DESC)` with an exclusive signed cursor bound to owner, sync epoch and collection. Mobile requests 50 rows per page. Load more has progress, retry, deduplication and end detection. Membership timestamps keep merges in server order when fresh additions coexist with retained rows. Removed/deleted records disappear on reconciliation. Concurrent additions ahead of the current cursor appear on refresh; this is incremental current-state pagination, not a historical snapshot of membership edits. Expired cursors restart from the first page with an explanation.

Focus refresh keeps the FlatList instance, loaded rows and cursor boundary where practical. It fetches the first page and reconciles older loaded IDs in bounded batches (100 per request), refreshing metadata and dropping removed/deleted memberships without per-item reads or fetching the whole collection. If any refresh request fails, previously confirmed data remains with a retryable stale-data notice. Native visible-content maintenance supports scroll context through list updates. Large collections still require explicit Load more; no fetch-all loop is introduced.

## Data integrity and navigation

All additional reads use authenticated principal ownership, explicit owner predicates and transaction-local RLS. Cursor signatures also bind account, epoch and purpose. Screen state is keyed by account and collection/memory IDs; the session layer rejects responses from a changed authentication generation. Memberships remain the same relationships used by RB-11 and RB-12; no second membership cache or collection architecture was added.

Collections → Collection Detail → Memory Detail uses the existing router stack and stable IDs. Back returns to the existing collection screen; deep links fall back to Collections. Returning refreshes real metadata without an initial-loading replacement or deliberate scroll reset. Rename and deletion are picked up by the Hub's existing return refresh. Underlying memory deletion also returns to the originating screen where possible.

## Files changed

- `apps/mobile/app/(account)/collection/[id].tsx`
- `apps/mobile/app/(account)/add-to-collection.tsx`
- `apps/mobile/app/(account)/memory/[id].tsx`
- `apps/mobile/src/api.ts`
- `apps/mobile/src/memory-card.tsx` — optional trailing action and checkbox semantics, preserving existing star consumers.
- `apps/mobile/src/ui.tsx` — optional IconButton ref for accessibility focus restoration.
- `src/recallbox/collections.py`
- `docs/UX/rb-13/IMPLEMENTATION.md`

## Verification

Performed: mobile TypeScript validation; design-system source/native-resource/contrast checks; `git diff --check`; Python AST syntax validation; actual FastAPI router import/OpenAPI generation; membership-status input validation (UUIDs and maximum 100 IDs); static API and navigation review. No automated test suite was created. No emulator, Android Studio, native build, physical device, live database or deployed API verification was performed.

## Deployment and known limitations

Deploy the updated backend before using the new mobile picker: the candidate and batch status routes are required. No schema migration is needed. Older clients can continue using the existing detail and membership endpoints; new response fields are additive. Old-server counts remain unknown and pagination is explicitly marked incomplete rather than implying all items loaded.

Screenshot fidelity, TalkBack, system-navigation insets, keyboard behavior and native scroll anchoring still need physical Android verification. Membership changes arriving concurrently from another client are reconciled on refresh/confirmation; this is not a live subscription or an offline editing system. No thumbnail endpoint was invented. Aggregate collection trip planning and other deferred product features remain unsupported.

## Physical Android QA — USB device only

Use the actual application ID `app.recallbox.mobile`. From `apps/mobile`, start the existing development server with `npm start` if needed. With the connected authorized phone, run `adb devices`, `adb reverse tcp:8081 tcp:8081`, then launch the installed development app using `adb shell monkey -p app.recallbox.mobile -c android.intent.category.LAUNCHER 1`. Ensure its configured API URL reaches the updated backend. No emulator/AVD is needed.

Use real saves and collections; do not populate fake production data. For pagination use an account with at least 51 actual collection memberships. The following checks remain manual:

1. Set Android appearance to Light. Open Collections → an existing collection; compare warm background, serif name, outline Add action, row geometry and compact controls against the supplied reference. Confirm no tabs/FAB.
2. Switch Android to Dark while on detail; verify forest background, readable ivory text, pale accents and theme-aware sheets/placeholders.
3. Open an existing populated collection; compare the real title, dates, source names and total with known memberships.
4. Create/open an empty collection; confirm zero is authoritative, requested empty copy appears, and Add is primary; More remains usable.
5. Tap Add saved items, select one real memory and confirm; return to the same collection with the correct count.
6. Reopen the picker, select five different memories; verify five selected and deselect/reselect one using both row and checkbox.
7. Confirm Add 5 items; verify all five memberships and the authoritative detail count after return.
8. Select memories, scroll/load another picker page, then Cancel or Android Back; verify no membership/count changes.
9. Search for a known eligible item beyond the first Library page; search by title/source or note text; page results and clear search while retaining selections.
10. Search for an existing member outside the first detail page; confirm Added is shown and it cannot be selected twice.
11. Select five items and use a controlled network proxy/backend fault to fail two PUTs while allowing three; confirm accurate partial reporting, only failures remain selected, and Retry checks membership before adding them. Also drop a response after a committed PUT and verify reconciliation. Toggling airplane mode alone may produce different counts; the displayed counts must match actual outcomes.
12. Open a row's More menu; verify it does not open Memory Detail. Cancel removal once, then confirm Remove from collection; verify row/count update.
13. Return to Library and open that removed memory; verify its original content still exists.
14. Header More → Rename; save a real new name and verify both detail and Collections Hub on return.
15. Rename to another collection's name, including case variation; confirm duplicate rejection and retained draft. With a second client, rename concurrently; confirm Review latest name is required before applying the retained draft.
16. Header More → Delete; verify the exact keep-memories confirmation, cancel once, then confirm; verify return to Collections and absence of the deleted collection. Also exercise a concurrent version conflict.
17. Open Library after collection deletion; verify all originals remain saved.
18. Tap a collection memory's main row; verify existing Memory Detail opens with the correct ID/content and Back says Collection.
19. Load multiple collection pages, scroll deep, open Memory Detail, edit title/star/archive or delete it, then Back; verify metadata/membership/count reconciliation and retained loaded context. Verify Back again returns to Collections.
20. With at least 51 real members, use Load more to cross the first-page boundary; verify no duplicates, stable membership order, accurate total before all rows are loaded, and no Load more at the end.
21. Rename to an 80-character multiline name, including existing punctuation; increase Android font/display size; verify wrapping, unclipped controls and no added period.
22. Disable networking during initial load, refresh, page loading, rename and removal; verify separate errors, no false empty/success state, retained drafts/data and working retry after reconnecting. Verify an expired page can restart.
23. Sign out, sign in to another account, and attempt the prior collection deep link; verify no prior account content, and inaccessible IDs show not found.
24. In Memory Detail → Organize (RB-11), change a collection membership; return to RB-13 and verify it matches. Add/remove from RB-13 and reopen Organize to verify the same relationship.
25. Compare RB-12 and RB-13 counts after add, remove, underlying-memory delete, rename and collection delete, including totals greater than 50. With TalkBack, verify count announcements, checked/disabled picker states, menu focus/return focus, and all actions under both gesture and three-button navigation.
