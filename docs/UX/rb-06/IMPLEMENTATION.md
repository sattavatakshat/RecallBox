# RB-06 implementation

## Audit before edits — 17 November 2026

- `main` and fetched `origin/main` match. Existing uncommitted RB-04 save editors, native picker, store/API/layout changes and tsconfig changes must be preserved and excluded from the RB-06 commit.
- Library is `app/(account)/index.tsx`, using `MemoryCard`, `MemoryProvider`, `library-state.ts`. RB-02 uses `EmptyLibrary` and shared `brand.tsx`/`welcome-theme.ts`. RB-04 uses the existing `/save` modal and editors, with `finishCapture` merging acknowledged saves.
- `/captures` and `/uploads` insert a memory, original URL or `capture_assets` bytes, ingestion job, idempotency key and sync event in one transaction. HTTP 201 follows transaction exit. Captures return `queued`; notes/bookmarks default to `ready`.
- `isUsableMemory` hides URL/image/PDF records in queued, processing and failed states. The Library, its mode classifier and save confirmation reinforce that old readiness gate. Backend list pagination does not filter by processing status.
- Originals are separate from extracted text. Asset access is authenticated. The worker updates the same memory ID/version, preserves `created_at`, original source/assets and manual organization overrides, and changes a URL title only if it still equals the original hostname. No thumbnail metadata or small thumbnail endpoint exists; use honest content icons, avoiding full-size asset downloads in list rows.
- Current topics derive from only loaded pages; filtering topics locally is incomplete. List API has server-side archived/starred filters and stable descending `(created_at,id)` cursor pagination. Add compatible topic/order parameters and an aggregate topic endpoint. Sync updates existing records by ID/version; the store is account-bound RAM, not durable offline storage.
- Star and archive use versioned PATCH. Search already has autofocus and existing results functionality. Detail, Account and Collections are real routes. Shared bottom navigation owns safe insets and the FAB. Preserve one stack and RB-04 modal.
- `/captured` is the obsolete processing inbox. Native encrypted share recovery (`incoming-share`) and sync/session recovery must remain. Replace the default inbox with a compatible redirect and show Library attention only for unavailable originals or actual device recovery needs. Enrichment failures belong in Detail while originals remain visible.

## Implemented

- `app/(account)/index.tsx`: approved brand header/avatar, bundled editorial serif, search entry, dynamic horizontal topic/star filters, real sort menu, compact virtualized rows, incremental pagination, honest empty/error states and conditional recovery entry. No fabricated data/images. All topic matching uses the manual override before suggestions, including the explicit Uncategorized override.
- `src/memory-card.tsx`, `src/library-icons.tsx`: 60dp content tiles, two-line titles, compact domain/date metadata, accessible 48dp star controls. Stars use the existing versioned PATCH, a synchronous submission lock and server-confirmed state; failures retain the previous star and show an error.
- `src/library-state.ts`, `src/memories.tsx`, `src/api.ts`: distinguish durable originals from enrichment. Publish acknowledged captures immediately, invalidate older in-flight list responses, merge by ID/version and sort by immutable creation date plus ID. Keep selected topic/order in the account provider and retain the mounted list on return from Detail. Reset filters/order to All/Newest and scroll to the top on an explicit new save so its confirmation remains visible even in a large library previously sorted Oldest.
- `src/navigation.tsx`, account layout: shared brand colors in populated Library and its FAB, book-spine Library icon, safe insets and 100dp list footer clearance. One existing Save route and one existing navigation stack. Empty Library keeps RB-02.
- `app/(account)/memory/[id].tsx`: load original image previews during enrichment or extraction failure, preserve existing file sharing/source-opening and retry controls, report unavailable originals with a route to the existing Save sheet, and dismiss back to the mounted Library instead of replacing it.
- `app/(account)/account.tsx`: preserve archive access through a real paginated Library view; retain device-share recovery even when no attention prompt is required. Search, Account and Detail return to the existing Library stack entry.
- `/captured` remains a compatibility redirect to Library. Remove the default processing-inbox card and retired copy; routine enrichment remains quiet. Native share retries/discard, unconfirmed editor drafts and sync/session recovery are preserved. RB-04 editor copy changes are limited to directing users to Library; their existing implementation remains local work.
- Backend `src/recallbox/memories.py`: additive `original_available` field, checked against stored assets in list/detail/sync/collection summaries; additive `topic` and `order` query parameters; authenticated `/memory-topics` aggregate. Existing default newest order, archived/starred filters, cursor ownership/epoch and legacy cursor defaults remain compatible. Cursors bind the topic and order to prevent mixing query pages. No schema migration or dependency added.
- Backend `src/recallbox/capture.py`: idempotent replay and processing retry report actual original-file availability. Upload originals and memory still commit atomically. No change to worker identity, original storage or extraction lifecycle.

### Visibility transitions

| State | Library behavior |
|---|---|
| Local in-app draft / upload awaiting response | Keep existing editor/retry state; never publish as server-saved |
| Native encrypted share awaiting server acknowledgment | Remains in device inbox; failed/blocked entries expose recovery |
| Server-confirmed note, valid saved URL, stored image/PDF | Visible immediately, including queued/processing/failed enrichment |
| Ready / metadata-only enrichment | Update same ID/version; retain creation date and original |
| Failed enrichment with original present | Remains visible; details/retry are in Memory Detail |
| Missing stored file (`original_available=false`) | Excluded from normal rows; conditional Needs attention links to Detail |
| Archived / deleted | Archived view only / removed by sync tombstone |

Old server file responses without the additive availability field retain the existing atomic-upload contract. List/detail/sync reads from the new server explicitly check file existence. Missing files are discovered on refresh or when a sync event covers that record; there is no background storage-integrity scanner.

## Verification performed

- `npm run typecheck`: passed against the working tree including the preserved RB-04 work, and against an isolated HEAD plus RB-06 patch snapshot excluding unrelated edits.
- `npx expo export --platform android --output-dir /tmp/rb06-android-export`: passed, producing a Hermes Android bundle and assets. This is a JS bundle check, not a native APK build or visual test.
- Python compilation of changed backend modules and sync consumer: passed.
- `git diff --check`: passed. No ESLint/lint script is configured; no lint dependency added.
- Local PostgreSQL `EXPLAIN` in a read-only transaction: newest/oldest topic queries, aggregate topics and aliased collection summary queries all parsed/planned successfully. No memories were fetched or modified for these checks.
- Static review: real routes, autofocus Search, versioned star failure behavior, durable upload transaction boundaries, same-ID enrichment, immutable creation-date ordering and legacy cursor defaults reviewed.
- No new automated tests, emulator, AVD or Android Studio. No visual/device verification or full authenticated API flow was performed.

| Feature | Status |
|---|---|
| Search entry/focus, topic/star filters, sorting, navigation, Save route | Implemented; statically/type verified; device unverified |
| Star persistence/failure state | Existing API integrated; statically verified; live device/API mutation unverified |
| Immediate Library visibility | Implemented; state/transaction review passed; device unverified |
| Enrichment updates/original preserved | Existing worker retained, UI gates removed; statically reviewed; end-to-end unverified |
| Light/dark reference fidelity, accessibility, scrolling/back restoration | Implemented; requires physical-device verification |

Deploy/restart the backend with these changes before testing new topic/order capabilities. No migration is needed. Existing cached records are account-scoped RAM only; cold-start offline use shows a retryable error. Existing encrypted Android shares are the only durable device outbox. Real thumbnails are not currently supplied by the API; content icons are intentional.

## Git delivery scope

Work is on `main`. Commit message: `feat(mobile): implement RB-06 library and immediate memory visibility`.
Stage RB-06 UI/backend/docs and the necessary shared-store save integration. Preserve the remaining RB-04 editor, native picker, upload-error, toast feedback and tsconfig edits as local work; do not stage those unrelated changes. The working tree is intentionally not clean after this delivery.

## Physical Android USB checklist

Use your actual physical-device serial from `adb devices -l`. These instructions do not launch an emulator.

From the repository root, in separate terminals:

```sh
bash scripts/run-local.sh api
```

```sh
bash scripts/run-local.sh mobile
```

If native RB-04 picker/share code changed since your installed build, rebuild the existing native project without launching a device:

```sh
cd apps/mobile/android
./gradlew :app:assembleDebug
```

From the repository root, install/launch on the selected physical phone:

```sh
export ANDROID_ADB="$HOME/Library/Android/sdk/platform-tools/adb"
"$ANDROID_ADB" devices -l
export DEVICE_SERIAL='REPLACE_WITH_YOUR_PHYSICAL_PHONE_SERIAL'
"$ANDROID_ADB" -s "$DEVICE_SERIAL" reverse tcp:8001 tcp:8001
"$ANDROID_ADB" -s "$DEVICE_SERIAL" reverse tcp:8081 tcp:8081
"$ANDROID_ADB" -s "$DEVICE_SERIAL" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
"$ANDROID_ADB" -s "$DEVICE_SERIAL" shell am start -a android.intent.action.VIEW -d 'app.recallbox.mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' app.recallbox.mobile
```

The existing mobile `.env.local` must target the configured backend and real OIDC client. With loopback API development, the API port above is 8001. For an already current native client, skip build/install and use Metro reload.

1. Switch system appearance, using Android Settings or:
   `"$ANDROID_ADB" -s "$DEVICE_SERIAL" shell cmd uimode night no` for light;
   `"$ANDROID_ADB" -s "$DEVICE_SERIAL" shell cmd uimode night yes` for dark;
   restore with `auto`. Compare header, serif, warm ivory/forest backgrounds, row spacing, separators, chips, nav and FAB with the supplied reference.
2. In a populated account, scroll across multiple pages and to the last row. Confirm no FAB overlap, stable order and no repeated IDs. Repeat with large Android font/display size, TalkBack and system gesture/three-button navigation.
3. Tap search entry and Search tab. Confirm real Search opens with keyboard focus, existing keyword search works, and Library returns without a duplicated stack.
4. Select a persisted topic, including one whose items occur beyond the first page. Reclassify a memory manually in Organize and confirm the manual override wins. Verify empty topic/Starred results say “Nothing saved here yet.” and All resets them.
5. Star/unstar and revisit/reload; verify server persistence. Rapid taps must submit once. Disconnect during a star request: keep prior state and show an error, with no Detail navigation.
6. Select Newest/Oldest and paginate each. Confirm creation-date order with deterministic ties. Enrichment must not move a record to the top.
7. Open Detail from halfway down a filtered list and return using both the in-app Library action and Android Back. Check selected filter/order/scroll position. Open profile, archive, device recovery and Collections; verify real destinations.
8. Tap the single +, use the existing RB-04 sheet, and check note/link/image/PDF editors, cancellation and retained drafts. On a genuinely empty test account verify the unchanged RB-02 first-save design; do not delete production memories just to test emptiness.
9. Leave the ingestion worker stopped. Save a real URL, a note, an image and a PDF. After the server confirms each save, it must appear in Library without starting the worker. Before upload acknowledgment it must remain an editor attempt. Open each original while processing is queued.
10. Start enrichment separately with `bash scripts/run-local.sh worker`. Pull to refresh or wait for foreground sync (up to 30 seconds); verify the same memory ID improves in place, keeps its saved date/manual organization/title and remains unduplicated.
11. Use a real source that the existing extractor cannot read. Confirm failed/metadata-only enrichment leaves its URL/file in Library and accessible in Detail. Retry extraction in Detail; routine processing must not create a permanent attention dashboard.
12. Disconnect the backend while the app is open: loaded RAM records remain, errors are explicit and Retry works on reconnection. Cold-start offline must show an error rather than first-time empty Library. A local queued share must remain labeled device-only until acknowledged. Use a disposable attempt to verify failed/blocked share recovery and retry.
13. On a test account with a genuinely unavailable stored original, refresh and verify the conditional Needs attention path and honest Detail message. Do not remove a real user's files to manufacture this state.

Known limitations: visual fidelity and all touch flows await USB testing; native APK compilation was not performed; authenticated end-to-end API mutations and a large-library performance benchmark were not performed. Filter preferences and scroll position survive ordinary navigation, not process death. No new offline memory cache or thumbnail service was introduced.
