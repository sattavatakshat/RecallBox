# RB-01 approved welcome implementation

16 November 2026. Visual source: the user's approved light/dark phone reference.

## Changes

- Both `/` and `/sign-in` render `src/welcome.tsx`, with the existing account redirect.
- Screen-scoped semantic tokens live in `src/welcome-theme.ts`; other screens keep their existing theme.
- Warm ivory / deep forest surfaces, centered RecallBox brand, DM Serif Display headline, lime underline, local transparent paper-card illustration, and theme-specific CTA.
- Removed welcome avatar, privacy action, secondary navigation, eyebrow, and technical authentication copy. Existing account/privacy functionality remains elsewhere.
- Safe-area padding includes all four edges. The body scrolls independently above the footer, which reserves the CTA's height. Text scales with system settings, wraps naturally, and has no fixed-height text containers. Decorative artwork is hidden from accessibility navigation. Pressable exposes busy/disabled state and press feedback.
- The application already uses automatic system appearance; no manual theme preference was found. Existing edge-to-edge transparent Android system bars remain unchanged. Welcome sets status-bar icon appearance for its own background.

## Authentication

The real hosted Auth0 page for the configured Android native client returned HTTP 200 and exposed the `google-oauth2` connection and “Continue with Google” action. This verifies connection availability, **not a completed login**.

The optional public variables `EXPO_PUBLIC_OIDC_ANDROID_GOOGLE_CONNECTION` and `EXPO_PUBLIC_OIDC_IOS_GOOGLE_CONNECTION` enable direct Google only when set to `google-oauth2`. The local ignored Android environment has been enabled after that verification. Other environments retain hosted authentication with “Continue securely” until explicitly configured. iOS availability was not verified and its opt-in remains unset.

The existing AuthRequest receives only an additional `connection` parameter. PKCE S256, nonce, state, secure storage, callback validation, session refresh, native warm/cold callbacks, and pending-share handling retain their existing implementations. Authenticated returning users redirect to Library; the Welcome view waits for session restoration first.

Auth0's hosted page reports development social keys. Before production, configure the project's own Google OAuth client ID/secret on the Auth0 Google social connection and verify the native client remains enabled. No secrets belong in the mobile environment. See [Auth0 connection routing](https://support.auth0.com/center/s/article/Authenticating-users-through-a-specific-Connection-database-social-etc).

## Validation and limits

- Android `:app:assembleDebug`: **PASS**, 481 tasks, 43 seconds, using the existing JDK/SDK and arm64 workflow.
- `npm run typecheck`: **PASS**.
- Android production JavaScript/Hermes export with the bundled assets: **PASS**.
- `git diff --check`: **PASS**.
- Calculated contrast (primary / secondary / CTA): light **13.37 / 7.62 / 12.90**, dark **15.77 / 13.69 / 12.85**.
- Applied the requested [UI/UX Pro Max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md): native checklist, responsive dimensions, dynamic type, touch targets, semantic controls, contrast, and decorative-image semantics. The approved reference overrides generic design recommendations.
- Emulator validation encountered a dev-client startup problem. No usable Welcome screenshots were captured, and no visual-parity claim is made. The additional release-build attempt was stopped after the user requested implementation-only delivery and chose to check on their phone.
- No completed real login, session expiry, callback, or pending-share smoke test is claimed in this change. Their existing code paths were retained.
- The pre-existing `apps/mobile/tsconfig.json` working-tree change is excluded from this implementation.

## Phone verification (user-owned)

1. Reload Metro/app after the environment update. Signed-in users should land in Library; use the existing Account sign-out action to inspect Welcome.
2. Inspect system light and dark appearances at normal font size. Check the exact approved copy, headline's two lines, paper-card composition, and CTA.
3. Increase font/display size and try a compact/landscape viewport. Text should reflow/scroll while the CTA remains reachable above system navigation.
4. Tap Continue with Google. Complete the real browser flow and verify Library, then cancel a second attempt and verify retry. Auth0 development-key production setup remains open.
5. Check cold-start callback, returning session, expired session, and a pending Android share across authentication. Do not capture personal account data in committed screenshots.

## Assets

See [asset provenance and generation prompt](../../../apps/mobile/assets/welcome/README.md). No screen mockup or device frame is embedded in the application.
