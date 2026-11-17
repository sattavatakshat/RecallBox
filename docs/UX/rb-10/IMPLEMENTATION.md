# RB-10 Adaptive Content Viewer

## Audit and architecture

RB-09 already owns the single `memory/[id]` route, SavedText editorial reader,
origin-aware Back, authenticated asset access, native file sharing/PDF handoff,
Star, Organize, More, destructive confirmations, draft guards and expected-version
updates. The existing image modal contained a static Image with no zoom/pan.
Image previews followed the actions and repetitive processing/coverage notices.
`source/[id]` already exposes actual extraction state, errors and metadata.
The processing worker extracts PDF/article text; current image processing returns
image dimensions as metadata, not OCR. No backend changes were necessary.

RB-10 keeps that route and its handlers. A narrowly scoped `ImageViewer` component
owns the modal and media gestures. Image detail uses the central warm ivory/forest
palette, DM Serif Display hero title, source icon, authentic image, expand affordance,
Share original and the existing outlined Star / Organize / More controls. No
new route, bottom bar, FAB, sample content, palette or reader was introduced.
Routine image extraction notices are available under More → Source details.
Missing originals and failed previews still produce visible contextual errors.
Source details now explicitly reports original availability and supports the
existing retry endpoint for failed processing.

## Media and actions

The private asset endpoint supplies the image with a current bearer header.
Preview retry reacquires authorization. Reload policy avoids deliberately relying
on an offline cache. The account-keyed MemoryProvider unmounts the reader/viewer
on account changes; async image setup is canceled on cleanup. Native image cache
is platform managed; this feature makes no secure offline-storage guarantee.

Intrinsic loaded dimensions determine hero aspect ratio. Contain scaling, a
responsive height limit, and Android resize decoding avoid cropping and help
limit decoding cost. Full screen fits the actual image within the measured safe
viewport. Pinch uses native Gesture Handler recognition and Reanimated UI-thread
values, scales 1–6× around the focal point, and clamps translation to image bounds.
One-finger pan moves zoomed content; pinch and pan are coordinated. Double-tap
switches between 1× and 3×. Reset zoom is an accessible shared control. Closing
unmounts zoom state; reopening or viewport resizing resets it. The Modal handles
Android Back before route navigation and isolates gestures from the page scroll.
Reduced motion disables the modal fade; gestures have no timed animation.

Original sharing reuses authenticated retrieval and expo-sharing, preserves
response MIME and original bytes, uses a unique app-cache file, checks native
sharing availability, aborts downloads on reader unmount/timeout, checks account
generation before handoff, and deletes the temporary file in finally (including
share-sheet dismissal). Missing files, authentication, network, local storage,
share launch and cleanup failures have distinct handling. Files are not written
to public storage. Cache-file cleanup after process termination remains OS managed.

Star uses existing persisted expected-version edits. Organize and More preserve
existing destinations, conflict restrictions, archive/restore, delete confirmation,
reminders and edit-draft guards. Existing stack Back preserves the underlying
Library/Search/Collection screen rather than reconstructing it.

PDF retains native open/share and genuine extracted text through SavedText; no
paginated PDF renderer is claimed. Articles retain the same reader and original
link. Social/link-only saves show the real URL and available metadata, never a
transcript or automatic playback. Notes retain authored content and editing.
Image dimension metadata is not rendered as OCR; only ready extracted text can
appear in the reader.

## Dependencies and verification

Promoted existing transitive native packages to direct dependencies, selecting the
installed Expo 58 compatibility map: Gesture Handler ~3.3.0 (resolved 3.3.0),
Reanimated 4.7.1 and Worklets 0.13.0. Reanimated's shipped compatibility table and
peers cover RN 0.88 and Worklets 0.13; Gesture Handler peers accept installed
React/RN. npm ls confirms one deduplicated copy of each. Expo's Babel preset
already installs the Worklets plugin, including gesture-hook callback support.
No additional viewer package or second animation framework was introduced.
A native development-client rebuild is required after these version changes.

Performed: npm run typecheck; npm run design:check; git diff --check;
npx expo install --check (offline, using the local SDK map); npm ls for native
peers/deduplication; Android Metro/Hermes export to a private temporary directory.
No new automated test suite, emulator, Android Studio, native build or physical
phone verification was run. Screenshot fidelity, gestures, native sharing and
real-device accessibility remain pending the checklist below. npm install reports
four moderate dependency audit findings; unrelated dependency upgrades were not
included.

## USB physical-device checklist

From the repository root, with only the USB phone connected and debugging allowed:

```sh
cd apps/mobile
npm ci
adb devices -l
npx expo run:android --device
adb shell pm path app.recallbox.mobile
adb reverse tcp:8081 tcp:8081
npm start
```

Choose the physical device if prompted. `expo run:android --device` builds and
installs the development client; if its Metro server is still running, use that
server instead of starting a second one. Use the existing project API/auth
environment configuration and ensure the phone can reach that API. Never launch
an emulator. The package is `app.recallbox.mobile` (app.config.ts).

- [ ] Image from Library: authentic content, full aspect ratio, wrapped title,
      source type/date, no redundant Photo chip or routine coverage panel.
- [ ] Tap image and bottom-right expand affordance; pinch in/out, pan in every
      direction while zoomed, double-tap, Reset zoom, Close and reopen (reset).
- [ ] Android Back closes full-screen first; another Back returns to origin.
      Parent reader does not scroll during gestures; no Library/FAB overlays.
- [ ] Portrait, landscape, very wide, very tall and large images; rotation if
      enabled by the app/device. Viewport changes reset zoom and preserve fit.
- [ ] Failed preview: honest error, Retry preview, original sharing fallback.
      Test offline, deleted original, slow network and expired authentication.
- [ ] Share original to a compatible app: original bytes/MIME, dismiss share sheet,
      repeat, check storage failure and cleanup handling. Switch accounts during
      a pending download and confirm no old-account media/share appears.
- [ ] Return to Library, Search Results and Collection: query, filters, scroll
      position and collection state remain. No duplicate Memory Detail routes.
- [ ] Star/unstar persists after reopen; Organize and add-to-collection work.
      More opens once; edit details, archive/restore, reminder, delete confirmation,
      Source details, failed-processing retry all retain supported behavior.
- [ ] Unsaved edit Back/cancel protection; remote version conflict preserves draft,
      compare/latest resolution and disabled conflicting actions.
- [ ] PDF native open/share and extracted text; encrypted/corrupt/unsupported PDF
      remains honest. Article long-form reading, note reading/editing, Instagram
      link-only URL/Open original, failed extraction with original retained.
- [ ] Light/dark screenshot comparison, safe areas under gesture/three-button
      navigation, large font/display settings, TalkBack labels/order, 48dp
      controls, reduced-motion setting and readable full-screen controls.

## Limits

No tiled or original-pixel-resolution image engine: platform downsampling can
soften deeply zoomed large photos, and extreme dimensions need phone memory QA.
No paginated PDF viewer, OCR engine, social-video player, fabricated extraction,
new offline cache, or backend processing capability. Rotation follows existing
app orientation policy. Native share cancellation has no positive success message.
