# RB-09 Memory Detail / Editorial Reader

Implemented on main, November 17, 2026. Physical-device and visual verification remain pending.

## Audit and changes

The existing detail already supported URL opening, authenticated uploads, full-screen images, temporary-file sharing, versioned edits/stars/archive/delete, organization, retry, coverage, contextual actions and discard protection. Its oversized generic source graphic, repeated coverage blocks, five visible secondary actions and unconditional next-steps section pushed reading down the page. Text stopped at 6,000 characters. Back navigation special-cased Search and otherwise dismissed to Library. A refresh already in flight could overwrite a newly opened editor.

`apps/mobile/app/(account)/memory/[id].tsx` now uses a compact back header derived from the actual preceding stack route, compact source identity/date, naturally wrapping DM Serif Display title, supported-topic chip, content-specific primary action and Star / Organize / More row. More is one native Modal sheet with close/backdrop/Android Back dismissal and reduced-motion support. It holds edit, collections, coverage, sharing, failed-processing retry, reminder, archive/restore and confirmed deletion.

`apps/mobile/src/saved-text.tsx` is a shared plain-text reader. An initial excerpt expands in batches of four bounded text sections, with no 6,000-character cutoff. Every stored character remains accessible; no HTML is executed, rewritten or summarized. Notes show their complete saved text, sectioned into native text views. Collapse is above the body so the tapped control remains near the reader heading. Appending sections does not remount existing text views.

`apps/mobile/app/(account)/source/[id].tsx` also uses this reader, distinguishes metadata from extracted text and returns to the existing detail route rather than replacing coverage with a duplicate detail route.

No dependencies, design tokens, API contracts or backend code changed. Existing `Screen`, `Type`, `Button`, `TextAction`, `IconButton`, `SourcePlaceholder`, `Divider`, `Notice`, `Input`, `SheetSurface`, centralized Lucide icons and semantic theme roles own both themes, typography, touch targets, safe areas and spacing. The account layout already excludes detail/deep detail routes from tabs and FAB and was retained.

## Content and integrity

- Ready links/articles show real extracted text in-app and a prominent original URL action.
- Instagram/YouTube and other metadata-only links show any real saved page preview with explicit limited-coverage wording. They do not claim a transcript or understood video.
- Notes show the original user writing and an Edit note action. Website controls are omitted.
- Images use the authenticated asset endpoint, clickable real preview, full-screen modal and original sharing in More. A failed preview preserves the original-file action. Current image processing stores dimensions, not OCR; dimensions are never labeled extracted text.
- PDFs retain their real title/filename, availability notices, existing Android document/share handling and real extracted text when available. No inline PDF renderer was added.
- The detail API returns the entire stored extraction. Worker/HTML/PDF extraction stores at most 100,000 characters; PDFs over 100 pages/encrypted PDFs and scanned pages are not extracted by this configuration. Saved text is labeled as available coverage; reaching the cap gets an explicit notice. Source coverage retains actual processing errors.
- Retry appears only for backend-supported failed states. Metadata-only results may be permanent limitations and are not promoted as retry opportunities.
- Specialized next steps are fetched only in detail, from the existing evidence-gated action-options API, and omitted when none are returned. Reminders remain accessible independently in More. Eligibility failures do not fabricate options.

## Safety and navigation

Versioned backend mutations remain authoritative: stars change only after confirmation. Edit drafts, discard confirmation, comparison with latest title/content/collection, explicit rebasing and explicit latest-version replacement remain. Conflict responses open the editor for reconciliation. Updates and file sharing block route removal while pending.

Focus refresh reflects completed organization changes. Quiet enrichment polling skips editing/dirty states, and a ref checks the current editing/dirty/busy state again when any background response arrives. It cannot replace a draft opened after the request began. Image authorization is refreshed only when the asset identity/availability changes. Temporary sharing files are removed in finally, including failed requests.

Back pops the actual stack, retaining mounted Library/Search Results/Collection state rather than reconstructing those destinations. The label uses the preceding route, not a caller-supplied guess. A detail with no back stack replaces itself with Library. Native Android Back uses the same draft guard. Source coverage no longer creates a duplicate detail loop. Delete intentionally returns to Library after confirmed removal, as before.

## Validation

Executed successfully after the final source changes:

- `npm --prefix apps/mobile run typecheck`
- `npm --prefix apps/mobile run design:check`
- `git diff --check`

Reviewed the memory serialization, authenticated asset/retry endpoints, worker extraction caps, topic evidence, action-options API, organization, collection, source coverage, navigation layout and existing mutation paths. No backend changes require compatibility migration. No new automated test suites were added. No emulator, Android Studio, app build or device session was launched. No visual or physical-device checks are claimed.

The unrelated pre-existing `apps/mobile/tsconfig.json` working-tree edit is excluded from this implementation commit.

## USB-device QA

Use the already installed development build, configured local API and worker, and an authorized USB device. Reuse Metro if already running. From `apps/mobile`, the current `npm start -- --port 8081` script runs Expo with `--dev-client --localhost`. Do not press the emulator shortcut.

```sh
adb devices
adb -s USB_SERIAL reverse tcp:8081 tcp:8081
# Only when the configured API runs locally on the documented port:
adb -s USB_SERIAL reverse tcp:8001 tcp:8001
adb -s USB_SERIAL shell am start -a android.intent.action.VIEW -d 'app.recallbox.mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' app.recallbox.mobile
```

Package: `app.recallbox.mobile`. Replace `USB_SERIAL` with the physical device serial.

- Capture light/dark screenshots against the approved reference; check large Android text/display sizes, TalkBack, reduced motion and gesture/three-button safe areas. Exactly one More control; no wordmark, avatar, FAB or bottom tabs.
- Open a real article, select/copy text, repeatedly expand beyond 6,000 characters to the final stored character, collapse from the heading, and open the original URL. Include a long title and a missing title.
- Open Instagram/YouTube metadata-only saves. Confirm preview wording, absent fictional body/transcript and working original action. Verify unverified categories stay hidden and overrides appear.
- Read a complete note, edit title/body/collection, save, reopen, cancel edits and decline/confirm discard on toolbar and native Back. Confirm keyboard resizing and no clipped controls.
- Open a saved image, enter/leave full screen without losing reader position, and share its real original. Test preview failure and missing original independently.
- Open/share PDFs with and without embedded text; confirm actual extraction/limited coverage and readable text contrast.
- Star/unstar and reopen to confirm persistence; disconnect the network and confirm failed mutations do not show success. Organize topic/tags/memberships and verify changes on return.
- Open More; check edit, collection picker, source coverage, reminder, archive/restore and delete cancellation/confirmation on a disposable memory.
- Observe queued/processing content become ready in the same record. Open an editor during an in-flight refresh; confirm the draft survives. Test failed processing and retry. Metadata-only permanent limitations should not invite retry.
- Confirm specialized recipe/travel/learning actions appear only when the API supports them; no empty next-steps section for other sources. Confirm reminder access through More.
- With two clients, edit the same memory; confirm a conflict preserves the local draft, exposes the latest fields and requires explicit rebase/reconciliation before saving.
- Enter detail from a scrolled, filtered Library; return to its state. Repeat from Search Results with query/filters/order/offset, and from a Collection. Repeat via native Back and test a cold direct detail deep link for safe Library fallback.
- Simulate network failure and an unavailable/deleted record; verify recovery, honest original-file errors and preservation of local drafts.
