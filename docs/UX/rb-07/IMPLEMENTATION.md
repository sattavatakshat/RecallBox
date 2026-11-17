# RB-07 focused search

## Audit — 17 November 2026

- Work began on `main`, matching fetched `origin/main`. The pre-existing `apps/mobile/tsconfig.json` edit is unrelated and excluded from this commit.
- Library and the shared Search tab navigate to the existing `/search` stack destination. The former screen used autofocus, a large submit button and suggestions derived from saved memories; no recent-query persistence existed.
- `/results` accepts `q`, calls the authenticated keyword API, then conditionally requests semantic matches for sparse keyword results. Semantic failure preserves keyword matches. `SessionProvider.authorized` guards account/session generations; backend `owned` transactions and forced row-level security scope reads to the authenticated owner.
- Results previously gated rows on enrichment readiness, contradicting Library's durable-original contract. Search responses also omitted Library's file-availability projection. Both gaps are corrected without changing ranking, query parameters or extraction/indexing behavior.
- Account SecureStore support already exists. The account-keyed MemoryProvider remounts the route subtree on account changes. Library's mounted list and provider retain filters and scroll position; Search must not refresh/reset those filters.
- Android already uses `adjustResize`. Shared Screen supplies safe areas, scrolling, handled keyboard taps and iOS keyboard avoidance. Tabs and FAB belong to the account layout and previously ignored keyboard visibility.

## Implementation and files

- `apps/mobile/app/(account)/search.tsx`: compact shared AppHeader with original bookmark/wordmark and Account route; DM Serif Display `display` heading; shared rounded Input with Lucide search/clear icons; real recent-query rows with clock/chevron and separators. Uses centralized palette, geometry, spacing and typography in both OS-controlled themes, with no new tokens/dependencies or sample history.
- `apps/mobile/src/ui.tsx`: extends Input with optional ref, hidden visual label, adornments and rounded shape; preserves the prior undecorated field styling. Accessibility labels remain present when the visible label is hidden.
- `apps/mobile/src/search-history.ts`: encrypted SecureStore history, separate collision-free account keys, latest ten case-insensitively distinct trimmed queries, most-recent first. Reads/writes/clears are serialized per account. History is device-local, not synchronized or collected for analytics. Storage rejection/corrupt data is surfaced, never interpreted as a successful empty load or successful clear. Persist only explicit submissions, never keystrokes. The API's 200-character limit is shared by Search/Results/history.
- `apps/mobile/app/(account)/_layout.tsx`: native keyboard events hide both shared tabs and their FAB on Search, restoring them on dismissal. Other destinations retain their existing navigation convention.
- `apps/mobile/app/(account)/results.tsx`: uses the same durable-original eligibility helper as Library; Edit search dismisses to the existing Search route with `q` rather than replacing Results with a duplicate Search screen. Retrieval, errors, filters and keyword fallback are retained.
- `src/recallbox/memories.py`: both search SELECTs reuse `original_column()` so existing response serialization reports actual image/PDF availability, matching Library. No new endpoint, migration, ranking logic or invented searchable text.
- `docs/UX/rb-07/IMPLEMENTATION.md`: audit, implementation, verification and physical-device checklist.

Search focuses on entry/return using native autofocus and focus lifecycle. Clear X empties only the draft and focuses the input. Native Search return submits a nonempty trimmed query, preserving interior spaces; empty submit leaves the input available. A synchronous lock prevents rapid duplicate navigation. History persistence failure preserves search availability and leaves an error on Search. Leaving Search invalidates pending navigation. Selecting a history row follows the same submit path. Clear history changes the list only after confirmed deletion and leaves the draft/memories untouched.

## Verification

- `npm run typecheck`: passed.
- `npm run design:check`: passed, including native-token/icon parity and contrast checks.
- `git diff --check`: passed.
- Python AST compilation of `src/recallbox/memories.py`: passed.
- Source review: native `adjustResize`, account-keyed route lifecycle, per-account storage serialization, empty/long query guards, duplicate submit lock, query return routing, authenticated retrieval, semantic failure fallback and original-availability SQL reuse.
- No automated test suites added. No emulator, AVD, Android Studio, physical-device verification or live authenticated API/storage mutation performed. Static checks do not establish screenshot fidelity or runtime keyboard behavior.

## Physical Android USB checklist

Use the existing physical-phone development workflow (`bash scripts/run-local.sh api` and `bash scripts/run-local.sh mobile`); select the actual USB device from `adb devices -l` if device commands are needed. No native dependency or rebuild is introduced by RB-07. Restart/deploy the backend to pick up search's original-availability projection.

1. In OS light and dark modes, enter Search from both Library's search field and the Search tab. Compare the header, serif heading, rounded input, focus border and history spacing against the approved image. The native IME controls keyboard colors/layout.
2. Verify autofocus, real Search return key, typing, Clear X retaining focus, whitespace-only no-op, preserved interior spaces, and a 200-character paste. Check large system font/display size, TalkBack labels, and long-history row truncation.
3. Submit real keywords and natural-language phrases. Verify Results receives the actual query; rapid repeated return/taps open only one Results screen. Edit search and Android Back retain the query without accumulating Search screens.
4. Verify only submitted queries enter history. Repeat a query with case differences: one entry moves to the top. Submit eleven distinct queries: only the latest ten remain. Restart the app and confirm persistence.
5. Select a history row: it submits and moves to the top. Clear history: rows disappear after storage succeeds; the current draft and saved memories remain. With no history, only minimal guidance appears. No illustrative sample queries or saved-memory suggestions appear.
6. Sign out and sign into a different account: no previous-account queries or draft appear. Return to the original account: only its own local history is available. History is intentionally not synchronized to other devices.
7. With keyboard open, confirm tabs/FAB are hidden, input remains visible, history scrolls above the IME, and no content overlaps. Android Back first dismisses the keyboard; tabs/FAB return. A second Back follows stack navigation. Return to Library and confirm filters/scroll position remain.
8. Disconnect the network, submit, and verify honest Results error and retained query on edit. Disable/unavailable semantic indexing: real keyword matches remain usable. No offline-search claim should appear.
9. Search actual titles/URLs of queued or failed-enrichment durable originals. Confirm real text can match before enrichment, no imaginary source text matches, and missing stored files do not appear after the updated backend is running.
10. Where practical, exercise secure-storage load/write/delete failure: distinguish failure from no history, keep searching available, retain the prior list on failed clear, and avoid navigating after leaving Search during a pending write.

## Limitations

- Visual fidelity, USB-device focus/back/keyboard behavior, SecureStore persistence/failure and account-switch isolation require the manual checks above.
- Natural-language interpretation depends on existing optional semantic indexing; it is not guaranteed. No live suggestions, custom keyboard, offline searchable index, cross-device history or new retrieval pipeline was added.
- Keyword search still matches the backend's existing stored title/note/extracted text and organization metadata. A source URL is searchable where present in those existing fields; there is no new dedicated source_url index. Missing extracted source content cannot match until available. Existing top-50 keyword/top-20 semantic limits remain.
- Older backends omit the explicit original-availability flag on search responses; the shared helper retains its existing atomic-file fallback. Run the updated backend for accurate missing-file filtering.
