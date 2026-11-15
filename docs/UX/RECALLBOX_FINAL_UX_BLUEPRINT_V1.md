> **Design reference only (8 Nov 2026).** This records intended UX; check current main and actual device behavior for implementation status.

# RecallBox — Final UX Blueprint V1

**Design review:** 8 November 2026  
**Status:** Proposed final design baseline / implementation handoff — **not** a claim that these screens are implemented or user-tested.  
**Product:** RecallBox native Android and iOS application.  
**Current codebase at review:** `sattavatakshat/RecallBox`, `main` at `5374036` (7 Nov 2026). 

## 0 — The decision in one sentence

**RecallBox is a private, calm, searchable library of things a person saved, with frictionless capture and useful actions offered only when there is reliable source evidence.** The visual metaphor is an editorial field notebook, not an AI dashboard or social feed.

### Provenance of decisions

- **Already approved by product owner:** Instant Save / native share confirmation closes automatically; automatic organization with user override; evidence-grounded optional actions; Library displays only usable finalized memories; unfinished items are accessible separately.
- **Decided in this design review (not explicitly approved by user):** three primary destinations (Library, Search, Collections); floating Save action instead of a tab; compact thumbnail-led list; contextual action panels; starred as filter; user-owned collections; smart topics as filters; 'Recently captured' as secondary queue; paper-and-forest visual language; screen inventory and copy below.
- **Actual implementation state:** Real PostgreSQL/Auth0 client configuration and Android build exist; real sign-in and authenticated note flows remain unverified in the cited commit. Link ingestion, semantic search, share extensions, actions and most of the screens below are proposed future implementation, not present features.
- **Review method:** Three simulated adversarial design passes per screen—(a) first-time clarity, (b) returning-user scale, (c) accessibility/trust/operational failure. These are product/design critiques, **not user interviews, usability experiments, or empirical A/B test results**.

## 1 — Design skills / standards applied

1. [nextlevelbuilder / ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — design system generation, stack-aware UI rules and anti-pattern checks. Applied by establishing one cohesive mobile visual language, interaction principles and a pre-delivery checklist.
2. [obra / superpowers — brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md) — challenge assumptions, compare genuinely different approaches, play back decisions and test a throwaway visual companion. Applied here without asking repeated choices because the product owner delegated design authority.
3. [anthropics / claude-code — frontend-design](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design) — distinct aesthetic direction and meticulous typography/spacing, avoid template-looking AI panels. Applied as warm editorial notebook and intentional simplicity.
4. [humbleteam / accessibility-audit](https://github.com/humbleteam/accessibility-audit) — WCAG 2.2-based accessibility review protocol. Applied to proposed component rules; a real audit requires rendered device states and accessibility inspection.
5. [Android navigation guidance](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) and [Apple tab bar guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars) — bottom destinations are navigation targets, not buttons for immediate actions. Hence Save floats outside the tab bar.

No external source should be taken to endorse this exact product design; this is an authored synthesis and design hypothesis.

## 2 — Design-wide rounds of debate

| Round | Candidate A | Candidate B | Candidate C | Final decision |
|---|---|---|---|---|
| **1: Mental model** | Social inspiration feed: visual but noisy | File manager: organized but work-heavy | Personal field notebook: recognizable, easy to retrieve | **Field notebook** with compact media-led rows and search above the fold |
| **2: Navigation** | Five tabs (Library, Search, Save, Collections, Actions) | Three destinations plus a distinct Save action | One infinite dashboard with menus | **Three tabs + Save action**; Actions live in context and profile/settings stay secondary |
| **3: Trust / processing** | Show every save as processing card in Library | Hide processing everywhere | Keep Library usable-only, quiet capture outbox accessible | **Library + Recently Captured**; acknowledge only durable captures, no misleading completed state |
| **4: Organization** | Manual folder required before save | Automatic folders proliferate | Evidence-based topics/tags plus user-owned collections | **Hybrid, non-blocking**; manual override prevails, uncertain records remain uncategorized |
| **5: AI action surface** | Prominent universal AI action button | Automatically create suggestions/plans | Contextual eligible actions with editable, cited outputs | **Evidence-gated, opt-in actions**; never invent ingredients/places/metadata |
| **6: Visual density** | Giant tiles for everything | Dense text-only rows | Compact rows with authentic thumbnail and optional gallery later | **Compact list by default**; no fake image extraction |
| **7: First session** | Multistep tutorial | Completely unexplained blank app | Short welcome + actionable empty Library | **One welcome and useful first-save CTA**, no permission carousel |
| **8: Accessibility** | Icon-only novelty | Label-first native conventions | Custom gestures everywhere | **Labels + native semantics**, 44–48 dp touch targets, visible state, reduced motion |

**Reject:** AI purple gradients, glowing orbs, fake content summaries, lengthy onboarding, universal 'Analyze' CTA, auto-generated collections, progress percentages in main Library, primary action tucked into navigation tab.

## 3 — Information architecture / navigation

```text
Native share sheet from another app
  → RecallBox capture receiver
    → locally durable queue or server-durable record
      → brief Saved confirmation (then auto-close)
      → Recently Captured (if unfinished / failed / offline)
      → Library (once useful final status achieved, including link-only)

App launch
  ├─ Signed out → Welcome → secure hosted sign-in → Library
  │   └─ shared item waiting locally? restore it after sign-in
  └─ Signed in → Library (default)
       ├─ Search → Results → Memory Detail → open original / contextual action
       ├─ Collections → Collection Detail → Memory Detail / Create Action
       ├─ Profile → Settings → Privacy / Export / Delete / Reminder preferences
       ├─ Save (+ distinct floating button) → Capture sheet
       └─ Recently Captured → pending / failure / retry / cancel / source link

Memory Detail
  ├─ Edit title/note / Star / Archive / Delete
  ├─ Organization → topics/tags override + add to one or many collections
  ├─ Source / Evidence / Coverage
  └─ Actions (eligible)
       ├─ Recipe → Shopping list
       ├─ Travel → Trip shortlist / itinerary
       ├─ Learning → Learning queue
       └─ Generic → Reminder
```

### Primary navigation

- **Library:** icon `library` (stacked book/saved page), label `Library`.
- **Search:** icon `search`, label `Search`. Separate real search destination, persistent on tapping result back.
- **Collections:** icon `layers`, label `Collections`.
- **Save:** separate round `plus` button above/beside bottom navigation, physically distinct from destination icons. It **opens** the capture sheet; it does not change tab selection. Android back dismisses sheet first.
- **Account:** avatar/profile icon at Library header and in settings via consistent account control. No permanent Actions tab.

### Content classification model

- **Primary topic:** one optional broad topic such as Food, Travel, Learning, Shopping, Ideas, Work, Entertainment. It is an inferred **filter**, not a folder. UI may show only useful/populated topics.
- **Secondary tags:** multiple evidence-backed labels (Goa, recipe, Java, vegetarian) or user-supplied tags. Keep provenance `suggested` vs `added by you` in edit view; no confidence numbers in Library.
- **Collections:** user-created intentionally named grouping, any type of content, multiple memberships. Explicit Add-to-collection action; avoid auto-creating folders.
- **Stars:** simple favorite marker, accessible as filter on Library and in memory details.
- **Archived:** kept and searchable, excluded from normal Library unless archive filter is selected.
- **Unknown/metadata-only:** no guessed topic; item can be a usable source link with explanatory coverage in Detail.
- **Manual overrides:** sticky across reprocessing; system may propose a replacement but never silently clobber a deliberate user decision.

### Memory state model and routing

| Captured state | Meaning | Library visible? | Where visible? |
|---|---|---:|---|
| `local_queued` | Captured durably on device but not uploaded | No | Recently Captured (On this device) |
| `server_accepted` | Metadata + job committed, processing not completed | No | Recently Captured (In progress) |
| `processing` | Worker running | No | Recently Captured (In progress) |
| `ready_full` | Usable extracted/entered original content | Yes | Library |
| `ready_partial` | Usable partial extraction, truthfully labeled | Yes | Library |
| `ready_link_only` | Saved source link only, processing finished | Yes | Library |
| `failed_recoverable` | No final usable result, retry/keep source | No until finalized as link-only | Recently Captured (Needs attention) |
| `deleted` | User removed | No | Nowhere; pending server purge not displayed as restored |

The save checkmark is shown **only when local durable or server durable acknowledgment exists**. Never hide an acknowledged capture even when workers fail. After status changes, cards appear in the Library on next refresh/update; maintain stable ordering by `saved_at`.

## 4 — Screen-by-screen design and adversarial review

**Each screen:** purpose → hierarchy/layout → primary/secondary action → behavior/states → three critique passes → final decision. Screen IDs are stable handoff references; screens may map to modal surfaces rather than one React route.

### RB-01 — Welcome + sign-in

**Purpose:** First-time user trusts the app and can reach real authentication.

**Layout and widgets:** Small bookmark wordmark; single headline “A home for what you save.”; one grounded sentence; secure **Continue** button; quiet “Your saves stay private” explanation with link to privacy. No fake sample library or carousel.

**Actions and navigation:** Primary: **Continue securely** → hosted Auth0 native browser PKCE. Secondary: Privacy. Successful callback → Library; logged-in app launches skip welcome.

**Important states:** Failed/cancelled auth: preserve any pending local capture; show retry. Cold callback: recover app state, never silently drop user. Browser consent is provider UI, not a custom imitation.

**Three-pass adversarial critique:**

1. First-use: Does a three-slide tutorial block value? Yes—reject.
2. Returning user: An extra branded welcome every launch creates friction—skip on valid session.
3. Trust/a11y: Provider owns credentials; no fake “Google” button or invented privacy claim.

**Final:** One calm entry screen; direct hosted sign-in; no onboarding questionnaire. **Lead icon:** `shield-check` (Lucide-style outline, paired with a text label where functional).

### RB-02 — Empty Library / first useful moment

**Purpose:** Make the first session actionable without pretending it already has content.

**Layout and widgets:** Header “Your library.”; welcoming but brief empty illustration of a folded bookmark (not AI-art); single primary **Save something**; examples “Paste a link · Write a note · Add a file”; search visible but empty explanation.

**Actions and navigation:** Primary: Save opens capture sheet. Secondary: How sharing works opens concise tip; no permission prompts until needed.

**Important states:** Offline signed-in: allow device-durable note or queued capture, label correctly. Empty after an attempted share? Show Recently Captured row immediately.

**Three-pass adversarial critique:**

1. First-use: An empty canvas with only a plus button is cryptic—give a concrete CTA.
2. Scale: Do not reserve an empty-state hero after first item.
3. Trust: Never populate fake memories just to decorate the screen.

**Final:** One illustrated empty state and explicit Save CTA. **Lead icon:** `bookmark-plus` (Lucide-style outline, paired with a text label where functional).

### RB-03 — Native Share → Instant Save confirmation

**Purpose:** Accept a real incoming URL/file without interruption and return to origin.

**Layout and widgets:** Native system share menu → RecallBox capture receiver; after durable acknowledgment, compact bottom confirmation: check icon, “Saved to RecallBox” or “Saved on this device”; no preview editing.

**Actions and navigation:** Primary: None after success; auto-dismiss. Secondary: “Open RecallBox” only as optional system affordance where native surface permits; otherwise return to origin.

**Important states:** If app inactive/cold: persist payload first, then restore capture after auth. Multiple items display “3 items saved” only when all durable; partial result shows exact count. Failure requires explicit Retry/Cancel, not false checkmark.

**Three-pass adversarial critique:**

1. First-use: Asking category at share time breaks the core promise—reject.
2. Scale: A success full-screen causes context-switch fatigue—use compact native confirmation.
3. Trust: Distinguish server saved from local queue; never promise extraction at this step.

**Final:** One-tap durable capture, brief success, auto-close; previously approved. **Lead icon:** `check-circle` (Lucide-style outline, paired with a text label where functional).

### RB-04 — Manual Save sheet

**Purpose:** Offer a fast capture path when no external share was used.

**Layout and widgets:** Bottom sheet title “Save something”; five distinct rows: Paste a link (`link`), Write a note (`notebook-pen`), Photo or screenshot (`image`), PDF (`file-text`), Video (`video`). Recent clipboard paste may be offered explicitly, never auto-read silently.

**Actions and navigation:** Tap input type → native picker/editor; auto-focus URL field when Paste a link selected; Save is only after meaningful input. Files show filename/size and local preview before upload if it prevents wrong-file capture.

**Important states:** Unsupported/oversized input: explain constraint without losing input. Account unavailable: secure local outbox if possible. No extraction engine or API details on this surface.

**Three-pass adversarial critique:**

1. First-use: A single ambiguous plus button must disclose options—sheet shows labelled icons.
2. Scale: Avoid a dozen media types before launch; group Photo/Screenshot.
3. Trust/a11y: Native pickers, cancel path, permission-on-demand.

**Final:** Five simple capture entry points, not a dashboard. **Lead icon:** `plus` (Lucide-style outline, paired with a text label where functional).

### RB-05 — Recently Captured / processing inbox

**Purpose:** Make unfinished saves recoverable without polluting Library.

**Layout and widgets:** A low-emphasis “Recently captured” row in Library; dedicated screen splits **Waiting**, **Needs attention**, and **On this device**. Each row has source, captured time, and accurate status. No percent bars by default.

**Actions and navigation:** Primary: Retry failed capture; Open source if URL exists. Secondary: Cancel only when safe; Remove requires confirmation if local only.

**Important states:** New successful processing → item leaves queue and appears Library; link-only final becomes Library. Offline queue waits with explanatory copy. Never auto-delete user source simply because extraction failed.

**Three-pass adversarial critique:**

1. First-use: Hiding all pending saves makes Save feel broken—surface discreetly.
2. Scale: Thousands of queued items need grouped sections, count and bulk retry later.
3. Trust: Distinguish a worker error from lost content; show actionable retry.

**Final:** Quiet reliable outbox; no rotating processing indicators in Library. **Lead icon:** `clock-3` (Lucide-style outline, paired with a text label where functional).

### RB-06 — Populated Library (home)

**Purpose:** Help users recognize and return to saved things quickly.

**Layout and widgets:** Small brand/header with avatar; strong serif title “Your library.”; full-width Search affordance; horizontal topic filters **All, Starred, Food, Travel, Learning** based on populated topics; heading “Recently saved”; compact thumb-led rows: title, source, saved date, optional single category. Sticky bottom three-tab navigation; floating Save.

**Actions and navigation:** Primary: Tap row → Memory Detail; Search → search screen. Secondary: Star affordance; overflow for Archive, Organize or Delete. Collections not shown as giant home cards.

**Important states:** Only `ready_*` items. Real thumbnails if available; neutral source glyph otherwise. No fake extraction thumbnails. In list, badges only for exceptional link-only/partial status when important. Scroll position preserved when back.

**Three-pass adversarial critique:**

1. First-use: Giant media cards make finding one item hard—reject gallery-only default.
2. Scale: 1,000 saves need virtualization, stable order and filters that remain compact.
3. Trust: “No results” under selected filter differs from empty account; no processing placeholders.

**Final:** Compact editorial library with strong Search; no AI summary feed. **Lead icon:** `library` (Lucide-style outline, paired with a text label where functional).

### RB-07 — Focused Search

**Purpose:** Turn a fuzzy recollection into a precise lookup.

**Layout and widgets:** Auto-focused labelled input “Find something you saved”; recent queries stored privately on-device/account with clear history option; optional example prompts as static education until user has content.

**Actions and navigation:** Primary: Submit natural-language or keyword query. Secondary: Filters and clear query. Avoid prominent “Ask AI” claims without working semantic search.

**Important states:** Offline: search cached accessible memories with explicit local-only indication. While index catches up, show keyword results even if semantic unavailable.

**Three-pass adversarial critique:**

1. First-use: Blank input benefits from one grounded example—not a fake answer.
2. Scale: Search needs quick type filters rather than scrolling hundreds of tags.
3. Trust: No invented matches, unsupported language/embedding limits stated honestly.

**Final:** Search is a destination, not a chat-bot conversation. **Lead icon:** `search` (Lucide-style outline, paired with a text label where functional).

### RB-08 — Search results / filters / zero results

**Purpose:** Make matches credible and narrowing easy.

**Layout and widgets:** Persistent query header; result count; horizontal filters Type, Topic, Date, Starred; compact same component as Library with highlighted **real source snippets** and origin. Optional sort “Best match / Recent”.

**Actions and navigation:** Primary: Open memory. Secondary: Refine query and filter, return to query input without losing previous edits.

**Important states:** No match: “Nothing saved matches that yet.” with suggested adjustment; no hallucinated search snippets. Partial/link-only result shown if URL/title matches, clearly limited.

**Three-pass adversarial critique:**

1. First-use: Snippet must explain relevance; title-only retrieval is confusing.
2. Scale: Filtering/sorting should not reset query or scroll unexpectedly.
3. Trust: Respect account scope and display only source-backed excerpt.

**Final:** Relevant, source-backed results; no conversational fiction. **Lead icon:** `list-filter` (Lucide-style outline, paired with a text label where functional).

### RB-09 — Memory Detail — shared shell

**Purpose:** Give one dependable place to inspect and use any saved item.

**Layout and widgets:** Back; source icon/domain + saved date; full title; available true thumbnail/preview; “Open original” primary when URL exists; source-backed content sections; compact toolbar Star, Add to Collection, More; suggestions in **Useful next steps** beneath verified content.

**Actions and navigation:** Primary: Read/open source or perform eligible content action. Secondary: Edit title, tags, collection, archive/delete. Never hide original source behind generated content.

**Important states:** If source removed: preserve saved user-owned data and show link state. No source content: transparent metadata-only view. Edits version-conflict path must protect draft.

**Three-pass adversarial critique:**

1. First-use: An opaque AI summary hides where claims came from—foreground source.
2. Scale: Long content needs sections and jump-to-source, not single massive text.
3. Trust: Provenance and partial coverage sit near representation, not in a technical log.

**Final:** One content-first shell with typed details and optional actions. **Lead icon:** `file-text` (Lucide-style outline, paired with a text label where functional).

### RB-10 — Memory Detail — specialized content

**Purpose:** Tailor representation without fragmenting the mental model.

**Layout and widgets:** Article: extracted text with source. Instagram/YouTube link: factual metadata and Open Original; if inaccessible, “Video content not available” without transcript. Image: original + OCR text with highlights. PDF: page-aware excerpts and original. Uploaded video: timestamped transcript only when actually generated.

**Actions and navigation:** Primary varies: Open Source, View PDF, View Image, Play authorized media. Secondary actions derive from actual eligible content; consistent Star/Collections toolbar.

**Important states:** Unknown PDF password/corrupt file: clear unsupported state and retain original when allowed. Missing transcript: never generate generic pseudo-transcript. Partial OCR labelled.

**Three-pass adversarial critique:**

1. First-use: Uniform generic card loses format affordance—custom viewer per media type.
2. Scale: Long PDF/video require segmented jump controls and lazy rendering.
3. Trust: Separate extracted evidence from AI interpretations and unsupported content.

**Final:** Shared chrome; source-specific viewer; truthful coverage language. **Lead icon:** `files` (Lucide-style outline, paired with a text label where functional).

### RB-11 — Organize / correct suggestions

**Purpose:** Allow control without requiring organization.

**Layout and widgets:** Bottom sheet “Organize memory”: suggested topic and supported tags with provenance indicator, editable topic dropdown, add/remove tags, choose one or more Collections. “Suggestions can be wrong” tiny help copy; user-created entries clearly marked.

**Actions and navigation:** Primary: Save changes. Secondary: Reset suggestion or remove from collection. Manual overrides retained after reprocessing; no empty-state category request.

**Important states:** No inferred topic → “Not categorized”; do not create fake Place tag from Instagram alone. Account sync conflict warns and offers explicit choice; preserve local edits.

**Three-pass adversarial critique:**

1. First-use: Proposing folders before capture creates work—organize later.
2. Scale: Avoid unbounded tag chips on card; edit in sheet.
3. Trust: One category’s uncertainty should not imply all metadata verified.

**Final:** Controlled secondary organization, easy corrections. **Lead icon:** `tags` (Lucide-style outline, paired with a text label where functional).

### RB-12 — Collections hub

**Purpose:** Help people build intentional projects out of saved things.

**Layout and widgets:** Header “Collections”; modest Create collection action; pinned collections first, then recent; each row shows name, real item count, 2–3 real item thumbnails where available. Do not populate automatic collections in this list.

**Actions and navigation:** Primary: Open collection or Create. Secondary: Rename, pin, archive collection via overflow.

**Important states:** Empty collection allowed with helpful Add items. Deleted collection must not delete memories. Offline edits queued and conflicts handled.

**Three-pass adversarial critique:**

1. First-use: “Suggested collections” look like folders someone else made—reject.
2. Scale: Sort/pin and search collections once count grows.
3. Trust: Counts are owner-scoped and must match records.

**Final:** User-created purposeful boards, not category buckets. **Lead icon:** `layers` (Lucide-style outline, paired with a text label where functional).

### RB-13 — Collection detail

**Purpose:** Browse a focused set of memories and act on them together.

**Layout and widgets:** Collection title, editable short description, count, Add Memories button, compact mixed-media list, optional pin/reorder. For Travel, a contextual “Make a trip plan” can appear if user intent and saved places support it.

**Actions and navigation:** Primary: Add or open item. Secondary: Reorder, remove from collection (not delete source), rename, create eligible aggregate action.

**Important states:** A collection can mix sources and data coverage; only use supported data in generated plans. No automatic itinerary from all URLs by default.

**Three-pass adversarial critique:**

1. First-use: Do not confuse Remove with Delete—label clearly.
2. Scale: Drag order is optional; provide accessible Move Up/Down fallback.
3. Trust: Aggregate actions list precisely which saved items were used.

**Final:** Intentional collection, flexible contents, optional project actions. **Lead icon:** `folder-open` (Lucide-style outline, paired with a text label where functional).

### RB-14 — Contextual action selection

**Purpose:** Recommend an actionable next step without making fake certainty.

**Layout and widgets:** “Useful next steps” section beneath Memory Detail or Collection detail; show at most 1 primary eligible contextual action and a “More” entry for other eligible actions. Capability chips from content evidence, not random marketing text.

**Actions and navigation:** Primary: user explicitly taps “Make shopping list”, “Add to trip”, “Add to learning queue” or “Remind me”. Secondary: view evidence/requirements, edit missing data.

**Important states:** Evidence insufficient → show a generic safe action (“Add to collection” or “Remind me”) and optionally “Create blank shopping list” with user input, clearly not auto-extracted. No background action creation.

**Three-pass adversarial critique:**

1. First-use: A global Actions tab is meaningless before users know what actions are—reject.
2. Scale: Do not dump 12 suggestions for each save.
3. Trust: Eligibility validation prevents invented places, ingredients or timestamps.

**Final:** Optional evidence-gated action cards close to relevant source. **Lead icon:** `sparkles` (Lucide-style outline, paired with a text label where functional).

### RB-15 — Recipe → editable shopping list

**Purpose:** Turn one verified recipe into a trustworthy checklist.

**Layout and widgets:** Top shows source title + link and confirmed ingredients; serving adjustment only when units/quantities are well-structured; missing amounts displayed as “Quantity not specified”; checklist rows editable; manual add ingredient.

**Actions and navigation:** Primary: Create list after preview; then check off and save. Secondary: Remove item, change quantity, open evidence source.

**Important states:** If website only has title/image: say ingredients unavailable; offer blank list, not synthetic ingredients. Multi-source lists require traceability per entry.

**Three-pass adversarial critique:**

1. First-use: Too much pre-save setup blocks action—present simple preview.
2. Scale: Duplicate ingredients from multiple recipes must be merged only with user consent.
3. Trust: No invented quantities or food requirements.

**Final:** Traceable editable checklist, not a generative recipe claim. **Lead icon:** `shopping-basket` (Lucide-style outline, paired with a text label where functional).

### RB-16 — Travel → shortlist / itinerary

**Purpose:** Move from inspiration to planning without false precision.

**Layout and widgets:** Trip title, destination editable, optional dates/timezone, Saved Places list with source links; day columns/cards for plans; time is empty until supplied. User adds sources into day slots.

**Actions and navigation:** Primary: Add to trip / create itinerary. Secondary: move between days, remove, add note. No auto-booking. Route/map only when coordinates or verified address exists.

**Important states:** Missing address → “Location needs confirmation”; no travel-time or hours estimates without lookup. Save offline edits and sync with conflict resolution.

**Three-pass adversarial critique:**

1. First-use: Autogenerating a full itinerary from one vague Reel overpromises—start shortlist.
2. Scale: Days must be scannable, reorderable; chronological sorting preserves manual intent.
3. Trust: Provenance and unknown details visibly preserved.

**Final:** Saved-place shortlist first; editable itinerary when user chooses. **Lead icon:** `map` (Lucide-style outline, paired with a text label where functional).

### RB-17 — Learning queue

**Purpose:** Turn saved tutorials into attainable progress.

**Layout and widgets:** Queue of selected article/video/PDF memories with title/source, optional estimated duration only if known, status To do / In progress / Done, reorder and a simple “Continue learning” affordance.

**Actions and navigation:** Primary: Open next learning item or mark Done. Secondary: reorder, remove (does not delete source), set reminder.

**Important states:** Inaccessible video remains link-only; progress never implies content watched unless user marks it. Offline progress syncs safely.

**Three-pass adversarial critique:**

1. First-use: An AI study plan is more elaborate than needed—start with queue.
2. Scale: Sort by priority and last opened; do not inject notifications by default.
3. Trust: Completion stays user-controlled.

**Final:** A useful reading/watch queue, not a forced course builder. **Lead icon:** `graduation-cap` (Lucide-style outline, paired with a text label where functional).

### RB-18 — Reminder creation and delivery

**Purpose:** Help users return to saved things at the right time.

**Layout and widgets:** Bottom sheet “Remind me”; sensible explicit date/time picker, optional repeat, timezone label, plain explanation before OS push permission. Show in-app reminders regardless of notification permission.

**Actions and navigation:** Primary: Save reminder. Secondary: Skip, edit, delete reminder. Push permission requested at moment of first opted-in reminder, not during onboarding.

**Important states:** If device denies notifications: reminder remains visible in app. DST/timezone changes handled. Push payload generic, not personal text.

**Three-pass adversarial critique:**

1. First-use: Asking notification access on first launch feels invasive—reject.
2. Scale: Avoid unsolicited suggestions or alert fatigue.
3. Trust: A user can see and change the exact reminder schedule.

**Final:** Explicit user schedule; silent by default. **Lead icon:** `bell` (Lucide-style outline, paired with a text label where functional).

### RB-19 — Profile, Settings & Privacy

**Purpose:** Keep control and privacy easy to locate without dominating discovery.

**Layout and widgets:** Profile/account top-right. Sections: Account, Sync & offline, Notifications, Appearance, Help/Feedback, Privacy & data. Clear buttons Export data, Delete account, Sign out; plain explanations of processing and hosted identity.

**Actions and navigation:** Primary: Make selected setting change. Destructive actions require reauthentication and final confirmation. Separate sign-out from account deletion.

**Important states:** Export is a tracked job with secure expiry; deletion records progress and revokes sessions. Cloud processing disclosure must update if future hosting changes.

**Three-pass adversarial critique:**

1. First-use: No compliance wall on first screen—keep concise links.
2. Scale: Settings must grow by sections, not clutter tab bar.
3. Trust: Transparent server processing—do not claim end-to-end encryption.

**Final:** Clear, unhidden control center with re-auth for sensitive actions. **Lead icon:** `settings` (Lucide-style outline, paired with a text label where functional).

### RB-20 — Offline / errors / reauthentication

**Purpose:** Ensure the app never gives fake success or loses captured content.

**Layout and widgets:** Reuse common components: blocking offline banner only where action unavailable; queued-save label in Recently Captured; draft recovery; inline retry; auth recovery; sync conflict sheet with server vs local versions; accessible action labels.

**Actions and navigation:** Primary: Retry or resolve conflict. Secondary: View local copy, discard only with confirmation. All failures retain source when permitted.

**Important states:** Sign-out with pending captures: offer keep locally for later sign-in or explicitly discard; never auto-sync another user’s queue. API offline does not remove cached memories without notice.

**Three-pass adversarial critique:**

1. First-use: A generic red “Something went wrong” does not help—state next safe action.
2. Scale: Repeated retries must be deduplicated and bounded.
3. Trust: No invisible data loss; protect account boundaries and unsent drafts.

**Final:** Human-readable recovery, not a technical debug screen. **Lead icon:** `cloud-off` (Lucide-style outline, paired with a text label where functional).
## 5 — Content → action eligibility specification

Action recommendation is a rule-based UX contract; implement with deterministic validation first, then optional local models. **Category alone never proves an action is eligible.** All extracted facts must retain source/field provenance.

| Content / evidence | Eligible suggestion | Gating requirements | Insufficient evidence fallback |
|---|---|---|---|
| Recipe text with ingredient list | Create shopping list | Explicit source ingredients; quantity only when present | Create blank list / Add your own ingredients |
| One confirmed venue or destination | Add to trip / Place shortlist | Verified name or user-supplied label, source URL | Save to collection / Ask to label place |
| Several saved destinations in intentional collection | Build itinerary | User selects included places and dates; no unverified hours | Build editable blank trip or shortlist |
| Tutorial/article/video link | Add to learning queue | Authenticated saved source; accessible original or link | Queue remains link-only; do not claim transcript |
| Any saved memory | Set reminder | User chooses date/time/permission | In-app reminder without push if declined |
| Text memory with unknown intent | None beyond generic | No guess from thin data | Add to collection / Star / Reminder |

### Recommendation logic

```text
on content_revision_finalized:
  evidence = parse_verified_fields(content_revision, provenance)
  category = conservative_classify(evidence)
  if user_overrode_category: preserve override
  candidates = []
  if verified_ingredient_list(evidence): candidates += [shopping_list]
  if verified_place(evidence) OR user_supplied_place(memory): candidates += [trip_shortlist]
  if tutorial_context(evidence) OR user_added_to_learning_collection: candidates += [learning_queue]
  candidates += [reminder]  # generic only; requires user date/time
  rank by explicit intent, context, not ad targeting
  display at most one primary suggestion; show source evidence before commitment
  NEVER run automatically; never synthesize absent facts
```

Data fields to add if not present: `content_coverage`, `source_kind`, `evidence[]` (`field`, `value`, `source_locator`, `provenance`, `confidence_bucket`), `classification[]` with provenance and manual lock, `action_eligibility` with disqualifying reasons. Those are a UX-to-API contract proposal, not current migration names.

## 6 — Theme and component system

### Visual identity

**Name:** *The Field Notebook*. Reading-list calm, editorial understatement, functional personal warmth. Primary visual rhythm: spacious header → efficient search → filter strip → compact saved rows. No generic glowing AI icon, excessive cards, decorative gradients or floating tooltips. Content thumbnails are real or replaced by purposeful format glyphs; use a single source's colors only as incidental thumbnail content.

| Role | Light | Dark | Notes |
|---|---|---|---|
| Background/paper | `#F6F4EC` | `#171E1A` | Warm neutral avoids sterile white |
| Elevated surface | `#FFFFFF` | `#222D26` | Mainly sheets, headers; avoid outlining every row |
| Primary ink | `#25392D` | `#F2F0E7` | High contrast text |
| Secondary ink | `#526359` | `#BCC9BE` | Metadata, captions |
| Deep forest/action | `#284D3B` | `#CFE0BA` | Buttons, active tab, links |
| Hairline separator | `#DEE3DA` | `#3B4A40` | Low-emphasis division |
| Muted accent | `#E1E9DA` | `#304638` | Selected chips, image fallback |
| Attention | `#9B622E` | `#E6B477` | Only action needed; pair with text |
| Danger | `#963E38` | `#F0A49D` | Destructive confirmation; never just a red icon |

**Typography:** Headlines editorial serif (`Georgia`/platform serif with deliberate letter-spacing) only at section titles; body native system sans for speed and readability. Avoid giant 42px H1 everywhere: 30–34px home heading, 24–28px detail heading, 15–16px body, 12–13px secondary. No serif on controls or small captions. Limit line length, dynamic-type safe, text must not truncate important save statuses.

**Spacing:** 4px base; screen gutter 20–24, row min-height 80–92, source thumbnails 56–64 square (real images crop only with visible source access), touch targets **at least 44×44dp**, corner radius 12–16 for surfaces and 22 for sheets. Use dividers rather than multiple nested card borders. Avoid heavy shadow; 0–1 shadow depth only for floating Save control.

**Motion:** One restrained save check (~150–250 ms), clear native sheet transitions, no moving cards when processing completes, no spring bounce for every interaction. Honor reduced-motion; success is understandable without animation. No ambient animated gradients or skeleton overdrive.

**Icon rule:** Use one coherent outline library (Lucide or native-mapped equivalents) with consistent stroke (~1.8–2), optical size 20–22. Never rely on icons alone for tab destination, destructive action or error state. Use accessible labels, meaningful source icons, not AI-themed sparkles as decoration. **Don't use magic-wand as app logo.**

### Reusable components

`AppHeader`, `SearchField`, `MemoryRow`, `RealMediaThumbnail`, `SourceLine`, `TopicChip`, `BottomNav`, `SaveFAB`, `QuietOutboxLink`, `MemoryToolbar`, `CoverageNotice`, `SourceEvidence`, `ActionSuggestion`, `CollectionRow`, `SourcePickerSheet`, `OrganizeSheet`, `ConfirmDelete`, `RetryBanner`, `EmptyState`, `ConflictResolver`, `PrivacyActionRow`.

**Shared MemoryRow:** thumbnail/fallback source glyph → title (max 2 lines) → actual source and saved date → optional one compact topic; star trailing. Tap body opens detail; long-press/overflow gives Archive, Organize, Delete. Do not put 3 action buttons below every row.

## 7 — User-journey walk-throughs: challenge and expected result

| Journey | Primary path | Stress test / counterexample | Design guarantee |
|---|---|---|---|
| Save Instagram reel | Share → RecallBox → durable confirmation → original app; later Library link-only or usable preview | Private reel has no accessible media | Original URL saved; no fake transcript or restaurant details |
| Save while offline | Share → local secure queue → confirmation “On this device” → return | User immediately opens Library | Recently Captured shows queue; item never quietly disappears |
| Article and search | Paste URL → verified extraction → Library → Search by topic → detail/source | Semantic model unavailable | Keyword search degrades gracefully; no invented match |
| Screenshot with text | Save image → OCR → image detail → search OCR text | OCR uncertain / rotated | Original remains viewable; OCR called partial/uncertain |
| Save food Reel | Share → link-only → optional collection | No ingredient evidence | Shopping list not suggested as extracted recipe |
| Verified recipe | Save public recipe → ingredients verified → detail → shopping list → edit | No quantity in source | Display “Not specified”, don't invent grams |
| Goa trip | Save multiple places → create “Goa” collection → add items → Trip shortlist | Unverified location/opening hours | Place details ask confirmation; no fake route or times |
| Learn Java | Save article → Search → add to learning queue → mark done | Source goes offline | Stored permitted extract/URL accessible with honest source notice |
| Wrong category | Save travel food article → topic suggested Food → user changes to Travel | Reprocessing reclassifies it | Manual override persists |
| Delete and sync | Delete memory on device A → device B reconnects | Old offline queue tries to resurrect | Tombstone/ownership rules prevent resurrection; confirm if unresolved |
| Switch users | Account A has unsent photo; sign out → Account B logs in | Local outbox belongs to A | No cross-account automatic upload or exposure |
| Change cloud host later | Identity and client unchanged; backend endpoint moves via secure config | User worries where memories live | Privacy disclosure updated; export/delete still work |

## 8 — Prototype vs release scope / delivery order

**Prototype-critical user journey** (not permission to skip hard privacy protections): RB-01, 02, 04, 06, 07, 08, 09; real text-note persistence; URL capture and source evidence; RB-05 truthful queue. Native share RB-03 and content-specific RB-10 follow the existing S3/S4 and upload slices. Present only real working paths in actual app.

**Complete release UX (all designed here):** RB-01 through RB-20, including native share from both platforms, offline queue, OCR, video, semantic retrieval, collections, contextual actions, reminders and privacy/data control. Do not merge the design completeness claim with implementation readiness.

**Suggested code handoff order:**

1. Use style tokens/components and preserve current login/note functionality; never replace working API with mock data.
2. Make authentication + Library + Note Detail reliable first.
3. Implement URL ingestion with actual safe processing and source coverage; stateful Recently Captured UI.
4. Native share/capture and offline outbox; image/PDF/video routes per existing product PRD.
5. Search and classification, manual overrides; collections.
6. Evidence-gated actions, reminders and privacy/export; finish both-platform accessibility and beta acceptance.

## 9 — Acceptance checklist for UX implementation

- [ ] All flow actions work with a real account and server; demo data only in **standalone prototype**, never in production app.
- [ ] Native share does not claim success before durable write.
- [ ] A captured item is always visible somewhere until user deletes it; pending not shown in main Library.
- [ ] Link-only usable result is represented honestly and can open original.
- [ ] No invented transcripts, summaries, ingredients, places, tags or search matches.
- [ ] Manual category/tag changes win over reprocessing; multiple collections supported.
- [ ] Compact list works at 0, 10, 1,000+ saves with predictable scroll/back.
- [ ] Search remembers query/filters and shows source-backed snippet, date and type.
- [ ] Contextual actions are explicit opt-in and have editable output and source attribution.
- [ ] Navigation has labelled tabs, actions aren't disguised as destinations.
- [ ] Dynamic type / dark mode / safe areas / screen reader / contrast / focus / reduced motion are device-tested.
- [ ] Sign-out/account switch does not leak device outbox, cached content or session.
- [ ] Export/delete/reminder permissions have clear confirmations and observable progress.
- [ ] Android hardware back and iOS native gesture behavior work through sheets, details and authentication callbacks.
- [ ] User study required before calling UX empirically validated: at least 5 first-time saves, 5 find-it-later tasks, mixed sources, one offline/error scenario; measure completion and misunderstandings.

## 10 — What's *not* final

This document is a **complete decision-ready UX design proposal**, but no actual user testing, real screenshots from native app for these proposed screens, React Native implementation of most designs, independent accessibility audit, or Auth0 completed login has been claimed. The standalone HTML accompanying this file is a **clickable simulation** for reviewing hierarchy and flows—its items/actions are illustrative, not persistent or connected to the RecallBox backend. A designer/engineer should retain the approved rules and validate the final visual execution on real Android/iOS hardware before calling product design shipped.
