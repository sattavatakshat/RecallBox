# RB-12 — Collections Hub

## Existing implementation audit

The existing mobile client lists `/v1/collections?limit=100`, creates through the authenticated POST, opens the existing Collection Detail route, and supports versioned rename/delete in Detail. Membership PUT/DELETE and the per-memory collections endpoint support multiple collections per memory. Backend queries explicitly scope the owner and use transaction-local RLS. Delete soft-deletes the collection only; memories remain in Library.

Names are required, trimmed, and limited to 80 characters. The database's active-name unique index compares `lower(name)` per account. The backend locks the owner before enforcing a maximum of 100 active collections. Lists return actual nondeleted memory counts and order by creation timestamp descending, then ID descending. Creation/rename responses do not include counts: the hub never substitutes zero for missing counts.

The old hub used a full-width creation toggle and inline fields, custom drawn collection graphics, nonvirtualized rows, missing brand header, and an unknown-count-to-zero fallback. It refreshed on every focus and replaced the hub route when returning from Detail.

Uncommitted RB-11 work already had inline collection creation, organization draft protection, and membership reconciliation. The shared form replaces its inline name entry without changing topic/tag drafts or selecting membership on the server. Only the RB-12 integration is staged in Organize; the pre-existing RB-11 redesign, organization helper/tests, layout and TypeScript configuration remain uncommitted.

## Implementation and preservation

- The same `AppHeader` as RB-06 provides the official logo/wordmark and real account initials. Account opens existing Settings. Existing shared bottom navigation owns the active Collections tab and single RB-04 floating Save button.
- DM Serif Display editorial heading, exact approved subtitle, compact outlined New collection control, wrapping section header, 60dp Lucide collection tiles, real names/counts, inset separators and generous text growth use shared tokens in both OS themes. The shared bar's existing selected-tab styling is retained.
- FlatList renders stable IDs with 100dp final-row clearance. Unknown counts are omitted; singular/plural and zero counts use confirmed API values.
- The hub stays mounted behind Detail; dismiss-to return avoids replacement/stack duplication. Visiting Detail marks the hub for one refresh on return. Other focus returns reuse data for 30 seconds; pull-to-refresh is always available. Rename/delete/membership changes made from Detail are retrieved without resetting the list offset.
- Account-keyed hub state and the existing keyed account provider/auth generation boundaries prevent previous-account data reuse.
- Empty, initial loading, retryable errors and previously confirmed stale data are distinct. No sample collections, descriptions, cover images or inferred-topic collections are introduced.
- Rename/delete, add/remove membership and empty-collection Add saved items stay in existing Detail. Confirmation preserves Library memories.

## Shared collection creation

`CollectionCreationForm` owns name entry, validation, submit locking, API errors and uncertain-request reconciliation. Hub supplies a keyboard-aware modal using SheetSurface; Organize embeds the same form in its existing sheet. Hub opens Detail only after API success. Organize adds the confirmed collection to its local selected-membership draft and preserves unsaved topic/tags; Save changes still applies membership separately.

Empty names disable Create. More than 80 Unicode code points show validation. Duplicate and 100-collection-limit responses have specific messages. A network/server failure preserves the draft and locks creation behind Check collections. A confirmed matching name resolves the outcome; an absent match in a complete list unlocks a separate explicit retry. An incomplete list never unlocks retry. An account-scoped parent ref retains the attempted name across native modal unmounts and cancellation/reopening; the uncertain request must still be reconciled. Hub cancellation retains its name; Organize retains its existing discard-name behavior. A busy request prevents dismissal. No offline queue or unconfirmed success is claimed.

Button accepts an optional native ref for TalkBack focus restoration to the actual opener. Android Back, backdrop and Cancel dismiss the hub modal when idle. The scrollable sheet uses keyboard avoidance and bottom/top safe insets; controls retain minimum 48dp targets.

## Bounds and limitations

No backend change is needed: the 100-collection account cap and 100-item list request cover every account creatable through the current API. `has_more` is still handled honestly with an incomplete-list notice for exceptional/legacy data. No new pagination/search/pin/archive system was added. Existing Detail item retrieval remains bounded at 100 with its existing notice; redesign/pagination of RB-13 is outside this change.

This is an implementation and static review, not visual/device acceptance. Light/dark fidelity, TalkBack focus, physical Android keyboard/insets, long lists and live-server interactions require the USB checklist. No emulator, Android Studio, dependency or automated test suite was added.

## Validation

Run from the repository root:

```sh
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run design:check
git diff --check
```

TypeScript and design-system checks pass against both the working tree and an isolated copy of the exact staged mobile source (which excludes pre-existing RB-11 work). No backend files changed. Existing navigation/API contracts were reviewed against backend source and the uniqueness migration.

See [USB_TESTING.md](USB_TESTING.md) for physical-device acceptance.
