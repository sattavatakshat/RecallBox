# RB-DS-01 delivery — 17 November 2026

## Audit and implementation

[Initial audit](AUDIT.md) records the competing palette/font/control/icon implementations before edits. [RecallBox Design System](../RECALLBOX_DESIGN_SYSTEM.md) is the permanent source-of-truth contract, including full light/dark tables, typography, spacing, geometry, examples, component inventory, accessibility and documented exceptions. `apps/mobile/AGENTS.md` directs future UI work to read it.

Foundation: one authored token file, typed system theme/font provider, shared text/input/button/icon/loading/feedback/card/filter/sheet components, shared account/header/navigation and memory row. Existing brand/save/icon APIs are adapters over that foundation. No new screens, API contracts or backend behavior.

Migrations: RB-01 Welcome, RB-02 Empty Library, RB-04 Manual Save and RB-06 Library use shared foundations and controls. RB-03 native confirmation uses generated Android tokens and the same Lucide paths/font asset. Account, Search/Results, Collections and Collection Detail, Memory and Source Detail, Organize, Learning, Shopping, Trips, Reminders and recovery screens use the central foundation and real icons. Other existing editors and authentication screens inherit shared controls. Secondary screens retain their existing layout/behavior pending any future approved final UX; no separate legacy palette or icon family is intentionally retained.

The `approved` navigation prop remains source-compatible but no longer chooses a second palette. Save modal lifecycle, reduced-motion handling, routes and callbacks are preserved. Native confirmation's receive/persist/queue/retry/dismiss logic is unchanged; only presentation and system-bar icon appearance were changed. API/store/visibility/auth source files are unchanged.

## Dependencies

Direct additions, both pinned:

- `lucide-react-native@1.74.0`: the requested single outline family, compatible peer ranges for installed React 19/RN 0.88. Explicit per-icon imports avoid bundling the full icon catalog.
- `react-native-svg@15.16.0`: Lucide's required native renderer, matching the installed Expo 58 bundled-native-module version.

No font dependency: existing DM Serif Display/OFL and platform sans are reused. No UI framework or lint/test framework added. Twelve additional lockfile entries are renderer transitive dependencies: boolbase, css-select, css-tree, css-tree's source-map, css-what, dom-serializer, domelementtype, domhandler, domutils, entities, mdn-data and nth-check. No existing locked package version changed.

Native vectors and colors are generated with `npm run design:sync`. The generator also retains Lucide's license in a packaged native NOTICE asset. `npm run design:check` validates source conventions, contrast pairs and native resource freshness; existing mobile CI runs it before TypeScript. It is a lightweight policy check, not an automated behavior/visual test suite.

## Actual verification

- `npm run typecheck`: passed. A separate check using the committed tsconfig also passed; the user's local tsconfig edit is not required.
- `npm run design:check`: passed; no raw TS/TSX UI colors/fonts, Unicode graphic glyphs or direct text/input/loading primitive bypasses; native tokens and icons match the source; tested text-role contrast pairs pass 4.5:1.
- `git diff --check`: passed.
- `npm ls --depth=0`: passed; dependency graph has no peer errors.
- `npx expo export --platform android --output-dir /tmp/rbds-android-export`: passed. Final explicit-icon bundle was 3.2 MB / 1,430 modules versus the initial barrel-import check's 5.6 MB / 3,488 modules. This is JavaScript bundling, not a native APK/device test.
- `./gradlew :recallbox-callback:compileDebugKotlin --offline --no-daemon`: targeted native module/resources compile passed; no APK built. Existing Gradle deprecation/tooling notices remain.
- Static navigation review: route literal sets across modified screens match the original versions. Backend, API, shared memory state, visibility classifier and authentication implementation are unchanged.
- No Android emulator, AVD, Android Studio or physical-device session launched. No screenshot/device visual verification, full native app build or end-to-end interaction verification claimed.

## USB setup and concise checklist

A rebuilt native dev client is required: SVG is a new native dependency, and native RB-03 resources changed. Metro reload alone cannot install them. On the user's machine, when ready to test:

```sh
cd apps/mobile
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleDebug
```

From the repository root, start the existing backend and Metro scripts in separate terminals:

```sh
bash scripts/run-local.sh api
```

```sh
bash scripts/run-local.sh mobile
```

Select the actual USB-connected physical phone, then install and open the dev client:

```sh
export ANDROID_ADB="$HOME/Library/Android/sdk/platform-tools/adb"
"$ANDROID_ADB" devices -l
export DEVICE_SERIAL='REPLACE_WITH_YOUR_PHYSICAL_PHONE_SERIAL'
"$ANDROID_ADB" -s "$DEVICE_SERIAL" reverse tcp:8001 tcp:8001
"$ANDROID_ADB" -s "$DEVICE_SERIAL" reverse tcp:8081 tcp:8081
"$ANDROID_ADB" -s "$DEVICE_SERIAL" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
"$ANDROID_ADB" -s "$DEVICE_SERIAL" shell am start -a android.intent.action.VIEW -d 'app.recallbox.mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' app.recallbox.mobile
```

1. Light/dark: switch Android appearance (or `adb -s "$DEVICE_SERIAL" shell cmd uimode night no/yes`, using the actual ADB path above). Verify ivory/forest backgrounds, readable body/muted copy, selected states, input borders, sheets and system-bar icons. Restore your usual appearance afterward.
2. Welcome/Empty/Library: compare brand logo, serif headlines, supporting text, artwork placement, avatar, memory rows, stars and one FAB. Ensure no fake thumbnail or layout redesign.
3. Controls: inspect primary/secondary/quiet/destructive/disabled/busy buttons, inputs and focus, chips, cards, loading/errors and confirmation messages. Check that every icon is visible after native rebuilding.
4. Save sheet: close, backdrop, Android Back and drag dismissal; reduced-motion behavior; all link/note/image/PDF destinations and retained draft/error behavior.
5. Native Share: share real supported content from another app; check saving, saved, device-queued and failure/retry states, typography, icons, light/dark colors and accessible dismissal timing. Confirm it still works without opening the full React app.
6. Navigation: Library/Search/Collections tabs, profile, Detail and Back, archive and recovery destinations. Confirm filter/order/scroll retention and immediate durable-save visibility still work.
7. Safe areas: gesture and three-button navigation, last-row/FAB clearance, sheet scrolling, keyboard behavior, orientation and small-screen widths.
8. Accessibility: large font/display size, long titles/labels and TalkBack. Check no cropped labels, visible focused controls, meaningful announcements and 48dp targets.

Known limits: screen fidelity and interactions await physical-device testing; policy checks are not an exhaustive spacing/layout linter. Secondary screens were standardized safely at the foundation level; their information architecture was not redesigned.

## Git scope

Work directly on main. Commit message: `refactor(mobile): standardize RecallBox design system`. Preserve the pre-existing `apps/mobile/tsconfig.json` change unstaged. Commit and push only the design-system work. See the final delivery message for the actual SHA and push result.

## Exact changed-file inventory

### Modified

- `.github/workflows/recallbox-mvp-static.yml`
- `apps/mobile/app/(account)/account.tsx`
- `apps/mobile/app/(account)/add-to-collection.tsx`
- `apps/mobile/app/(account)/capture.tsx`
- `apps/mobile/app/(account)/collection/[id].tsx`
- `apps/mobile/app/(account)/collections.tsx`
- `apps/mobile/app/(account)/incoming-share.tsx`
- `apps/mobile/app/(account)/index.tsx`
- `apps/mobile/app/(account)/learning.tsx`
- `apps/mobile/app/(account)/memory/[id].tsx`
- `apps/mobile/app/(account)/next-steps.tsx`
- `apps/mobile/app/(account)/organize.tsx`
- `apps/mobile/app/(account)/recovery.tsx`
- `apps/mobile/app/(account)/reminder.tsx`
- `apps/mobile/app/(account)/reminders.tsx`
- `apps/mobile/app/(account)/results.tsx`
- `apps/mobile/app/(account)/save.tsx`
- `apps/mobile/app/(account)/search.tsx`
- `apps/mobile/app/(account)/shopping/[id].tsx`
- `apps/mobile/app/(account)/source/[id].tsx`
- `apps/mobile/app/(account)/trip/[id].tsx`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/modules/recallbox-callback/android/src/main/java/expo/modules/recallboxcallback/ShareActivity.kt`
- `apps/mobile/modules/recallbox-callback/android/src/main/res/values-night/colors.xml`
- `apps/mobile/modules/recallbox-callback/android/src/main/res/values/colors.xml`
- `apps/mobile/modules/recallbox-callback/android/src/main/res/values/styles.xml`
- `apps/mobile/package-lock.json`
- `apps/mobile/package.json`
- `apps/mobile/src/brand.tsx`
- `apps/mobile/src/empty-library.tsx`
- `apps/mobile/src/library-icons.tsx`
- `apps/mobile/src/manual-save-icons.tsx`
- `apps/mobile/src/manual-save-ui.tsx`
- `apps/mobile/src/memory-card.tsx`
- `apps/mobile/src/navigation.tsx`
- `apps/mobile/src/saving-guide.tsx`
- `apps/mobile/src/ui.tsx`
- `apps/mobile/src/welcome-theme.ts`
- `apps/mobile/src/welcome.tsx`

### Created

- `apps/mobile/AGENTS.md`
- `apps/mobile/modules/recallbox-callback/android/src/main/assets/design-system-NOTICE.txt`
- `apps/mobile/modules/recallbox-callback/android/src/main/res/drawable/recallbox_icon_check.xml`
- `apps/mobile/modules/recallbox-callback/android/src/main/res/drawable/recallbox_icon_clock.xml`
- `apps/mobile/modules/recallbox-callback/android/src/main/res/drawable/recallbox_icon_triangle_alert.xml`
- `apps/mobile/modules/recallbox-callback/android/src/main/res/drawable/recallbox_icon_upload.xml`
- `apps/mobile/modules/recallbox-callback/android/src/main/res/values/recallbox_design.xml`
- `apps/mobile/scripts/check-design-system.cjs`
- `apps/mobile/scripts/sync-design-system.cjs`
- `apps/mobile/src/design-tokens.json`
- `apps/mobile/src/icons.tsx`
- `apps/mobile/src/navigation-ui.tsx`
- `apps/mobile/src/theme.tsx`
- `docs/UX/RECALLBOX_DESIGN_SYSTEM.md`
- `docs/UX/rb-ds-01/AUDIT.md`
- `docs/UX/rb-ds-01/IMPLEMENTATION.md`
