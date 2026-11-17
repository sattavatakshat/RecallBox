# RecallBox mobile UI contract

Before implementing or changing mobile UI, read `../../docs/UX/RECALLBOX_DESIGN_SYSTEM.md` and inspect the shared components it names. A screen is not implemented correctly unless it uses the centralized RecallBox Design System.

- `src/design-tokens.json` owns colors, typography metrics, spacing, radii, geometry and elevation. `src/theme.tsx` owns system-theme selection, compatibility aliases and the single bundled-font loader.
- Import `Type`, `Screen`, `Button`, `Input`, `IconButton`, `FilterChip`, `Notice`, `LoadingIndicator`, `RecoveryState` and other existing controls from `src/ui.tsx`. Reuse `src/navigation-ui.tsx`, `src/navigation.tsx` and `src/memory-card.tsx` as appropriate. Do not fork controls or palettes for a screen.
- Use `Icon` from `src/icons.tsx` (or its ui export). Direct Lucide imports belong only in that wrapper. Never use Unicode UI glyphs or an additional icon family. Preserve the custom RecallBox logo and licensed identity assets.
- Use semantic theme roles and shared typography, spacing/radius/geometry tokens. New tokens require a concrete need that current tokens cannot express; document the reason and affected components. Responsive editorial artwork and media geometry exceptions are listed in the design-system document.
- Preserve both light and dark themes, 48dp interactive targets, natural text scaling, labels, focus/busy/selected/disabled states, safe areas and reduced-motion behavior.
- Native RB-03 confirmation uses the generated token/icon bridge. Edit tokens, then run `npm run design:sync`; never hand-edit generated Android colors, dimensions or Lucide vectors. Preserve its save/queue/state lifecycle.
- Do not alter API contracts, memory visibility, auth or navigation behavior during a visual migration unless the user's task requires it.
- Run `npm run typecheck`, `npm run design:check` and `git diff --check` for UI changes. The source-policy check is intentionally lightweight; use the documented review checklist for spacing, component reuse and responsive layout, which require human judgment.
- Do not claim visual or device verification from static checks. Follow the user's emulator/build constraints and provide a physical-device checklist.
