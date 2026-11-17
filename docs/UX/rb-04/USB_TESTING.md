# RB-04 — Physical Android manual checklist

All boxes are initially **unverified**. No emulator is required or permitted. This task does not take control of the phone; the user runs installation/launch and performs acceptance.

## Start and update

Use the actual connected physical serial in place of `USB_SERIAL`:

```sh
adb devices -l
```

Keep the existing local API and Metro running, or start them from the repository in separate terminals:

```sh
cd /Users/akshat/Desktop/RecallBox
bash scripts/run-local.sh api
```

```sh
cd /Users/akshat/Desktop/RecallBox/apps/mobile
npm start -- --port 8081
```

Reuse current listeners instead of starting duplicates. For processing after capture, the existing `bash scripts/run-local.sh worker` command is available from the repository root after a real account exists.

RB-04's Android photo picker extends the existing native module, so **reload alone is insufficient**. Build/install on the explicitly selected USB phone with the actual project script:

```sh
cd /Users/akshat/Desktop/RecallBox/apps/mobile
npm run android -- --device USB_SERIAL --no-bundler
```

Do not select an emulator. The command is for the user to execute and may launch the explicitly selected phone after install. Do not clear app data or uninstall to update. If an updated APK has already been built, install it from the repository root:

```sh
adb -s USB_SERIAL install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb -s USB_SERIAL reverse tcp:8001 tcp:8001
adb -s USB_SERIAL reverse tcp:8081 tcp:8081
adb -s USB_SERIAL shell am start -a android.intent.action.VIEW -d 'app.recallbox.mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' app.recallbox.mobile
```

Sign in through the real flow. Native photo support is Android 13+; older supported Android versions fall back to the system document UI. If the native update is not installed, the image editor explains the limitation and offers Choose from Files.

## Sheet and appearance

- [ ] Empty Library → Save something opens the approved sheet, with the Library dimly visible.
- [ ] Populated Library → floating Save opens the same sheet. Open/close while scrolled down; confirm the Library does not resize or lose its position.
- [ ] Light: ivory sheet, forest title/icons, pale sage icon backgrounds, fine row dividers.
- [ ] Dark: forest sheet, ivory text, dark sage icon backgrounds, lime icons/chevrons. Same geometry.
- [ ] Exact labels: Save something / Choose what to save. / Paste a link / Write a note / Photo or screenshot / PDF document, with the approved subtitles. No video row or extra chooser step.
- [ ] Close icon, Android Back, and backdrop dismiss. Drag down from handle/header to dismiss; a short drag returns the sheet to position.
- [ ] With reduced motion on, dismissal does not animate. Test large system text, display scaling, compact viewport and landscape: rows scroll, close/action targets remain reachable, and the sheet clears gesture/status insets.
- [ ] TalkBack reads the header/actions/close in a useful order; outline icons are decorative, not duplicated labels.
- [ ] Open the existing Save deep link directly: it can close/back to Library rather than stranding the user on an empty overlay.

## Link and note

- [ ] Paste a link autofocuses the URL field and opens the keyboard.
- [ ] Empty, incomplete, non-HTTP(S), whitespace/control/backslash, credentials, and custom-port input cannot enable Save. A valid HTTP(S) URL does.
- [ ] Save a public link through the real API. Only after acknowledgment, return to Library with real confirmation and discoverable original/processing status. Do not equate a saved Instagram URL with extraction/transcription.
- [ ] Write a note autofocuses its content field, permits an optional title, and rejects whitespace-only content.
- [ ] Save a real note, return to Library and reopen it to verify exact text persisted. No category/tag/collection is required.
- [ ] Rapidly tap Save: one in-flight attempt/key is used.
- [ ] Cancel with text: Keep editing retains it. Leave and keep draft returns safely; reopening the same editor/account restores it while the app remains open.
- [ ] Keyboard-aware scrolling keeps the fields/Save reachable.

## Images and PDF

- [ ] Photo row opens the native photo picker directly on an updated supported phone. No mandatory camera/gallery chooser.
- [ ] Select a supported image: see its real local preview, filename, actual size and MIME. No upload starts before Save.
- [ ] Save image uploads through the existing real endpoint and returns to Library only on acknowledgment.
- [ ] Optional Take a photo requests camera permission only then; capture can be previewed/saved, cancelled, or denied truthfully.
- [ ] Choose from Files remains available as a provider fallback.
- [ ] PDF row opens the document picker directly, restricted to PDF. Filename and actual size appear before Save; no automatic upload.
- [ ] Select a real PDF and save; find the stored original and actual processing status.
- [ ] Cancel the initial native picker: return without creating an item or displaying success. Cancel replacing an existing selection: preserve the prior file/attempt.
- [ ] Try oversized (>8 MiB), empty, unsupported, and mismatched-extension/signature inputs: explain the failure and offer selection again. Save is not offered for an invalid/unreadable selection.
- [ ] Recreate the activity while choosing a photo where feasible: recovery must remain bound to the launching account, never another user. In-memory drafts/cache are not promised to survive a full app kill.

## Failure, expiry, and discoverability

- [ ] Stop the API or remove USB reverse for 8001, then save: no false confirmation, input/selection retained, same-key Retry available. Turning off Wi-Fi alone may leave ADB loopback connectivity active.
- [ ] Reconnect/start the API and restore `adb -s USB_SERIAL reverse tcp:8001 tcp:8001`; retry the original request without duplicate items.
- [ ] Definitive validation errors permit correcting input. Ambiguous failures freeze the original body/key; replacing an unconfirmed file requires acknowledgment of the risk that it already reached the server.
- [ ] Expire the session during a save; reauthenticate as the same account and reopen the editor to recover the memory draft where still available. A session change after a possibly committed request must retain its original key.
- [ ] Sign in as another real account: do not show or submit the first account's draft/pending picker result.
- [ ] After save from Starred/Archived/topic filters, the saved item is discoverable in the normal Library rather than hidden by an old filter. Actual unfinished processing remains inspectable through the existing status/recovery UI.
- [ ] No flow automatically opens an unfinished item detail screen.
- [ ] No in-app offline-save claim: editor drafts live only in app memory/cache. RB-03's encrypted native share outbox is a separate feature.

For diagnostics without clearing data:

```sh
adb -s USB_SERIAL shell pm path app.recallbox.mobile
adb -s USB_SERIAL reverse --list
adb -s USB_SERIAL logcat -s AndroidRuntime:E ReactNativeJS:E
```

Record actual PASS/FAIL with device, Android version and commit. Keep tokens, credentials and personal content out of shared logs/screenshots.
