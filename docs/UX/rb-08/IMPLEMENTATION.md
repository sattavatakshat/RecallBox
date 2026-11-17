# RB-08 — Unified Search Results

## Audit

RB-07 already pushed `/results?q=…` after recording trimmed submissions in encrypted, device-local, account-scoped `searchHistory`. Results performed keyword search, then optional semantic search when fewer than six usable keyword matches were returned (query at least four characters). IDs deduplicated semantic results behind keyword results. Search used authenticated `owned()` transactions with forced RLS; star changes used serialized version-checked backend edits.

Keyword retrieval indexed title, user note and extracted text with English PostgreSQL full-text search and rank, plus substring matches across those fields, collection, labels and user topic/tag overrides. It omitted `source_url`; URL captures with empty notes could therefore miss domain queries before enrichment. Summary responses did not include matching evidence. The results screen used `isUsableMemory`, not readiness-only visibility, but its type filter operated only on the first 50 keyword / 20 semantic candidates. Starred filtering already ran in SQL. Newest sorting was local; rank ties used enrichment-sensitive `updated_at`. Every row rendered inside a ScrollView. The route kept state while covered by Detail, but Detail's explicit Library action bypassed it, and results did not observe shared mutations. Results also lacked an editable query, compact header, filter/sort sheets and results-keyboard tab hiding.

## Changed files and behavior

- `apps/mobile/app/(account)/results.tsx`: compact AppHeader, shared editable Input, result-count wording, horizontal type chips, starred Apply/Clear sheet, sort sheet, distinct error/empty states, retry, capped-result disclosure, virtualized FlatList and memoized rows. Editing/clearing drafts leaves loaded results intact. Only submitted nonempty trimmed queries update the route and existing history. No duplicate results route is pushed. New queries/filter/sort requests reset the list; Detail navigation keeps the mounted list, draft, filters, sort, data and offset. Obsolete responses are ignored using a request generation. Old results remain explicitly labeled while replacement requests run or fail.
- `apps/mobile/app/(account)/search.tsx`: reload existing account-scoped history on focus, including submissions made in Results.
- `apps/mobile/src/api.ts`: additive optional evidence and cap response fields; backward-compatible optional search arguments for kind/order.
- `src/recallbox/memories.py`: server type/starred/collection predicates before caps, explicit owner predicate alongside RLS, real source URL substring matching, durable file asset checks, original-save tie-breaking, server Newest keyword ordering and bounded plain-text evidence.
- `apps/mobile/src/memory-card.tsx`: shared row gains optional search presentation with central editorial typography and two-line evidence. Title evidence highlights the title; other evidence labels metadata fields where needed. Source icons are honest placeholders; no thumbnail API or private file downloads are introduced. Star remains a separate press target.
- `apps/mobile/src/memories.tsx`: expose account-local record lookup/deletion knowledge and publish metadata already fetched by Detail. Results merge confirmed newer versions without additional document requests; outdated excerpts are dropped after a newer revision.
- `apps/mobile/src/navigation.tsx` and `apps/mobile/app/(account)/_layout.tsx`: selected Search tab returns Results to RB-07; keyboard hides shared tabs and Save FAB in both search states. Existing Android `adjustResize` remains in effect.
- `apps/mobile/app/(account)/memory/[id].tsx`: results-origin navigation uses a Search results back action; normal Library entry retains its existing action.
- This implementation note records audit, verification, limitations and device QA.

## Matching, filtering and limits

Keyword mode keeps English `plainto_tsquery`/`ts_rank_cd` plus literal substring fallback. Real searchable fields are title, user note, extracted text, source URL, collection, labels, topic override and tag overrides. No extraction-readiness condition is applied. Original notes, file titles (including saved filenames), URLs and metadata remain searchable while processing or after extraction failure. Files require their durable asset; inaccessible originals do not consume search slots.

Best match keeps backend keyword rank, then `created_at` and ID descending. Optional semantic results use embedding distance, `created_at` and ID, appended after deduplication. Missing/failing embeddings never turn successful keyword retrieval into an error. Semantic candidates still require an existing version-1 embedding and do not imply OCR or extraction exists for pending originals.

All type and starred filters are server-side, before limits, with `link` matching both `link` and `url`. Newest keyword selection occurs server-side over all matching owner records using original `created_at`, with ID tie-breaking. The merged candidate list is date-sorted for Newest. Semantic retrieval remains bounded by relevance before date sorting; this limitation is disclosed in the UI. Archived matches remain searchable, preserving the existing API behavior.

Keyword responses contain at most 50 items; semantic responses at most 20. Each fetch requests one extra row to detect truncation and returns additive `limited` / `limit` fields. Displayed counts describe only shown results. There is no exhaustive total or search pagination. Metadata substring searches may scan the owner's records; this task does not introduce a new index/migration. The updated backend must be deployed with this mobile change for server-side type filtering, newest selection and evidence.

Evidence comes from actual fields on authenticated result rows. Fields containing the literal phrase are preferred, then fields containing literal query words. Title evidence is at most 240 code points; other excerpts at most 220 plus ellipses. Segments contain original text and literal whole-word match flags; native Text renders them without HTML. Existing central `highlight/onHighlight` colors provide accessible paired emphasis in both themes, so no new token role is needed. Python slices preserve Unicode scalar characters; segmentation avoids Python/JavaScript offset mismatches. English stemming-only or semantic matches may show a real unhighlighted excerpt. Evidence does not assert that literal matches exhaust every retrieval reason. Source-only rows show title/URL evidence or no excerpt, never invented body text.

Star mutations are pessimistic confirmed edits with expected versions, using the shared serialized mutation queue; failed requests leave displayed state intact. A version conflict displays the server revision and requests a fresh tap rather than overwriting concurrent changes. Shared later revisions replace result metadata and discard stale evidence. Matching membership/relevance after text edits is recalculated on the next submitted search; it is not silently recomputed client-side.

## Verification performed

- `npm run typecheck` in `apps/mobile`: passed.
- `npm run design:check`: passed, including native-resource synchronization, source/icon/font policy and contrast checks. No authored tokens/icons changed; generation was unnecessary.
- `python3 -m py_compile src/recallbox/memories.py`: passed.
- Ephemeral backend smoke checks: imported the real route in the existing virtualenv; exercised evidence text/highlights, source-only behavior, Unicode context, bounded keyword/semantic response contracts and owner/filter/order SQL arguments using a mock connection. Passed. No new test suite or fixture files added.
- Navigation/static integration review and `git diff --check`: passed.
- No live PostgreSQL retrieval, embedding service integration, visual rendering or physical-device verification performed. No emulator/AVD or Android Studio launched.

## Physical Android USB checklist

Use the project's existing dev-client/USB workflow with the updated API running. Confirm the phone is connected with `adb devices`; for a localhost dev server use the project's usual USB port reversal. Do not launch an emulator. Use only real saved memories from your accounts.

1. In OS light mode, submit a known title/note phrase in RB-07. Check compact brand header, ivory/forest colors, count, sort, one horizontal filter row, shared source icons/rows, Search-selected navigation and Save FAB. Repeat in OS dark mode and with enlarged text/TalkBack.
2. Tap the results input. Verify native keyboard and Search action; tabs/FAB hide, input stays visible, results remain scrollable above the keyboard. Type an unsubmitted draft: no request/results/history change. Clear X: field empties and remains focused, old results remain. Empty Search does not execute.
3. Submit a different trimmed phrase. Verify keyboard dismisses, filters persist, route updates without a second Results screen, results change, scroll resets and RB-07 recent history contains only actual submitted phrases.
4. Search known real title, note, extracted-text, domain/URL, collection, label and override values. Inspect each highlighted segment against its saved field. Title-only/URL-only matches must not invent body excerpts. Include accented characters and emoji near excerpts.
5. With local embeddings available, use a four-plus-character query returning fewer than six keywords; inspect actual related memories and deduplication. Disable/unconfigure embeddings: keyword results must still work without a full-search error. No semantic-only phrase claims should appear.
6. Save a URL and immediately search its original URL/domain before enrichment finishes. Repeat with a note's text and uploaded PDF/photo filename/title. Verify failed extraction preserves searches of available original metadata, without claiming unavailable OCR/content.
7. Select each of All/Links/Notes/Photos/PDFs. With an owner library exceeding the cap, verify type filtering can find a matching type outside the former first 50. Open sliders, toggle Starred, cancel once (unchanged), then Apply. Check visible Starred indication and Clear filters behavior, including empty filtered results.
8. Switch Best match/Newest. Compare original saved dates, not enriched/updated times. Check stable ties and the semantic-candidate limitation note. With sufficient matches, confirm limited-result wording and absence of an exhaustive total.
9. Search an unmatched phrase: exact empty copy and immediate editing action. Apply filters excluding matches: filtered empty state and Clear filters. Turn networking off and submit: retryable error rather than empty-library claim; retained query/filters and labeled prior rows. Restore networking and Retry.
10. Submit multiple queries rapidly under network delay. Older responses must never replace the newest submission. Test a delayed optional semantic response too.
11. Star/unstar from Results, reopen Detail and confirm persistence. Check that the star target never opens Detail. Under Starred only, unstar removes the row after success. Simulate a concurrent revision from another client: conflict must show current metadata, preserve other edits and require an intentional retry. Network failure must not display an unconfirmed star.
12. Scroll Results, keep a query draft, open Detail, star/edit there, then use Android Back and separately the Search results action. Verify prior draft/filter/sort/results/offset and updated metadata. Changed text may require resubmission to recompute membership/evidence. Deleted synced records should disappear.
13. Dismiss keyboard and verify navigation/FAB restoration, final-row access, Account opening existing settings, and + opening the existing RB-04 Save sheet. Cancel Save and confirm result context survives.
14. Tap selected Search tab and separately Back to search. Verify RB-07, refreshed recent history and no duplicate Results stack. Submit again normally.
15. Sign out, switch accounts and repeat searches/history. Verify no prior account rows, drafts, history or pending search responses appear. Confirm server requests require authentication and cannot retrieve another owner's originals/evidence.
