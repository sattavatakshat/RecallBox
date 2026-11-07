# RecallBox — planned consumer application

**Status: product vision, not a shipped part of Universal URL Extractor.**

> Save it once. Find it when it matters. Put it to use.

## Problem

People save useful links, articles, PDFs, screenshots, recipes, tutorials, and travel inspiration across many apps. Weeks later, remembering *where* an item was saved is often harder than remembering *what it was about*.

RecallBox proposes a standalone personal-memory library that helps people retrieve their own saved material through natural language and convert relevant items into useful next steps.

Examples of desired future queries:

- “Where was that vegetarian restaurant I saved in Bandra?”
- “Find the Java concurrency tutorial I bookmarked.”
- “Which Goa destinations did I save for a future trip?”

These are **product goals**, not currently deployed features.

## Proposed user experience

1. **Capture:** Explicitly save a URL, file, screenshot, or note into the user's own library.
2. **Understand what is actually available:** Extract permitted page text or metadata, record provenance, and say clearly when only a preview is available.
3. **Organize:** Store user-owned items with provenance, deduplicate where safe, and prepare them for search.
4. **Retrieve:** Search personal items with natural-language queries and show the original source.
5. **Act, with permission:** Turn saved items into a reading queue, travel shortlist, or recipe plan.

An MVP should prioritize **capture -> trustworthy extraction -> retrieval** before expansive automation.

## How the two projects connect

```text
RecallBox (future independent app)
  Capture & permissions
       |
       v
Universal URL Extractor (existing independent framework)
  Extraction / metadata / source provenance
       |
       v
RecallBox (future app services)
  Personal storage -> search -> opt-in actions
```

Universal URL Extractor is *one possible ingestion component*, not the RecallBox product. It should have no dependency on RecallBox accounts, UI, business logic, or personal data model.

## Important limitations

- Saving an Instagram, YouTube, or other social link does not grant access to the underlying media.
- Link and public-preview metadata must never be mislabeled as complete audio/video understanding.
- OCR and transcription should run only on appropriately authorized material, with explicit statuses and user controls.
- User content should not be automatically uploaded to third-party APIs; any such processing must be opt-in and clearly disclosed.
- Respect website terms, copyright, access restrictions, and deletion/privacy requirements.
- The first version should be intentionally narrow rather than claiming to handle every possible source perfectly.

## Open-source strategy

The extraction and benchmark framework is open-source infrastructure under Apache-2.0. A future RecallBox application may be developed and released separately, with its own licensing and product decisions. Publishing the extractor does **not** mean a complete RecallBox app is already open source or available.

## First useful vertical slice (planned)

A single user can add a public article URL, see whether real content or only metadata was extracted, find it later by a simple query, and reopen the cited source. Measure whether capture and retrieval actually work before adding automated actions or broader platform integrations.
