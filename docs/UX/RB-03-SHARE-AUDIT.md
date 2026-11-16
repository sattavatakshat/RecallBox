# RB-03 — Android Native Share → Instant Save audit

16 November 2026. Initial source audit recorded **before implementation changes**. Physical Sharesheet visibility and end-to-end success are unverified. Work is authorized directly on main; the existing tsconfig edit is unrelated and must remain untouched.

## Initial implementation status

| Component | Status | Evidence | Required Change |
|---|---|---|---|
| Android share-target registration | Partial | `plugins/with-recallbox-callback.js` adds SEND text/plain to MainActivity, but the existing generated `android/app/src/main/AndroidManifest.xml` has no SEND filter | Register a dedicated native receiving Activity and regenerate native configuration |
| Share target visible for URLs | Unverified | No physical resolver/UI test; existing generated manifest lacks registration | Correct native registration, require rebuilt APK, provide physical resolver checks |
| Instagram URL handling | Partial | `ShareStore.save` extracts one HTTP(S) URL; no scraping | Preserve validated URLs through existing `/captures`; test Instagram's system-share path manually |
| Text sharing | Missing | Text without exactly one URL is silently ignored | Preserve text through existing note storage |
| Image sharing | Missing | No image filter or content URI receive path | Validate exact supported image MIME/signature/size and copy granted streams into encrypted app storage |
| File sharing | Missing | No PDF filter or URI handling | Support existing PDF upload only, reject other formats truthfully |
| Cold-start capture | Partial | Plugin inserts `ShareStore.save`; existing generated MainActivity has no such call; old queue depends on JS routing | A native receiving Activity must persist before dismissing, independently of Metro/React startup |
| Authentication recovery | Partial | Account layout redirects to login, but `activateAccount` clears queue on account switch | Retain encrypted account-owned items; allow unowned login-bound shares without cross-account import |
| Durable persistence | Partial | AES-GCM/Keystore URL queue + synchronous commit; failures are silently ignored; URL-based dedup; corruption treated as empty | Fail closed on storage failure, encrypted durable file copies, per-delivery idempotency, visible retry, background scheduling |
| Confirmation UI | Partial | `app/(account)/incoming-share.tsx` is a full-screen React page, URL-only; correct server-ack gate | Compact native light/dark bottom confirmation, distinct server/local/failure states |
| Automatic dismissal | Partial | JS finishes only when current Activity's intent still equals SEND; 900ms delay ignores accessibility | Finish dedicated receiver, retain originating task, use accessibility timeout recommendation |
| Recently Captured integration | Partial | Server-confirmed sources are listed/polled; device share queue is invisible | Add native outbox inspection/retry and distinguish local items from server captures |

## Initial call chain and failure points

Intended legacy chain: Android SEND → MainActivity generated plugin hook → encrypted ShareStore → account-layout `peekShare` → full-screen incoming-share route → existing `/captures` → server acknowledgment → queue acknowledgment → Activity finish.

The plugin is source-controlled, but `apps/mobile/android/` is generated and Git-ignored. Its current manifest/MainActivity do not include the incoming-share wiring. An OTA/Metro JavaScript reload cannot register a native share target. `expo-sharing` is the **outgoing** share API and does not fix this.

The existing store silently rejects malformed/multiple-URL/plain-text/file input, deduplicates pending items by URL (conflating intentional later shares), drops all queued items on account switch, and turns decryption failure into an apparently empty queue. Its file/data persistence and retry cover neither images/PDFs nor durable offline synchronization. The backend already provides authenticated, idempotent `/captures`, `/memories`, `/uploads`, source processing states, and retry. Those APIs should be reused.

## Implementation and final verification

The following sections record the completed source changes, lightweight checks, and the later user-authorized USB startup. No emulator was used.

### Completed implementation

The initial table above is retained as the pre-change record. The changes below supersede its missing/partial source paths.

| Component | Final source/build status | Remaining manual check |
|---|---|---|
| Registration / URL target | Dedicated exported `ShareActivity` merged into the app manifest; exact supported MIME types; bookmark icon | Chrome/Instagram native Sharesheet appearance |
| URL / Instagram link | Pure validated URL extraction; original URL and surrounding text preserved; existing `/captures` ingestion | Real external-app input and extraction coverage |
| Plain text | Existing idempotent `/memories` note endpoint; multiple-URL text retained as one complete note | Real external text share |
| Images / PDF | Granted content streams copied into encrypted private files before dismissal; signatures/8 MiB limit checked | Real content providers, revoked grants, camera/gallery/file apps |
| Multiple files | SEND_MULTIPLE for supported images/PDFs, at most 10; atomic local enqueue of the batch | Rapid/multiple external intents and partial server completion |
| Cold start / offline | Native receiver and persistent network-constrained JobScheduler do not depend on React/Metro | Process death, reboot, OEM battery restrictions |
| Authentication | Existing verified session publishes an encrypted access token only; JS retains sole refresh-token ownership | Signed-out and expired-session flow, two real accounts |
| Account isolation | Ownership/session/legacy migration commit atomically; owner-bound list/retry/discard; old account data retained, never cleared on switch | Account-switch recovery and persistence fault cases |
| Server/local/failure confirmation | Compact translucent native light/dark surface; server check only after 2xx + memory ID and committed receipt; local queued state otherwise | Actual geometry, font scaling, TalkBack, source app visibility |
| Dismissal | Finish only the receiver; 3-second interval uses Android accessibility timeout recommendation | Real return-to-source behavior across sending apps |
| Recently Captured | Distinct encrypted device inbox, status/error/retry/removal; native changes trigger existing server refresh | End-to-end item transition into Library |

#### Native flow

Android system Sharesheet → `ShareActivity.onCreate/onNewIntent` → `SharePayload` validation → `ShareStore.receive` → encrypted app-owned outbox + synchronous metadata commit → persistent network job and immediate best-effort upload → existing API → server memory acknowledgment → committed receipt → encrypted file cleanup → compact native success → receiver finish.

A URL/text/file is never marked server-saved just because Android delivered an intent. If server acknowledgment is missing, the encrypted original and the same idempotency key remain. Corrupt/unreadable encrypted storage fails closed rather than becoming an empty queue. Copy/validation failure rolls back the new file batch, preserving earlier entries. File bytes are streamed through ContentResolver, encrypted with Android Keystore AES-GCM, file/directory synced, and placed in `noBackupFilesDir`; no filesystem-path assumption or broad storage permission is introduced.

`ShareStore` retains at most 20 pending items and 100 completed receipts. Each incoming Activity delivery has a new UUID, persisted through Activity recreation. Each queued item has its own stable API idempotency key. Recreating/retrying the same delivery does not create another request key; intentionally sharing the same URL later is allowed.

The receiver declares only text/plain, image/jpeg, image/png, image/webp, and application/pdf. SEND_MULTIPLE excludes text/plain. Providers/sending apps can use broad MIME labels; the receiver still validates actual MIME and file signatures and displays failure for unsupported content. It does not advertise image/*, arbitrary documents, video, or an Instagram-specific scraping capability.

`ShareSync` calls the existing authenticated `/captures`, `/memories`, and `/uploads` APIs. Redirects are disabled so access tokens cannot follow a redirect to another origin. Connection/read timeouts retain the original pending request; 429/5xx/network failures are retryable. Definitive rejection/expired idempotency keys require review rather than generating another key. A JobService is protected by Android's BIND_JOB_SERVICE permission; RECEIVE_BOOT_COMPLETED permits persisted jobs. No third-party share/background library was added.

The only backend contract addition is optional `Link.shared_text` (up to 100,000 characters), preserving caption/text alongside the original `source_url`. Existing callers and default idempotency fingerprints remain unchanged. Existing processing, user ownership, DB transactions, session APIs, and refresh-token behavior are retained. Restart the local API after updating this code; the old strict request model will reject the new field until restarted.

#### Authentication and lifecycle boundaries

The existing session provider publishes only after `/me` verifies the signed-in account. Bridge operations are serialized and generation-checked. The native store persists the access token encrypted and never reads, duplicates, or rotates the app's refresh token. Account switching does not delete another account's outbox; native management methods also check the expected account ID. Legacy URL records retain their existing keys and last-owner identity.

A signed-out share is encrypted without an owner and shows a necessary Sign in to sync control. Successful real authentication binds unowned shares to that account and schedules synchronization. Already owned shares are never rebound. Expired credentials wait for the existing app session to renew; foreground reopen or manual outbox retry invokes that session path. The native job does not invent an authenticated identity.

Normal authenticated sharing finishes the separate receiving Activity and returns to the source wherever the sending app/task behavior permits. Choosing Sign in/Open RecallBox deliberately opens the main app; after authentication, synchronization proceeds there and the user may remain in Library. The implementation does not forcibly close the main app or switch unrelated tasks after login. Android force-stop suspends jobs until the app is opened again; persisted jobs are subject to connectivity, credentials, and OS scheduling/battery limits. All encrypted items remain inspectable/retryable for their owner.

Native sharing is now distinct from in-app composers: the native receiver has a durable encrypted outbox; note/link/file composer drafts still only survive while mounted. Help/recovery copy is updated to avoid claiming all app drafts are queued offline.

#### Files

- Native module: `ShareActivity.kt`, `ShareStore.kt`, `SharePayload.kt`, `ShareSync.kt`, `RecallBoxCallbackModule.kt`, library manifest/theme/icon/colors, and Gradle font asset copy.
- Expo plugin: remove obsolete MainActivity share filters/hooks, preserve authentication callbacks, and prevent duplicate targets when regenerated.
- Session bridge: `src/share-inbox.ts`, `src/session.tsx`; no new refresh-token consumer.
- UI/recovery: account layout (remove automatic full-screen share redirect), incoming-share route (manual recovery only), Library/Empty Library/Recently Captured and saving guide.
- Backend: `src/recallbox/capture.py`, optional shared-text field only; no migration.
- Assets: existing RB-01 DM Serif Display/OFL reused directly during native build; small code-native bookmark vector. No screenshot/background or external app UI is bundled.

### Actual verification

- TypeScript: PASS.
- Android JavaScript/Hermes asset export: PASS.
- Kotlin compile and real merged app manifest: PASS. Initial compiler/Gradle compatibility errors were fixed, then rerun.
- Full debug APK build: PASS, 29 seconds / 482 tasks, after the user explicitly requested local startup on the USB phone. No emulator.
- Pure compiled JVM validation: 18 URL/text/signature cases passed, including original URL/caption preservation, multiple URLs, credentials/port/backslash rejection, oversized/blank text, and supported/mismatched file signatures. These do not test Android grants/Keystore/runtime behavior.
- Backend schema checks: legacy request defaults/fingerprint input preserved, caption preserved, oversized and extra fields rejected.
- Plugin checks: removes legacy SEND targets, preserves VIEW/MAIN/callbacks, and is idempotent.
- Merged-manifest checks: one exported ShareActivity, exact SEND/SEND_MULTIPLE MIME sets, protected job service, boot permission, no SEND filter on MainActivity; copied native font bytes match RB-01.
- Whitespace/import/type checks passed; no unrelated tsconfig edit is included.

### USB findings and user-authorized startup

Initial read-only physical-device inspection found the installed package but **no resolving activity** for SEND text/plain, image/png, or application/pdf. This is concrete evidence that the installed old APK could not receive those shares; it is not an observation of another app's Sharesheet UI.

The user subsequently enabled USB debugging and explicitly asked to start the application locally. Started the existing loopback API, Metro, and processing worker, enabled USB reverse for 8001/8081, built the updated development APK, installed with `adb install -r` (no uninstall/data wipe), and opened the existing development-client link. A subsequent installed-package URL query resolves `app.recallbox.mobile/expo.modules.recallboxcallback.ShareActivity`, and MainActivity is foreground.

**Not claimed:** completed real share/save, actual Chrome/Instagram Sharesheet appearance, screenshots/light-dark visual acceptance, account-switch/isolation, offline/reboot/kill recovery, or a completed authentication flow. Those remain the user's physical checks in [RB-03-USB-TESTING.md](RB-03-USB-TESTING.md). No emulator or Android Studio was started.
