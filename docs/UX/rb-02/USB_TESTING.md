# RB-02 — Physical Android USB checklist

The user performs these checks. No emulator is required or permitted by this task. All boxes below are initially **unverified**.

## Run the existing development build

Enable USB debugging, connect/unlock the Android phone, and accept its debugging authorization prompt. List devices:

```sh
adb devices -l
```

Use the actual physical phone's serial wherever `USB_SERIAL` appears below. Do not select a device whose serial begins with `emulator-`.

From the repository:

```sh
cd /Users/akshat/Desktop/RecallBox/apps/mobile
npm start -- --port 8081
```

If Metro is already running on 8081, reuse that terminal/server rather than starting a second copy. Press `r` there to reload after switching to the implementation branch. Do not press `a` to select/launch an emulator.

In another terminal:

```sh
adb -s USB_SERIAL reverse tcp:8081 tcp:8081
adb -s USB_SERIAL reverse tcp:8001 tcp:8001
```

The existing local API must be running on port 8001 with the project's private runtime configuration. Keep that configuration outside Git; never paste credentials into a test report. Do not start a second API instance or add a public tunnel for USB testing.

Open the already-installed RecallBox development app on the phone and connect to the local Metro server at `http://127.0.0.1:8081`. Use the Expo development-client server picker if needed. Sign in through the existing real authentication flow. To inspect a truly empty Library, use a real empty test account; do not delete personal saved items just for this check.

These changes are JavaScript/assets only and reuse the existing native dependencies. If a native development build is absent/stale, the project's actual Android script supports a physical-device target:

```sh
cd /Users/akshat/Desktop/RecallBox/apps/mobile
npm run android -- --device USB_SERIAL --no-bundler
```

This builds/installs on the explicitly selected USB device using the existing Android toolchain. Skip it if the installed development build already works. A stale native build may lack the share intent filter even when current JS is loaded; share availability is therefore conditional in the guide.

## Appearance and navigation

- [ ] Light mode: ivory/forest palette, RecallBox header, exact approved headings/copy, card illustration with binder clip, forest Save button, selected Library tab.
- [ ] Dark mode: deep forest background, ivory text, lime brand/button/selected state; same geometry.
- [ ] Avatar: actual name initials when present, neutral profile icon otherwise. Tap opens real Account & Settings; return with Android Back.
- [ ] Empty Library has one Save CTA and **no floating Save button**, notification bell, or search bar.
- [ ] Bottom Search opens the real Search screen. Empty-account copy is truthful; submitting a real query does not fabricate results.
- [ ] Enter a Search query, visit Collections, then tap Search: confirm the existing mounted query remains. Tap Library to return to the root Library.
- [ ] Collections opens the real list/empty state; existing creation and collection browsing still work with actual API confirmation.
- [ ] Android Back returns through the actual route history from Search/Collections/Account. Root Library retains normal Android app-back behavior.

## Save and guide

- [ ] Save opens the existing sheet with Paste a link, Write a note, Photo or screenshot, and File or document (PDF only).
- [ ] Close the sheet using its close button, backdrop, and Android Back; each returns to Library.
- [ ] Paste URL opens the existing composer; cancel with empty input returns to Library. With input, Back prompts before discarding; Keep editing retains the URL.
- [ ] Write note retains its existing unsaved-draft guard and title/content on a cancelled exit.
- [ ] Photo/screenshot opens image actions; cancel the system picker without a false saved message. Camera permission is requested only after choosing Take a photo.
- [ ] File/document opens PDF capture, discloses PDF-only/8 MiB limits, and truthfully rejects unsupported/oversized input.
- [ ] Successful server-confirmed note/link/file saves open the real saved record; Back returns through the expected route without reopening an orphan Save sheet.
- [ ] How saving works opens the short share guide. Got it, backdrop, and Android Back dismiss it. No permissions are requested merely to read it.
- [ ] If the installed build exposes RecallBox in another app's Android share menu, test a real web link. Otherwise use the guide's copy/paste fallback; do not mark native sharing passed just because the guide opens.

## State, failure, and layout

- [ ] First durable queued/processing capture appears in Recently captured with an accurate status and an inspection link. No invented progress percentage appears.
- [ ] Failed processing shows Needs attention; its capture-recovery screen offers the existing retry/source/record controls.
- [ ] When the first usable item becomes ready (or finishes as an honest link-only preview), Library transitions to its normal populated screen and restores the FAB.
- [ ] With multiple pages of pending captures, an older usable memory is found rather than incorrectly presenting the account as empty.
- [ ] Disconnect/reconnect network during loading: show an error/retry or cached data, never a false empty-account confirmation.
- [ ] Disconnect during a save: show no false success. Keep the composer open and confirm its input/request is retained for safe retry. Leaving an unconfirmed file attempt prompts first. There is no promised durable offline outbox.
- [ ] Try increased system font and display sizes, a small viewport, and landscape. The illustration shrinks, copy reflows/scrolls, and Save/tab controls remain reachable above Android system navigation.
- [ ] Confirm populated Library filters/cards, existing session restore, and logout are unaffected.

Record actual PASS/FAIL and a short reproduction with commit SHA/device/Android version. Keep personal memories, authorization tokens, and account credentials out of screenshots or committed reports.
