# RB-DS-01 audit — 17 November 2026

Before implementation: branch main; HEAD 41ecba44 includes completed RB-04 and RB-06. Fetched origin/main matches HEAD. Only apps/mobile/tsconfig.json is locally modified; preserve and exclude it.

| Evidence | Inconsistency | Resolution |
|---|---|---|
| src/ui.tsx: tokens, palettes, Type, Screen, Button, Input, Card, FilterChip, IconButton, Divider, Notice, RecoveryState | Legacy light #F6F4EC / dark #171E1A differs from approved warm ivory / forest; headings use platform serif | One semantic token source with compatibility aliases and shared bundled DM Serif loading |
| src/welcome-theme.ts and src/brand.tsx | Separate palette definitions; welcome copy #465052 versus brand #596B60; duplicated font loading | Centralize roles; preserve gray secondary copy and sage muted text as separate semantic roles |
| src/manual-save-ui.tsx | CaptureButton/Input/Message duplicate ui.tsx controls | Thin compatibility wrappers around shared primitives |
| src/navigation.tsx | approved flag selects different palettes; hand-built icons; inline #1B311E shadow | One theme, shared icon family, shared geometry/elevation |
| src/manual-save-icons.tsx, src/library-icons.tsx, src/memory-card.tsx | Two custom stroke families and Unicode stars | Lucide wrapper after checking package/Expo SVG compatibility; preserve custom bookmark logo |
| app/(account)/save.tsx | Inline dark #43553F/#3C5431, custom sheet radii/elevation/action-row styling | Semantic sheet tokens, reusable sheet surface/action row; retain native Modal, gesture and close lifecycle |
| src/welcome.tsx, src/empty-library.tsx, app/(account)/index.tsx | Independent font declarations, avatars, buttons, spacing and row text | Shared typography, avatar/header/actions with named approved geometry exceptions |
| app/(account)/account.tsx, memory/[id].tsx, source/[id].tsx, collection/[id].tsx, organize.tsx, shopping/[id].tsx, learning.tsx | Unicode account/status/content/navigation icons; fullscreen photo uses raw colors | Shared Icon/TextAction and semantic media-viewer colors; no functional changes |
| native ShareActivity.kt | Independent hex palette, hardcoded text sizes/shape values, Unicode state glyphs | Generated Android resource bridge from central tokens; same Lucide paths rendered natively; preserve save/state machine |

No Lucide, react-native-svg or alternative icon package is installed. Local Expo 58 bundledNativeModules.json specifies react-native-svg 15.16.0. DMSerifDisplay-Regular.ttf and OFL are already bundled; no additional font dependency is needed. Existing theme choice follows the OS; no manual theme setting exists.

Existing approved responsive illustration/artwork geometry is not a general-purpose spacing rule. Preserve that geometry as documented exceptions while standardizing functional controls and 4dp spacing/intentional radius scales. Native share runs without React/Metro; a generated token/icon bridge is required rather than importing React Native components into that Activity.
