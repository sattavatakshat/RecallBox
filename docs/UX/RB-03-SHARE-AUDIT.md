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

Pending: update this section after source/native configuration changes and lightweight checks. No emulator or automatic phone launch is permitted.
