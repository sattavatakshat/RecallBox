# RecallBox Design System — RB-DS-01

## Contract and sources

A mobile screen is not considered implemented correctly unless it uses this centralized design system. Read this document before every UI task. Approved screen references govern visual identity; working code governs behavior. This migration does not change API contracts, durable-memory visibility, ingestion, authentication or route architecture.

`apps/mobile/src/design-tokens.json` is the only authored value source. `theme.tsx` supplies typed tokens, semantic/compatibility palette names, OS theme selection and the single font provider. `ui.tsx` supplies shared primitives; `icons.tsx` owns Lucide imports. `brand.tsx`, `welcome-theme.ts`, `manual-save-ui.tsx`, `manual-save-icons.tsx` and `library-icons.tsx` are compatibility adapters, not competing systems. Do not add new screen-specific palettes or font loaders.

## Brand principles

Warm editorial, minimal, premium and approachable: ivory paper, forest ink, editorial serif headings, clear functional sans, sage support, restrained pale lime, consistent outline icons, subtle separators, intentional rounded geometry and comfortable targets. Retain authentic original-source data and honest placeholders; decorative brand artwork must never masquerade as a saved memory.

## Reconciled conflicts

| Existing conflict | Selected resolution |
|---|---|
| Legacy UI background #F6F4EC / #171E1A versus approved RB-01/02/06 ivory/forest | Adopt #FCF4EA / #091F15 for every app surface background |
| Welcome gray supporting text versus brand sage supporting text | `secondaryText` is gray/soft neutral; `mutedText` is sage. Both are intentional and checked for contrast |
| Legacy accent meant a button, while Welcome accent meant an underline | `accent`/`button` is the interactive action fill; `highlight` is restrained lime decoration/status. Welcome underline explicitly uses highlight |
| Several platform serif declarations and two Expo font loaders | Load bundled DM Serif Display once; editorial roles use it, with Android serif/iOS Georgia fallback on failure |
| Hand-built icon families and Unicode graphics | One Lucide wrapper, plus the retained custom bookmark identity |
| Native share dark #102F21, independent glyphs and text sizes | Native colors/dimensions and Lucide paths are generated from the same authored sources |
| Screen-specific 52/54/56dp controls and many radii | Shared 56dp default button/input, at least 48dp targets, intentional radius scale; content grows with text |

The existing responsive artboard positioning is preserved where it controls illustrations or editorial line fitting. Standardizing primitives can produce small metric differences (for example 44dp chips becoming 48dp targets); final physical-device visual QA is required.

## Semantic colors — light and dark

Use a role, not a hex literal. `background` is the page; `surface` is content; `surfaceElevated` is raised content; `surfaceMuted` is supporting content; `scrim` is the translucent modal backdrop. `primaryText`, `secondaryText`, `mutedText`, `inverseText` and `disabledText` express text hierarchy. `brand/onBrand` belong to identity; `accent/onAccent` to primary actions; `highlight/onHighlight` to limited emphasis; selected roles to active navigation. Border, feedback, avatar, sheet and media-viewer roles have explicit paired colors.

| Role | Light | Dark |
|---|---|---|
| `background` | `#FCF4EA` | `#091F15` |
| `surface` | `#FFFCF5` | `#163427` |
| `surfaceElevated` | `#FFFDF8` | `#1C3C2B` |
| `surfaceMuted` | `#E5EDCD` | `#233B29` |
| `scrim` | `rgba(4, 20, 12, 0.48)` | `rgba(0, 10, 5, 0.68)` |
| `primaryText` | `#082F23` | `#F7F5EB` |
| `secondaryText` | `#465052` | `#D0D8CB` |
| `mutedText` | `#596B60` | `#BDCCBC` |
| `inverseText` | `#FFFDF5` | `#102312` |
| `disabledText` | `#6E766B` | `#8C9E8D` |
| `brand` | `#082F23` | `#E4F486` |
| `onBrand` | `#FFF9EE` | `#102A1C` |
| `accent` | `#063824` | `#DCEC7C` |
| `onAccent` | `#FFFDF5` | `#102312` |
| `highlight` | `#CDE65F` | `#CDE65F` |
| `onHighlight` | `#102A1C` | `#102A1C` |
| `selectedSurface` | `#E5EDCD` | `#254A31` |
| `selectedText` | `#164A35` | `#DCEC7C` |
| `line` | `#E1E4D8` | `#2D4938` |
| `lineSubtle` | `#EAE6DC` | `#233D2C` |
| `lineFocused` | `#164A35` | `#DCEC7C` |
| `success` | `#246A4A` | `#B9D99D` |
| `successSurface` | `#E5EDCD` | `#254A31` |
| `warning` | `#875C17` | `#EBCB85` |
| `warningSurface` | `#F5E8CD` | `#3F3520` |
| `error` | `#A43439` | `#FFB3AC` |
| `errorSurface` | `#F4DEDA` | `#50352E` |
| `information` | `#365A58` | `#B6D5CB` |
| `informationSurface` | `#E3EDE7` | `#203C34` |
| `avatar` | `#E5EDCD` | `#C4DCAE` |
| `onAvatar` | `#204C37` | `#204C37` |
| `decoration` | `#E9EBCF` | `#23351B` |
| `sheetSurface` | `#FCF4EA` | `#163427` |
| `sheetLine` | `#E1E4D8` | `#43553F` |
| `iconSurface` | `#E5EDCD` | `#3C5431` |
| `favorite` | `#A86D12` | `#EDB84E` |
| `mediaBackground` | `#101512` | `#101512` |
| `mediaForeground` | `#FFFFFF` | `#FFFFFF` |
| `identitySurface` | `#FFFFFF` | `#FFFFFF` |
| `shadow` | `#1B311E` | `#000A05` |

Compatibility aliases map to these same values: `paper=background`, `ink=primaryText`, `muted=secondaryText`, `faint=mutedText`, `danger=error`, `onDanger=inverseText`, `button=accent`, `onButton=onAccent`. Prefer descriptive semantic names in new code. No caller chooses a separate approved/legacy palette.

Feedback pairs are success/successSurface, warning/warningSurface, error/errorSurface and information/informationSurface. Disabled colors communicate disabled state; do not use them for readable body copy. `identitySurface` is deliberately white behind the official Google identity asset in either theme. `mediaBackground/mediaForeground` deliberately create a dark full-screen media viewer in either theme. These are semantic exceptions, not accidental dark-mode white surfaces.

## Typography

Editorial family: bundled **DM Serif Display Regular**, licensed under OFL in `assets/welcome/OFL.txt`. Functional family: Android `sans-serif`, iOS `System`. No paid or remote font. `DesignSystemProvider` loads the serif once and exposes a readable platform serif fallback on font error; body/control text is immediately readable. `Type` supplies the correct family, metrics, color and heading accessibility role. Native confirmation uses the exact same bundled asset and generated sp sizes.

| Role | Size | Line height | Weight | Tracking |
|---|---:|---:|---|---:|
| `display` | 43 | 53 | 400 | -0.8 |
| `hero` | 43 | 50 | 400 | -1.1 |
| `heading` | 34 | 41 | 400 | -0.8 |
| `editorHeading` | 32 | 40 | 400 | -0.4 |
| `sheetHeading` | 36 | 44 | 400 | -0.8 |
| `section` | 20 | 28 | 600 | 0 |
| `cardTitle` | 16 | 21 | 700 | -0.3 |
| `body` | 16 | 24 | 400 | 0 |
| `secondary` | 15 | 22 | 400 | 0 |
| `caption` | 13 | 19 | 400 | 0 |
| `eyebrow` | 11 | 16 | 600 | 1.2 |
| `button` | 17 | 24 | 600 | 0 |
| `heroButton` | 19 | 26 | 600 | -0.4 |
| `label` | 15 | 22 | 600 | 0 |
| `chip` | 14 | 20 | 600 | 0 |
| `nav` | 12 | 17 | 400 | 0 |
| `wordmark` | 24 | 32 | 700 | -0.8 |
| `avatar` | 21 | 28 | 700 | 0 |
| `actionTitle` | 19 | 26 | 600 | -0.4 |
| `intro` | 18 | 26 | 400 | 0 |
| `welcomeCopy` | 17 | 23 | 400 | -0.35 |
| `nativeHeading` | 21 | 28 | 400 | 0 |

`title` remains an alias for `heading`. Editorial roles: display, hero, heading/title, editorHeading, sheetHeading and nativeHeading. Section/card/body/secondary/caption/eyebrow/button roles use sans. Use `variant`, rather than restating font sizes. Do not disable font scaling. Labels wrap and containers grow; only avatar initials are capped at 1.5x to retain the identity disc. Long titles may wrap. Icons and media do not scale as text.

## Spacing, geometry and elevation

Use named `tokens.space` values on a 4dp base (8dp rhythm for larger groupings). Zero means none. Screen horizontal padding is 24dp; compact legacy destinations use 16dp. Editorial empty-library inset remains 28dp. Section gaps are 32–48dp, row gaps 12–16dp. These are layout values, not physical pixels.

| Spacing token | dp |
|---|---:|
| `none` | 0 |
| `tiny` | 4 |
| `small` | 8 |
| `compact` | 12 |
| `medium` | 16 |
| `regular` | 20 |
| `large` | 24 |
| `wide` | 28 |
| `sectionSmall` | 32 |
| `section` | 40 |
| `sectionLarge` | 48 |
| `hero` | 56 |
| `loose` | 36 |
| `sectionWide` | 44 |

| Radius token | dp |
|---|---:|
| `tiny` | 4 |
| `small` | 8 |
| `tile` | 14 |
| `medium` | 16 |
| `button` | 18 |
| `large` | 24 |
| `sheet` | 34 |
| `full` | 999 |

Shared geometry: content width 520dp, editor/help width 480dp, Welcome width 390dp, Empty Library width 440dp, sheet width 540dp; these are maximums constrained by available width. Minimum touch target 48dp, default button/input height 56dp, Welcome CTA 60dp, row thumbnail 60dp, FAB 58dp, bottom nav minimum 70dp, sheet handle 48×4dp, action row minimum 88dp. List bottom clearance is 100dp in addition to the shared bottom bar, keeping the FAB off the final row. Divider width is 1dp. Prefer minHeight over fixed height for text controls.

`tokens.elevation.floating` owns FAB elevation/shadow; `tokens.elevation.sheet` owns sheet elevation/shadow. Use the theme's `shadow` color. Do not author a new inline shadow/elevation per screen.

## Icons

Use **lucide-react-native 1.74.0** through `Icon` with explicit per-icon subpath imports (avoid the full barrel in Metro); its peer ranges include the installed React 19/RN version. **react-native-svg 15.16.0** matches this installed Expo 58 SDK's bundledNativeModules.json. No alternative icon library was installed. References: [Lucide packages](https://lucide.dev/packages), [Expo SVG installation](https://docs.expo.dev/versions/latest/sdk/svg/).

Default icon size 24dp, large 32dp, hero placeholder 56dp; stroke width 2. Icons inherit primary text color unless a semantic role is passed. Use filled treatment only for selected stars. `Icon` is decorative by default: the containing button/checkbox/tab supplies the accessible label and state. A standalone informative icon can use `label`. Never use Unicode glyphs for navigation, status, stars or content graphics; ordinary punctuation and user content remain untouched.

The wrapper covers Library, Search, Collections, Save, Account, Link, Note, Image, PDF, Star, Back, Close, More, Filter, Check, Warning, Retry and Upload, plus chevrons, checkboxes and existing settings/action roles. Preserve the custom RecallBox bookmark logo and official Google sign-in image; they are identity assets rather than generic UI icons.

Native RB-03 cannot import React without changing its instant-share lifecycle. `scripts/sync-design-system.cjs` reads the central tokens and pinned Lucide nodes to generate Android day/night colors, dimensions and VectorDrawables. The Lucide license is copied to a native NOTICE asset. Run `npm run design:sync` after token/icon changes, then commit generated resources; do not hand-edit them.

## Component inventory and conventions

| Component | Responsibility |
|---|---|
| DesignSystemProvider / usePalette / useTypeStyle | One theme and one font lifecycle, semantic aliases |
| Type / Screen | Typography and safe scrollable/keyboard-aware page container |
| Button / IconButton / TextAction / BackButton | Accessible actions with disabled/busy states and real icons |
| Input | Label, body typography, selection color and focused border; existing TextInput props forwarded |
| Card / Divider / FilterChip | Standard surfaces, separators and selected filter states |
| LoadingIndicator / Notice | Consistent progress and truthful success/info/warning/error announcements |
| RecoveryState / EmptyState | Clear message, optional retry/reset; never confuse network error with a first-use empty state |
| SectionHeader / SourcePlaceholder | Reusable section/action pairing and honest content-type graphic |
| AccountAvatar / AppHeader | Shared brand identity and real account navigation supplied by caller |
| BottomNavigation / FloatingSaveButton | Shared three destinations, active states, safe bottom inset and one Save entry |
| MemoryCard | Compact row of real memory metadata and persisted star action; no fabricated thumbnail |
| SheetSurface / ActionRow | Shared overlay surface and selectable action geometry; caller owns modal/gestures |
| CaptureEditor/Input/Button/Message | RB-04 compatibility wrappers over shared controls |
| Native Alert.alert | System confirmation dialog convention; keep each existing confirmation and destructive/cancel semantics |

Avoid adding a wrapper with no reusable visual or accessibility responsibility. A memory row and a generic Card are intentionally different content structures, not rival card frameworks. The small compatibility helpers are retained to avoid risky call-site rewrites; do not extend them into independent implementations.

## Navigation, overlays and state behavior

Keep the existing Expo Router stack, destination routes, Detail back behavior and RB-04 native Modal lifecycle. This visual migration does not add screens or change route ownership. Primary tabs share one theme; the old `approved` prop is accepted for compatibility but no longer selects a palette. The shared bar owns bottom safe areas, and the single FAB sits above its measured height.

A sheet uses the semantic scrim and SheetSurface. Save retains existing reduced-motion handling, Android Back, backdrop/close dismissal, drag handle, safe insets and scrollable options. Text can grow without cropping actions. The help sheet uses the same surface convention. Confirmation dialogs remain native OS dialogs; do not imitate them with a competing modal implementation.

Loading should be finite/truthful, accompanied by a meaningful accessible label. Errors remain distinct from empty data and expose the existing retry action. Use Notice for confirmation/error feedback, RecoveryState for recoverable page states, and RB-02's approved artwork only for a genuinely empty first-use Library. Preserve all capture drafts and durable-original visibility rules. Do not manufacture data to fill a design.

OS appearance remains the only theme setting; no existing manual override was removed. Status bars follow the OS through the root provider. Safe-area and navigation surfaces use the same background; native share selects light/dark system-bar icon appearance and remains translucent/edge-to-edge. Final behavior under gesture and three-button navigation must be checked on a real device.

## Accessibility

- At least 48×48dp interactive targets, including close, stars, tabs and checkboxes.
- Descriptive labels and selected/checked/expanded/disabled/busy state on the interactive element. Decorative child icons do not duplicate announcements.
- Preserve text scaling and natural wrapping; use minHeight and flexible columns. Verify at large font and display sizes, with TalkBack.
- Key body/action/feedback color pairs meet at least 4.5:1 in the source-policy check. Disabled, decorative and media roles are contextual exceptions; manually review new pairings.
- Focused inputs use lineFocused; keep keyboard return/autofocus/selection behavior. Preserve reduced-motion preferences and native share's accessibility-adjusted dismissal timeout.
- Errors are announced; success is polite. Do not rely on color alone for a state or claim device verification from compilation.

## Usage examples

```tsx
import {Screen, Type, Button, Input, FilterChip, Notice, Icon, tokens, usePalette} from '../src/ui';

const p = usePalette();
<Screen>
  <Type title>Your saved things.</Type>
  <Input label="Title" value={title} onChangeText={setTitle}/>
  <FilterChip label="Starred" selected={starred} onPress={toggleFilter}/>
  <Notice kind="error">{error}</Notice>
  <Button label="Save" busy={saving} onPress={save}
    leading={<Icon name="save" color={p.onButton}/>}/>
</Screen>;

// Layout owns arrangement; tokens own design values.
<View style={{gap: tokens.space.medium, borderRadius: tokens.radii.large}}/>;
```

## Migration coverage and intentional exceptions

- RB-01 Welcome, RB-02 Empty Library, RB-04 Save sheet/editors and RB-06 Library now share the foundation, controls and icons. Their original data/actions and responsive artwork remain.
- RB-03 native instant-save confirmation now uses the same tokens, font asset and Lucide geometry through the generated resource bridge. Its receive/persist/queue/retry/dismiss lifecycle is unchanged.
- Existing Account, Search/Results, Collections/Collection Detail, Memory/Source Detail, Organize, Add to Collection, Learning, Shopping, Trips, Reminders, Share Recovery and Sync Recovery inherit the unified Screen/Type/controls; bespoke Unicode graphics and raw colors/fonts were migrated. Editors and auth-loading destinations inherit the same shared components. Retired captured route remains a redirect.
- These secondary screens have received foundational styling, not a new approved final UX. Their information architecture, layout-specific media dimensions, forms and action groupings remain as implemented. Future approved visual redesigns should use this system.
- Documented geometry exceptions: custom bookmark strokes, licensed Google identity disc/image, Welcome illustration/corner shapes/underline placement and responsive two-line hero fitting, Empty Library illustration shape/size and responsive heading fitting, and content-specific media preview aspect ratios/heights. These are not a second spacing or font system. Shared wordmark sizes can scale with the lockup; default metrics come from typography tokens.
- No screens are intentionally left on a separate palette, font family or icon framework. Physical-device visual and interaction acceptance remains pending; no automatic check proves screenshot fidelity.

## Change and review rules

Before adding a token, search for an existing semantic role/primitive. A new role needs a documented visual or accessibility requirement, both themes, compatible contrast and known consumers. Update this document and run native generation when relevant. Do not encode a screen name into color roles. Do not add UI dependencies without checking current Expo/RN peers and the need for a native rebuild.

Run `npm run typecheck`, `npm run design:check`, and `git diff --check`. CI runs the source-policy check before TypeScript. It detects raw TS/TSX colors and font declarations, bypassed text/input/loading primitives, direct icon/font imports outside the wrappers, literal Unicode UI glyphs, inline elevation, selected contrast pairs and stale native resources. This is a small policy check, not a new automated test suite or screenshot test. Review spacing, radius choice, correct component reuse, modal focus, navigation, safe areas and responsive layout manually; the check is intentionally not an exhaustive styling linter.

No new backend behavior or API contract is part of this design system. Preserve unrelated work and never use a visual cleanup to change capture/ingestion/visibility/auth behavior.
