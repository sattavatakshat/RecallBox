# RB-03 — Physical Android share testing

All real share, appearance, authentication, persistence, and return-to-source checks below are **pending user verification**. The updated development app has been installed/opened on the connected phone at the user's request. No emulator is used.

## Local setup / repeat installation

1. Enable USB debugging, connect/unlock the phone, and authorize the Mac. Run `adb devices -l`. Substitute the physical phone's actual serial for `USB_SERIAL` below; do not target an emulator.
2. Ensure the local API uses the updated source (the optional `shared_text` capture field is new). In the terminal that owns an older API, stop it with Ctrl+C, then from `/Users/akshat/Desktop/RecallBox` run `bash scripts/run-local.sh api`. Reuse a current server rather than starting a second listener. Private configuration is loaded by the existing script; do not print or commit it.
3. Run `bash scripts/run-local.sh mobile` from the repository, or `npm start -- --port 8081` in `apps/mobile`. Reuse the running Metro instance. To process captured sources after storage, run `bash scripts/run-local.sh worker` in another terminal (real accounts must exist first).
4. A **native APK update is required** for the receiving Activity, manifest, job, icon, and bridge. A Metro/OTA reload alone is insufficient. From `apps/mobile`, use the existing script:

   ```sh
   npm run android -- --device USB_SERIAL --no-bundler
   ```

   Alternatively, install an already rebuilt APK without deleting data:

   ```sh
   adb -s USB_SERIAL install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
   ```

   The install command above is run from the repository root. Do not uninstall or clear app data; those operations would remove the encrypted outbox/credentials. If a previously generated project has duplicate legacy targets, run `npx --no-install expo prebuild --platform android --no-install` in `apps/mobile` before rebuilding; the config plugin removes the old MainActivity share filter and keeps authentication callbacks.
5. Connect the existing loopback API/Metro through USB:

   ```sh
   adb -s USB_SERIAL reverse tcp:8001 tcp:8001
   adb -s USB_SERIAL reverse tcp:8081 tcp:8081
   adb -s USB_SERIAL reverse --list
   ```

6. Open the development app and sign in/restore a real account once. It publishes the verified account's encrypted native access token. The existing development link can be opened explicitly:

   ```sh
   adb -s USB_SERIAL shell am start -a android.intent.action.VIEW -d 'app.recallbox.mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' app.recallbox.mobile
   ```

Native sharing itself runs without Metro/React once configured; renewed authentication and in-app Library still use the existing application. Release builds require a correctly configured HTTPS API; loopback HTTP is allowed only in the debug configuration.

## Resolver / package / logs (read-only)

```sh
adb -s USB_SERIAL shell pm path app.recallbox.mobile
adb -s USB_SERIAL shell cmd package query-activities --brief -a android.intent.action.SEND -c android.intent.category.DEFAULT -t text/plain -p app.recallbox.mobile
adb -s USB_SERIAL shell cmd package query-activities --brief -a android.intent.action.SEND -c android.intent.category.DEFAULT -t image/png -p app.recallbox.mobile
adb -s USB_SERIAL shell cmd package query-activities --brief -a android.intent.action.SEND -c android.intent.category.DEFAULT -t application/pdf -p app.recallbox.mobile
adb -s USB_SERIAL shell cmd package query-activities --brief -a android.intent.action.SEND_MULTIPLE -c android.intent.category.DEFAULT -t image/jpeg -p app.recallbox.mobile
adb -s USB_SERIAL logcat -s RecallBoxShare:I AndroidRuntime:E ReactNativeJS:E
adb -s USB_SERIAL shell dumpsys jobscheduler app.recallbox.mobile
```

Expected receiver component: `app.recallbox.mobile/expo.modules.recallboxcallback.ShareActivity`. The prior installed APK resolved no receiving activity; after the updated install, URL resolution finds this component. If still absent, verify the APK/package/device, not just the JS bundle. Resolver output alone does not prove visibility in a sending app's actual Sharesheet.

Useful sanitized log messages:

- `Encrypted share queued; retry scheduled` — encrypted device persistence and scheduling, **not server confirmation**.
- `Encrypted share queued; manual retry available` — local copy retained; inspect/retry from RecallBox if automatic scheduling was unavailable.
- `Server save confirmed` — durable server acknowledgment and committed local receipt.
- `Outbox unavailable; no payload discarded` — storage/retry needs attention; do not clear app data.

Logs deliberately exclude URLs, shared text, file paths, credentials, and tokens. Do not publish unrelated device log history or private content.

## First real URL / Instagram test

1. Open Chrome on the phone and visit a public page.
2. Use Chrome's Share action to open the **Android system Sharesheet**. Verify RecallBox appears with its bookmark icon.
3. Choose RecallBox once. No preview, category, title form, or additional Save button is required.
4. With a reachable API and valid account, expect the compact **Saved to RecallBox** / **You're all set. Keep browsing.** checkmark only after server acknowledgment.
5. Verify automatic dismissal after roughly three seconds (or the longer accessibility-recommended interval), with Chrome restored where task behavior permits.
6. Open RecallBox. Find the item in Library if usable, or Recently Captured if processing. A server save is not a claim that extraction/transcription/OCR has completed.
7. Repeat from Instagram's external/system-share action for a reel URL. Some Instagram menus are internal first; use its Share to/More path to reach the system sheet. Only the original URL/text is captured; restricted content may finish as link-only/metadata-only. No scraping bypass is attempted.
8. Share the same URL again intentionally: it is a new delivery and may create another memory. Network retries/recreation of one delivery reuse its original key instead.

## Required edge cases

- [ ] Light and dark confirmation: compact ivory/forest surface, serif title, matching geometry, readable font scaling, correct status/gesture insets; no full-screen illustration or source-app imitation.
- [ ] TalkBack/longer timeout: announcement is readable; accessibility timeout is honored. Back can close a completed/queued confirmation without dropping queued content.
- [ ] Warm/foreground/background app: share from another app, confirm no redirect into the old full-screen incoming-share page.
- [ ] Cold process: close the main app, optionally stop its process **before** sending, then share from Chrome. Once the user explicitly shares again Android starts the receiver; it persists independently of Metro.
- [ ] Signed out: use the existing Account sign-out first. Share a real item; expect **Saved on this device**, with **Sign in to sync**. Complete real authentication in the main app; inspect automatic sync/Library. Opening authentication deliberately opens RecallBox and may leave the user in Library afterward.
- [ ] Expired session: keep the encrypted item; open RecallBox or use device-inbox Retry to run the existing session renewal path. The native job never rotates a second copy of the refresh token.
- [ ] Offline/server unavailable: expect **Saved on this device** / **We'll sync when you're connected.** with queued indicator, not the server-saved checkmark. Open Recently Captured → View device shares and retry.
- [ ] Offline with USB: disabling Wi-Fi/mobile data may **not** disconnect a loopback API reached through ADB. To simulate API loss accurately, stop the API or temporarily run `adb -s USB_SERIAL reverse --remove tcp:8001`; restore the mapping afterward. Do not misinterpret successful USB connectivity as a false offline save.
- [ ] Reconnect: verify JobScheduler or explicit Retry syncs the original request key and removes the local entry only after acknowledgment. OS scheduling/battery limits can delay background work.
- [ ] Kill/reboot after local confirmation: reopen the app with the same account and inspect the retained encrypted share. A force-stopped app's jobs resume only after it is opened again; do not clear data or uninstall.
- [ ] Text-only: share real non-empty text; verify an intact note. Text with several URLs is kept as a complete note. A single supported URL plus caption retains both the original URL and caption.
- [ ] Images/files: share real JPG, PNG, WebP, and PDF content URIs; verify original bytes can be reopened through the existing saved-source flow. Test a provider that grants only temporary URI access; the encrypted copy is made before dismissal.
- [ ] Multi-file: share up to 10 supported files. Confirm every item is retained locally, and that server confirmation for the whole delivery appears only when all items are acknowledged. No partial local enqueue on validation failure.
- [ ] Unsupported/empty/oversized input: expect **Couldn't save** / **Your item hasn't been saved.**, Retry and Cancel; no success checkmark or automatic failure dismissal. File cap is 8 MiB each, text cap 100,000 characters, queue cap 20 pending items.
- [ ] Server timeout/upload failure: encrypted originals remain; retry does not invent another key. Permanent errors/expired idempotency windows require review, not automatic duplicate creation.
- [ ] Rapid shares: deliver several distinct shares while the receiver is open; verify none disappear and the UI reflects the current delivery.
- [ ] Account isolation: queue under A, switch to B. B must neither see, upload, nor delete A's outbox. Sign back into A to recover its pending items. Never clear queues simply to switch accounts.
- [ ] Cancel failure: Retry attempts the original input; Cancel closes an unpersisted failure. A durably queued item is retained on Close/Back. Removing a queued local copy in the manual inbox requires explicit confirmation and is refused while that item is in flight.

Record the actual device/Android version, commit, steps, and PASS/FAIL. No complete share/save or UI acceptance has yet been claimed by Codex.
