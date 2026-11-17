# RB-04 — Approved Manual Save

17 November 2026. Work directly on main; no emulator or physical-device control. The pre-existing `apps/mobile/tsconfig.json` edit is excluded.

## Initial implementation inventory

| Feature | Current implementation | Gap | Planned fix |
|---|---|---|---|
| Manual Save sheet | Expo Router transparent Save route and real capture destinations | Legacy typography/copy/glyphs; no drag dismissal; underlying tab height changes | Approved brand sheet with outline icons, safe scrolling, close/back/backdrop/handle swipe; stable underlying Library |
| Paste a link | Existing authenticated `/captures` with idempotency and draft guard | Save enabled for any text; success opens unfinished details | Validate full supported HTTP(S) URL; return to Library with accurate pending status |
| Write a note | Existing `/memories` note creation, optional title, autofocus | State-only submission lock; draft lost on auth route unmount; success opens details | Synchronous submission lock, account-bound memory draft/retry key, return to Library |
| Photo/screenshot | Image picker dependency/camera present; current route uses DocumentsUI workaround and uploads immediately | Extra initial action; no preview or explicit Save | Open native photo picker directly, validate selected bytes/size, preview and Save; preserve camera and file-provider fallback |
| PDF document | Existing document picker, cache copying, PDF MIME and 8 MiB upload | Extra initial action; upload starts immediately; no filename/size review | Open document picker directly, actual signature/size validation, selected-file review and explicit Save |
| Light/dark themes | Shared RB-01/RB-02 brand/font exists | Sheet uses legacy palette and small non-serif title | Scoped approved ivory/forest/sage/lime tokens and bundled serif |
| Save feedback | Existing server acknowledgments/processing states and shared memory store | Redirects to detail; URL/file response not immediately merged into Library | Integrate acknowledged records into Library and show unobtrusive real confirmation/Recently Captured |
| Error handling | Existing authenticated APIs and several leave guards | File errors generic; retry drafts tied to mounted screens; duplicate taps can race state updates | Consistent errors, immediate ref locks, exact retry body/key, same-account memory recovery and honest offline limits |

Implementation and actual verification details follow after completion. No new automated test suite is requested or planned.

## Implemented RB-04 behavior

- `app/(account)/save.tsx` presents a native React Native Modal window over the existing transparent Save route. The Library and its navigation retain their dimensions underneath it, preserving scroll on open/close. Existing Save entry points and route names are retained; a cold Save link anchors to Library.
- The sheet uses the existing brand palette/font with an ivory or forest surface, sage icon containers, lime dark-mode accents, fine separators, exact approved labels/subtitles, and code-native consistent outline icons. There are exactly four rows and no video option or extra chooser footer.
- Close, Android Back, backdrop, and downward handle/header drag dismiss the sheet. Row selection is synchronous-lock protected, then replaces the chooser route with the correct editor. The header retains an accessible 48dp close target. Rows scroll on shorter/landscape/large-text layouts; safe-area insets and system gesture navigation are reserved. Dismissal animation observes reduced-motion settings.
- Link and note editors autofocus the requested field, use keyboard-aware scrolling, and submit real existing APIs. URL validation mirrors the supported HTTP(S) structure/length/credentials/port rules. Notes require non-whitespace content and optional titles.
- Image/PDF rows automatically launch their native picker after route mount. There is no mandatory camera/gallery choice modal. Initial picker cancellation returns without saving; cancelling a replacement selection keeps the earlier file/attempt.
- Selected images have a real local preview. PDFs show filename, actual byte size, and MIME before an explicit Save. Reading the local file handle validates the actual 8 MiB limit and byte signature (JPG/PNG/WebP/PDF), rather than trusting a filename or picker metadata. Upload begins only on Save. Original cache copies are retained for retry; only app-cache copies are eligible for cleanup after confirmed save.
- Camera remains an optional image-flow action and requests its existing permission only when selected. A Choose from Files fallback remains available.
- All forms use immediate ref locks against rapid duplicate submissions. Ambiguous failures retain the exact original body/key and lock editing until resolved or a replacement is explicitly chosen. `session_changed` is treated as ambiguous even though its status is 401, because an old account's request may already have committed.
- Recovery drafts are keyed by authenticated account in **app memory**. Reopening the same editor after a route/authentication unmount restores that account's input/selection/request key while the process remains alive; another account receives a different draft. This is not a durable offline outbox and does not promise recovery after app kill/cache eviction. Existing authentication remains the authority for all requests.
- Acknowledged memories are merged immediately into the existing account-scoped store; a capture epoch prevents older list responses from overwriting them. The capture UI returns to Library. Filters are cleared as needed to make the saved item discoverable. A brief real confirmation appears in Library and via Android text toast; optional feedback failure cannot turn acknowledgment into failed-save UI. No automatic unfinished-detail navigation remains. Processing stays driven by actual API data; the existing Library/Recently Captured implementation determines where an acknowledged original/status appears.
- Upload errors retain the API's actual error code, allowing account-storage limits, unsupported/oversized input, busy capture queues, session failures, and ambiguous network results to be explained accurately.

## Android photo-picker integration

The installed Expo 58 image-picker source was inspected. Its `ImageLibraryContract.parseResult` calls `uri.toMediaType(contentResolver)` while parsing the Android result; the existing app explicitly worked around an Android 16 ANR by bypassing the photo picker entirely.

RB-04 adds a small contract to the **existing** RecallBox native module. On Android 13+ it launches `android.provider.action.PICK_IMAGES` directly; older supported Android versions use the native open-document fallback. Parsing returns only the granted URI. On `Dispatchers.IO`, the module reads/copies the granted stream, checks image signatures and size, and returns an app-cache preview file. It does not query provider MIME on the result/UI thread, add a new library, or patch node_modules.

Pending photo results are bound to the account used to launch the contract. Camera-result recovery is used only when ownership is known in this JS process; unowned stale results are not silently imported after a different account signs in. Actual activity-destruction/provider behavior remains a phone check.

**A native development APK rebuild is required** for the new photo-picker bridge. An older installed build displays a truthful update/fallback message instead of invoking the known problematic path. Native sharing/outbox and authentication callbacks remain unchanged apart from adding the separate picker functions.

## Files / scope

- Routes: `apps/mobile/app/(account)/save.tsx`, `new-link.tsx`, `new.tsx`, `capture.tsx`, `_layout.tsx`.
- Shared manual-save code: `src/manual-save-model.ts`, `manual-save-state.ts`, `manual-save-ui.tsx`, `manual-save-icons.tsx`, `manual-file-picker.ts`.
- API/store integration: `src/api.ts`, `src/memories.tsx`, minimal Library filter-reset integration where applicable.
- Native: `modules/recallbox-callback/android/src/main/java/expo/modules/recallboxcallback/ManualImagePicker.kt`, `RecallBoxCallbackModule.kt`.
- Docs: this inventory/report and `USB_TESTING.md`.
- No new dependency, backend endpoint/migration, feature branch, PR, emulator, Android Studio, or new automated test suite.

## Verification and limits

- TypeScript/import checks passed on both the isolated RB-04 snapshot and the final combined working tree after RB-06 committed. Android JavaScript/Hermes export also passed during implementation.
- Focused Kotlin compile passed (64 tasks, 2 executed / 62 cached; final run 15 seconds). No full APK build or device control was performed in RB-04.
- 31 one-off URL/signature/retry-classification/limit/route checks passed. No test suite was added.
- Whitespace/diff checks were run.
- The user confirmed that RB-06 was developed concurrently in another session. It committed separately as `8b46aa6f`. A temporary RB-04-only snapshot passed its own type check before that commit; the final combined working tree also passed. RB-04 uses RB-06's shared `finishCapture`/filter reset integration and adds the remaining feedback/readiness handling. The RB-04 commit excludes RB-06 screens/backend changes and the pre-existing `tsconfig.json` edit.
- Actual visual matching, picker launch/cancellation/preview, swipe/Back/keyboard, uploads, expiry, offline and account-isolation behavior remain **unverified on a physical device**. The user's checklist is [USB_TESTING.md](USB_TESTING.md).
