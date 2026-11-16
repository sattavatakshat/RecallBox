# RB-02 — Approved Empty Library and connected navigation

16 November 2026. Visual source: the user-supplied RB-02 light/dark reference. This is implementation, with physical Android acceptance owned by the user.

## Scope and existing functionality

The application is Expo 58 / React Native with Expo Router, a session provider, and an account-scoped memory provider. Search, Collections, Account, link/note composers, image/PDF capture, capture recovery/retry, and an Android text/plain share receiver already exist. This change reuses those routes and APIs. Authentication, backend services, native modules, migrations, and populated Library cards/filters are unchanged.

`src/brand.tsx` shares the RB-01 bookmark logo, wordmark, local DM Serif Display font, forest/ivory/lime colors, and stationery illustration. Welcome now uses the shared brand lockup with its existing dimensions. No new asset or runtime dependency was added. The reused transparent image is `assets/welcome/saved-cards.png`, with a gold **binder clip**, not a padlock.

`src/empty-library.tsx` implements the full RB-02 surface: account initials/neutral fallback, exact approved headings/copy, responsive illustration, one full-width Save CTA, quiet saving guide, and contextual capture status only when real unresolved captures exist. All four screen edges are accounted for: the screen owns top/left/right safe areas; the fixed shared navigation owns bottom/left/right. The illustration shrinks with height/font scaling before text is sacrificed; the body scrolls above the fixed CTA area. All text can reflow. The avatar and quiet action have 48dp targets, and the Save CTA is at least 58dp.

The approved tokens are scoped to RB-01/RB-02 and the empty Library navigation. Other destinations retain their existing screen palettes. Bottom-navigation icons/labels share one outline treatment and selected pill. The FAB is hidden while the empty/loading/recovery Library has the full-width Save CTA, and returns for populated/filtered Library. FAB clearance follows the navigation's measured height for larger fonts.

## Connected controls

| Control | Existing destination / behavior |
| --- | --- |
| Avatar | `/(account)/account`, with real session information |
| Save something | `/(account)/save`, existing capture sheet |
| Paste a link | `/(account)/new-link`, secure server capture API |
| Write a note | `/(account)/new`, existing confirmed/idempotent save |
| Photo or screenshot | `/(account)/capture?method=image`, existing JPG/PNG/WebP picker/camera |
| File or document | `/(account)/capture?method=pdf`, existing PDF upload; other document formats explicitly unsupported |
| How saving works | Dismissible local `SavingGuide` Modal; no permission requests |
| Library / Search / Collections | Existing Expo Router destinations; navigate reuses stack destinations, Library dismisses to its existing route |
| Recently captured (only if unresolved items exist) | `/(account)/captured`, existing status, source inspection, saved-record links, and failure retry |

Selecting a capture method **replaces** the Save sheet in the stack, avoiding an orphan sheet after success/cancellation. Existing note/link unsaved-draft guards remain. File capture now also guards leaving during/unconfirmed saves and asks before setting aside an ambiguous attempt. Retries retain the original request key. Cancelling a system picker leaves the capture screen without pretending to save anything.

The existing Search screen has a truthful no-content message for a confirmed empty account. Query state remains in its mounted route while navigating between destinations. Collections creation/browsing and Account controls are reused, with no duplicate implementation.

## Data-driven Library states

`src/library-state.ts` centralizes usability and presentation state. `MemoryProvider` exposes whether its first list request succeeded, preventing a false empty frame before loading. The existing sync mechanism remains the source of processing updates.

| Situation | Behavior |
| --- | --- |
| Initial load / unresolved pagination | Checking Library, not a false empty claim |
| No usable item and no pending/failed capture | Approved empty illustration/message/CTA/guide |
| Server-confirmed queued / processing capture | Empty composition plus small Recently captured entry with actual counts and a working inspection route |
| Failed processing | Needs attention status and link to existing retry controls; saved original is retained |
| First usable item | Switches to existing populated Library; large illustration/CTA disappear and FAB returns |
| Metadata-only result | Usable link-only memory, not an endless processing state |
| Failed list request / offline with no usable cache | Explicit load failure and retry; no empty-account claim or fake saved result |
| Cached usable data plus network failure | Existing populated Library remains visible with its existing error notice |
| Archived / starred view | Existing filtered empty/results behavior retained |

A first page consisting entirely of unfinished sources cannot establish that the whole Library is empty. The screen requests the next existing list page until a usable item is found or pagination ends. No synthetic records or backend responses were added.

There is **no durable in-app offline outbox**. Notes/URLs and file save attempts are retained only while their composer remains mounted. Failure copy and the guide disclose this; success still requires server confirmation. The existing native share queue is a separate account-scoped path. The guide says “if RecallBox appears,” explains web-link-only share support, and gives copy/paste fallback; installed-build share behavior is not claimed tested.

## Verification performed

- `npm run typecheck`: passed.
- Android JavaScript/Hermes export with existing Expo dependencies: passed, local assets included.
- Focused one-off assertions: 14 Library-state cases, failed-source exclusion, and existence of all eight connected route files passed.
- Source review of native share plugin/module, authentication boundaries, processing/retry APIs, capture limits, and connected routes.
- UI/UX Pro Max responsive-dimensions guidance and native checklist applied; the approved image overrides generic style recommendations.
- `git diff --check`: passed.
- No emulator/AVD was started or installed. No Android Studio, native rebuild, physical-device launch, or physical UI/authentication testing was performed.
- No screenshot or visual-fidelity acceptance is claimed. Light/dark comparison, actual layout, touch/Back behavior, and real server workflows require the user's USB-phone checks below.

The pre-existing uncommitted `apps/mobile/tsconfig.json` edit is excluded from the implementation commit.
