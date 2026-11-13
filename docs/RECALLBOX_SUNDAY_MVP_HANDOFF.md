# RecallBox — Sunday local MVP operator handoff

**Branch:** `feat/recallbox-sunday-mvp-20261115` · **Draft PR:** #3  
**Date:** 13 November 2026 · **Status:** Code committed for review. **No real authenticated end-to-end acceptance yet.**

## Scope in this branch

- Preserve S1 Auth0/OIDC PKCE authentication and S2 private notes, versioned edits, archive/star, signed sync and row-level ownership.
- Add a typed **link** memory using the existing durable create/retry, owner, revision and sync lifecycle. The original HTTP(S) URL is stored as `content`; no server-side fetching, extraction, scraping, previews, OCR, transcription or semantic classification.
- Add `GET /v1/search?q=...` for **literal, case-insensitive keyword** matches against saved title and note/URL content, scoped to the signed-in owner. The response contains at most 50 newest matches and `has_more`; this is **not semantic search**, and there is no server-side pagination for search yet.
- Add native Expo save choice, Save Link and Search screens; open original HTTP(S) links with the device's URL handler. Keep the warm paper/forest editorial style from the 8 November UX blueprint; no invented results or unsupported feature navigation.

## Critical migration gate

Existing local product DB is at `0002_memories`. The new product API **requires** `0003_bookmark_links` at startup, and correctly refuses older schemas. This migration preserves notes and all existing S1/S2 data, and changes the `memories.kind` check to allow `note` and `link`.

On your Mac, **do not overwrite local uncommitted work**. Before checking out a feature branch, run `git status --short` and review any changes. Back up your local database before schema changes, then:

```sh
cd /Users/akshat/Desktop/RecallBox
git status --short
git fetch origin
git switch --track origin/feat/recallbox-sunday-mvp-20261115
# If the branch already exists locally: git switch feat/recallbox-sunday-mvp-20261115

# Start the existing native local database if stopped.
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/recallbox-pg17 -l /opt/homebrew/var/recallbox-pg17/server.log status
# If stopped:
# /opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/recallbox-pg17 -l /opt/homebrew/var/recallbox-pg17/server.log start

# In a shell dedicated to migration: no secrets copied to stdout or into Git.
source "$HOME/.config/recallbox/migration.env"
.venv/bin/alembic upgrade head
unset RECALLBOX_MIGRATION_URL
```

Start the product API in one terminal (keep it loopback-only):

```sh
cd /Users/akshat/Desktop/RecallBox
source "$HOME/.config/recallbox/runtime.env"
source "$HOME/.config/recallbox/oidc.env"
unset RECALLBOX_MIGRATION_URL
.venv/bin/recallbox-api
```

In another terminal, check local health, mobile deps and TypeScript:

```sh
curl -fsS http://127.0.0.1:8001/v1/health
cd /Users/akshat/Desktop/RecallBox/apps/mobile
npm ci
npm run typecheck
npm start -- --max-workers 2
```

For the existing Android emulator and debug build, reuse the documented SDK/JDK and cached debug APK steps in `docs/RECALLBOX_S2_IMPLEMENTATION.md`. If JS/TS-only files have changed since that build, reload Metro; if a native build is incompatible, rebuild from the branch with the original Gradle memory limits. The API still listens only on `127.0.0.1:8001`; use approved `adb reverse` mappings for emulator connections, not a public tunnel.

## Manual smoke matrix — do not mark passed without observed evidence

| # | Operator action | Expected result |
|---|---|---|
| 1 | Open Android development build, complete **real Auth0 login** | Native callback returns to signed-in account and private Library; never synthetic identity |
| 2 | Tap **Save something → Write a note**; save a real note | Server-durable note visible in Library; editing/title changes persist |
| 3 | Tap **Save something → Paste a link**; save `https://example.com` (and optional title) | Distinct saved-link memory appears; source is stored, not scraped |
| 4 | Open the saved link detail; tap **Open original link** | Device opens the supplied HTTP(S) source |
| 5 | Search `example.com` and a unique word from the note | Both return as appropriate via literal keyword search; no AI/semantic claim |
| 6 | Attempt to save `javascript:alert(1)`, a URL containing credentials, or malformed content | API rejects; no link memory created |
| 7 | Star, archive, edit title, delete and refresh; relaunch app and API | Durable state and sync match changes; deleted items remain hidden |
| 8 | Sign out; sign back into original account; sign into another test account | Unauthenticated pages cannot show private data; account B cannot access account A notes, links or search |
| 9 | Try offline/network failure during a save | UI says save is not confirmed and supports retry with the same idempotency key; no fabricated checkmark |

Capture **PASS / FAIL / BLOCKED** per step with actual Git SHA, app version, emulator/device/OS and sanitized observations. Do not capture identity credentials, bearer tokens, private links or user note content in public PR logs.

## Known blockers and scope boundaries

- Auth0 native browser return, full signed-in note CRUD and cross-account access still need **real local device testing**. Reaching the browser alone is not successful authentication.
- `0003_bookmark_links` has not been run on the owner's Mac by a remote GitHub edit. **Do not claim a live migration occurred.**
- Search is literal keyword matching, returning at most the 50 newest results; no embeddings, model, search ranking, categorization or semantic memory lookup.
- Saving a URL stores an original link only; no SSRF-exposed worker or remote scraping endpoint is introduced.
- No real device APK build, Expo typecheck, authenticated service smoke, migration, iOS release acceptance, security audit, backup restore, public hosting or full production validation has been performed by this GitHub-only task.
- Existing extractor and benchmark modules are unchanged. This feature branch is a **local beta prototype** only.

## Design authority and remaining screens

User's Library `RecallBox_Final_UX_Blueprint.md` and `RecallBox Final Claude Design.html` are the UX references. Owner-approved decisions include instant native share confirmation (when implemented), automatic organization with user override (later), evidence-grounded opt-in actions (later), and separating processing saves from finalized Library memories. The proposed three-tab Library / Search / Collections structure is **not** represented as already implemented; only working destinations are visible in this slice.
