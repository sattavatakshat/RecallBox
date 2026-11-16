# RecallBox Android beta — real-device acceptance runbook

**Status:** READY FOR DEVICE QA; this document is a test plan, not evidence of a pass.
**Reference:** docs/UX/RecallBox_Interactive_Prototype.html and docs/UX/RECALLBOX_FINAL_UX_BLUEPRINT_V1.md.
**Tracking:** UX-027 (end-to-end) and UX-048 (RB-01–20 visual parity).

## Prerequisites

1. Pull latest main. Ensure real Auth0 provider configuration, real user account and loopback/development backend are available. Never substitute demo sign-in or mocked API data.
2. From repository root, after setting the private migration-role URL in the environment, run:
       RECALLBOX_MIGRATION_URL="$YOUR_MIGRATION_URL" alembic upgrade head
   Backend currently checks the exact latest Alembic revision. Do not start it on an older schema.
3. Build a NEW native dev client after config/plugin changes, not just an OTA JavaScript refresh:
       cd apps/mobile
       npm ci
       npx expo run:android --device
4. Confirm the phone and application:
       adb devices -l
       adb shell pm list packages | grep recallbox
5. Before exercising authentication, verify the Android app points at the development backend reachable from the phone. Never expose the beta backend publicly just to run QA.

## Capture screenshots privately

For every case below, capture the Android screen at its actual viewport (~390x790 is the prototype reference), and compare with the HTML mock side by side for light and dark mode. Save screenshots outside the public Git repo; screenshots may contain private memories.

Example (repeat with a distinct case name):
       adb shell screencap -p /sdcard/rb01.png
       adb pull /sdcard/rb01.png ./private-qa/rb01.png

Keep a private ledger: screen ID, date/build SHA, Android model/version, PASS/FAIL, screenshot path, visual deviations (fonts, icon shapes, spacing, copy, colors, tab/FAB), click flow and API/server state. **No green CI counts as a screenshot PASS.**

## Screen-by-screen checks

| Screen | Real journey and expected result |
|---|---|
| RB-01 Welcome / sign-in | Fresh signed-out launch; hosted Auth0 PKCE, cancellation/retry, cold callback, returning signed-in launch; no fake login. |
| RB-02 Empty Library | New account: truthful empty state, single Save CTA, correct three-tab navigation/FAB. |
| RB-03 Native Share | From Chrome/browser or an external app, Android Share → RecallBox with HTTP(S) URL; cold/warm entry, title+URL, durable confirmation, return to source. Disable Wi-Fi and retry: no fake Saved, no duplicate. Switch accounts: no cross-account payload leakage. |
| RB-04 Save sheet | Five visible categories; working Link, Note, Photo, PDF. Video must remain explicitly unsupported, not fake upload. Dismiss and back behavior. |
| RB-05 Recently Captured | Queued/processing/failed records stay outside finalized Library, Retry confirms from backend; no invented offline-outbox item. |
| RB-06 Library populated | Real ready/metadata-only records, source/title/date, All/Starred/topic filters, star/detail, scrolling and FAB. |
| RB-07 Search input | Focus, enter a query, clear and submit; real account-scoped results. |
| RB-08 Search results | Type/star filters and zero-result copy; no fabricated excerpts. Back preserves query. |
| RB-09 Memory detail | Source/domain, actual content, saved date, Open Original, star, edit, organize, more. |
| RB-10 Specialized detail | Article, link-only, image/PDF original and available extracted data. No fake transcript/content. |
| RB-11 Organize | Manual topic/tags and multiple collection memberships persist after restart; conflict not silently overwritten. |
| RB-12 Collections | Serif title, forest New collection, real names/counts, layered outline glyph, three-tab bottom nav and FAB. |
| RB-13 Collection detail | Back, selected title/count, add/remove items, rename, real rows, travel CTA only when eligible source. |
| RB-14 Contextual actions | Food/Travel/Learning actions only with actual supported evidence. All ineligible actions absent or truthful. |
| RB-15 Recipe shopping list | Source-backed ingredient quotes, manual add/remove/check/edit, versioned save and recovery. |
| RB-16 Travel shortlist | Original source, name/date inputs, manual place/day/notes, reorder, save, no invented opening hours/distances. |
| RB-17 Learning queue | Eligible tutorial → Add, Start reading, Mark completed, reorder, remove; persist after app restart. |
| RB-18 Reminder | From a saved memory set future date/time in device timezone; visible in Reminders, mark completed or remove. Beta provides in-app records, **not Android push alerts**. |
| RB-19 Account/Privacy | Real account info, sign-out/reauth, notifications panel, privacy disclosure, no fake export/delete. |
| RB-20 Recovery | Actual server capture states plus any pending native share; Retry, reauth, no invented general local file-upload outbox. |

## Required end-to-end path (UX-027)

1. Sign in with a real account; open Library.
2. Save a note, open it, edit title, star, add it to a new collection.
3. Save an HTTP(S) link; verify durable capture and Recently Captured/Library transition.
4. Search note/link and open results; exercise filters and no-results view.
5. Pick and upload a real photo and PDF; inspect source availability and coverage.
6. From Chrome, share an external URL; verify Android Share and return to source.
7. For a qualifying saved recipe, create and persist a shopping checklist.
8. For a qualifying saved travel source, create and persist a trip shortlist.
9. For a qualifying tutorial, create/reorder/complete a learning item.
10. Create an in-app reminder, view it, mark completed.
11. Disable network during an unconfirmed save, inspect honest retry/error states. Check session expiration and sign-out/account separation.
12. Force-stop and relaunch the app; verify persisted server records and no cross-account data.

## Release gate

- Mark UX-027 PASS only after the full device walkthrough has screenshots/recordings and no unresolved data-loss, authentication or privacy regression.
- Mark UX-048 PASS only after all 20 screenshots are compared to the exact prototype and deviations are resolved or explicitly accepted. Otherwise leave device QA as NOT_VERIFIED/FAIL with the issue list.
- Known beta limitations: no general offline file outbox, no Android push reminders, no fake video capture, and no device QA performed by CI.
