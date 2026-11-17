# RB-14 Contextual Inline Actions

## Existing implementation audit

The existing authenticated action-options endpoint already gates specialized actions using persisted readable text, `processing_state == ready`, suggested classification and a classification reason. Manual topic overrides, titles, filenames and inaccessible URLs do not unlock actions. Food additionally requires actual recognized ingredient lines (maximum 24 lines, each at most 200 characters); Travel and Learning currently return classification reasons without source quotations. These gates are unchanged.

RB-09 already fetched eligibility but offered a link to a separate Next Steps page. That page offered specialized creation, generic reminders and collections. Shopping POST immediately persisted extracted ingredients; the existing Shopping List page allowed editing afterward. Shopping and trips already had a unique active record per owner/source; learning also reused the source-linked queue entry. The shared `writing()` transaction locks the authenticated user's row and validates its session, serializing same-account creates. All these capabilities were reused.

Memory Detail already supplies saved content, originals, content-specific image/PDF handling, Star, Organize, More, editing, conflict handling and unsaved-edit protection. These remain. Shopping/trip header Back previously replaced the route with another Memory Detail instance; it now goes back to the existing screen when available.

Before editing, main matched origin/main. Uncommitted account-layout/Organize/organization-helper/TypeScript/test/RB-11 work and native ShareActivity/RB-03 USB documentation edits were present. They are excluded from this implementation.

## Architecture and UI

`ContextualActionCard` is a reusable component inside the existing Memory Detail route, after the saved readable content/available excerpt and source notices. It does not add a normal navigation destination. The existing original-access and Star/Organize/More arrangement stays intact, including Open original being prominent for link-only saves. No extra More, tabs or FAB is introduced.

The card uses shared Card, Button, Type, Notice, semantic palettes, spacing/radius tokens and centralized Lucide icons. It has a compact source-type icon, section heading, distinct action heading, supporting copy, an expandable Why this action disclosure, and a pill CTA. Light and dark appearances come from the same RB-DS-01 tokens; there are no new colors, fonts, libraries or dependencies. The screenshot's recipe thumbnail is not fabricated: RB-09 retains its real viewer/source placeholder behavior.

Only one returned specialized action is rendered. The documented priority for a future multi-option response is shopping, then trip, then learning. A verified empty response renders no recommendation section. An eligibility failure instead shows a small retryable message so it is not mistaken for verified absence.

## Eligibility and evidence

Eligibility loads without blocking the reader, with a context key comprising memory ID, version, processing state and update timestamp. Unchanged renders/focus do not refetch eligibility. Relevant saved-source/enrichment changes recheck it. Requests are guarded against stale contexts/unmounted components; account and memory keys isolate evidence and local drafts. A source-version mismatch requires refreshing the displayed memory. Failures remain retryable.

Why this action lazily renders the actual API `reason` under Eligibility explanation. Returned evidence is separately labeled Saved source lines and is selectable/readable, bounded to the existing 24-line contract. No direct quotation section is invented for travel/learning when their evidence arrays are empty. The API `kind`, not UI heuristics, determines the action; `label` remains in the compatible contract while approved RB-14 CTA copy is mapped by supported kind.

## Shopping handoff and minimal RB-15 contract

An eligible shopping card first performs the authenticated, read-only source-list lookup. A saved list changes the CTA to Open shopping list and opens that actual list. Lookup failure disables creation until a successful retry; opening the preview never calls POST.

Make shopping list rechecks for an existing list, then opens `ShoppingDraftPreview`. The draft remains local and source/account scoped. It contains the source memory ID, API source version, requested list title, stable UUID ingredient IDs, editable text, checked state, `origin: source | user`, and original `source_quote` for each source-derived line. It seeds only genuine returned ingredient lines. It supports editing, adding/removing items, list naming, Cancel and explicit Create list. Pending unadded input must be added or cleared before confirmation.

Source text and user text remain distinct. An edited source-derived item keeps its original quote, while the visible edited value is labeled Edited by you. New manual items have user origin and a null quote. The existing persisted Shopping List page now uses the same truthful edited/source distinction. No quantities or new source facts are generated.

The shared modal sheet uses keyboard avoidance, safe insets, a scrollable editor, persistent confirmation, accessible controls and initial heading focus. Cancel/Android Back discards the local draft without changing the saved memory. Drafts are retained through request errors and eligibility changes while the sheet is open; they are intentionally not durable across app termination/account switches.

## Backend contract and creation safety

- Action-options GET adds an optional-compatible `source_version` response field. Existing `items/kind/label/reason/evidence_lines` remain unchanged.
- `GET /v1/memories/{memory_id}/shopping-list` is new and read-only. It validates the owned, nondeleted source and returns `{item: list | null}`. It never creates a record.
- Existing shopping POST accepts an optional confirmed-draft body: `{expected_source_version, title, items}`. The body is optional to preserve older clients; the new UI always supplies it at Create list.
- Within the existing authenticated write transaction, the source is owner checked and locked, an active existing list is returned without overwriting it, and a new draft must match the current source version and unchanged eligibility gate.
- Every claimed source quote must be one of the current server-extracted ingredient lines. Manual items cannot claim source evidence. Edited text is retained separately from the verified quote. New drafts require 1–60 unique-ID items, 1–200-character meaningful item text, a nonblank title of at most 160 characters, valid UUIDs/provenance, and a bounded serialized payload consistent with the existing JSONB limit.
- No schema migration is necessary. Existing source-linked unique indexes and per-owner serialized writes prevent duplicate active lists, including concurrent confirmations.

Before every creation/retry, the UI checks for a saved list. After an uncertain POST, it checks again and navigates only if a real list is confirmed. Otherwise the submitted draft remains; if reconciliation also fails, edits freeze until a check/retry or explicit cancellation, and leaving explains that the list may already exist. A retry cannot overwrite an existing list with a new draft. Source-version conflicts preserve the draft and require explicit review; loading updated source ingredients requires confirmation before replacing source-derived items/edits, retaining the requested title and user-added ingredients.

## Travel, learning and existing functionality

Eligible travel uses the existing explicit POST and opens the returned trip. The shortlist remains one saved source of inspiration; no addresses, hours, travel times or multi-memory itinerary are claimed. The existing serialized source-linked creation safely reuses an earlier result on retry.

Eligible learning uses the existing source-linked create/reuse endpoint and navigates to the existing learning queue only after acknowledgement. No lessons, quizzes or tutorials are generated.

Synchronous locks and navigation guards prevent competing action submissions. A navigation latch prevents duplicate destination pushes until the user returns. Star, Organize, More, edit title/content, archive/restore, delete confirmation, source details, file sharing, processing retry, original access and unsaved/version-conflict protection remain in RB-09. Actions disable while the memory has an unsaved edit or another relevant operation is in progress. Reminders remain under More, with their existing in-app-only delivery limitations unchanged.

Legacy `/next-steps?memoryId=...` entry points dismiss back to the matching memory context or replace with it if necessary; missing context returns to Library. There are no remaining normal links to Next Steps and no creation on the compatibility route. Shopping and trip Back return to the existing Memory Detail instance, preserving the reader's navigation/scroll context, with safe deep-link fallbacks.

## Files changed

- `apps/mobile/app/(account)/memory/[id].tsx`
- `apps/mobile/app/(account)/next-steps.tsx`
- `apps/mobile/app/(account)/shopping/[id].tsx`
- `apps/mobile/app/(account)/trip/[id].tsx`
- `apps/mobile/src/contextual-action-card.tsx`
- `apps/mobile/src/shopping-draft.tsx`
- `apps/mobile/src/api.ts`
- `apps/mobile/src/icons.tsx`
- `src/recallbox/action_options.py`
- `src/recallbox/shopping.py`
- `docs/UX/rb-14/IMPLEMENTATION.md`

## Verification performed

- `npm run typecheck`.
- `npm run design:sync` and `npm run design:check`; native generated assets remain unchanged.
- `git diff --check`.
- Python AST syntax validation and actual FastAPI imports/OpenAPI generation for both changed backend routers, including optional-body compatibility review.
- Ad hoc, in-memory checks of draft input validation, edited wording with retained quotation, manual-origin restrictions, forged quote rejection, stale-source version rejection, duplicate IDs/count/title validation, and pending/nonrecipe eligibility. These created no database records and no new test suite.
- Static review of only-at-confirmation shopping POST, lookup/retry paths, source ownership/version checks, existing serialization/unique constraints, normal and legacy navigation, and preserved RB-09 controls.

No emulator, Android Studio, native build, physical-device verification, live database execution or deployed API verification was performed.

## Deployment and known limitations

Deploy the backend changes before using the new draft flow; the new mobile UI requires the read-only lookup and versioned draft POST support. Older clients retain their existing no-body POST behavior. No deployment was performed as part of this change.

Full RB-15 visual redesign remains deferred. Drafts are local-only, there is no offline creation queue, no invented thumbnail pipeline, and no new generated-content features. Travel/learning evidence remains the genuine classification reason when the backend supplies no direct quotes. Shopping list uniqueness remains per active owner/source, with existing-result reuse rather than replacement. Source-version checks are deliberately conservative: any source version change can require renewed review. Visual fidelity, TalkBack, keyboard/safe-area behavior and navigation restoration need the following physical checks.

## Physical Android QA — USB only

Application ID: `app.recallbox.mobile`. With the authorized physical phone connected, run `adb devices`, `adb reverse tcp:8081 tcp:8081`, start the existing dev server via `npm start` in `apps/mobile`, and launch the installed development client using `adb shell monkey -p app.recallbox.mobile -c android.intent.category.LAUNCHER 1`. Point it to the updated backend. Use real, privately saved examples; API request observation/fault injection should remain local and should not log private bodies.

1. Set Android Light appearance, open an eligible recipe memory and compare the compact inline card to the supplied reference. Confirm original RB-09 controls remain.
2. Switch Android Dark appearance and verify forest/ivory surfaces, lime CTA/icon accents, evidence contrast and the draft sheet.
3. Open a recipe with actual recognized ingredient lines and backend Food eligibility; verify one shopping card appears after the source text/excerpt.
4. Expand/collapse Why this action; use TalkBack to verify its expanded state and action label.
5. Compare every displayed source line to the saved ingredient text; verify missing quantities remain missing and the classification explanation is separately labeled.
6. Tap Make shopping list. Observe requests: lookup GETs are allowed, but no shopping POST/database list is created merely by opening the draft.
7. Edit a source-derived ingredient; verify the new wording is labeled edited and its original quote remains visible.
8. Add a manual ingredient and verify Added by you with no source quote; test blank/length/count limits.
9. Remove ingredients, including all of them; verify creation is disabled for an empty list and no memory content changes.
10. Cancel the draft or use Android Back. Reopen it and confirm no new saved list was created from cancellation.
11. Review ingredients and title, then tap Create list once/rapidly twice; verify one acknowledged persisted list with the intended values.
12. In the existing Shopping List screen, verify edited/source/manual provenance, checkbox/edit/save behavior and source access.
13. Return to Memory Detail; verify Open shopping list, a nonmutating lookup, the same list ID and no duplicate creation.
14. Open an eligible travel memory, inspect the genuine reason, start the shortlist and verify the actual source-linked trip opens. Repeat/retry and verify the existing trip is reused.
15. Open an eligible learning memory, add it to the queue and verify the existing learning experience; repeated taps/retries must not duplicate the entry.
16. Open a link-only/inaccessible Instagram save; verify no claimed transcript, ingredients or destinations and keep Open original prominent.
17. Open an enrichment-pending save; verify the original remains accessible and no unsupported card appears. When actual enrichment completes, verify eligibility refreshes.
18. Open a memory with no eligible action and a recipe without recognized ingredients; confirm there is no empty specialized-action section.
19. Fail the eligibility request using a local proxy or networking interruption; verify a small Retry message and a usable reader, not a false no-action conclusion.
20. Fail a Create list request before commit; verify the ingredient/title draft remains and retry can continue safely.
21. Drop the successful POST response or disconnect immediately after submission; restore connection and retry. Verify read-only reconciliation, one existing list and no false success. If the lookup also fails, verify the unknown-status message, frozen submitted draft and explicit leave confirmation.
22. More → Set a reminder; verify the existing reminder flow and its in-app-only notification wording.
23. Star/unstar, Organize and Add to collection; verify existing memberships and persistence, including return from RB-13 to the same reader.
24. Open original for links, expand/share an actual image, open/share a PDF and use Source details; verify RB-10 behavior remains.
25. From a scrolled reader, create/open shopping, travel or learning, then Back. Verify the existing Memory Detail and origin navigation/reading context are restored. Also test action-screen deep links.
26. Edit a memory and attempt to leave; verify unsaved-edit protection and existing version-conflict review. Separately update a source while its shopping draft is open; verify stale creation is rejected, the draft remains, and updated ingredients replace source-derived edits only after explicit confirmation. Switch accounts and verify no evidence/draft/list leakage; also test archived/deleted source availability.
27. Verify no global FAB or bottom navigation on Memory Detail; test keyboard, large fonts, TalkBack focus/return focus, gesture navigation and three-button Android navigation in the draft.
28. Tap the inline action and confirm no Next Steps detour. Open a legacy Next Steps link with a valid memory ID and then without one; verify safe Memory/Library routing with no blank screen, creation or navigation loop.
