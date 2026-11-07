# S2 implementation and manual verification

## Auth0 MCP activation follow-up — 7 November 2026

This update supersedes earlier claims below that no real provider/clients are
configured. Real-account login and authenticated memory acceptance are still
pending; provider provisioning and backend startup have now passed.

Used the already-installed **Auth0 MCP 0.1.0-beta.19**, authenticated through its
existing system Keychain session. Its tools were not exposed directly in this
chat, so connected to the installed stdio server through the official MCP client
SDK. No management token was printed, copied into the product, or committed.
Listed existing applications first (only Default App / All Applications existed),
then invoked **auth0_onboarding** for the generated Android project and completed
the required **auth0_get_quickstart_guide** step. The returned native Kotlin SDK
sample was not substituted for the existing Expo PKCE implementation.

Created/configured real clients in `dev-yv4v5wsrtm1158mz.us.auth0.com`:

| Platform | Client ID | Type / token endpoint authentication |
| --- | --- | --- |
| Android | `ljbYENikqVCwL0oZG6kfLAGM6qlUdZEd` | Native / none |
| iOS | `nMgGLNVKLuK0jYUVKU7w1IHft8sjR7tl` | Native / none |

Both clients use only `authorization_code`, OIDC-conformant RS256 ID tokens with
a 3,600-second lifetime, and exact callback `app.recallbox.mobile://auth/callback`.
Android package metadata is `app.recallbox.mobile`. The MCP quickstart initially
registered its Auth0 Android SDK-style callback and automatically enabled
`skip_non_verifiable_callback_uri_confirmation_prompt`; replaced the callback
with RecallBox's Expo URI and explicitly set that flag **false** on both clients,
retaining the custom-scheme confirmation. Provider logout URLs are empty because
the current app revokes its own RecallBox session, not the provider browser SSO.
Client secrets in MCP responses are redacted and unused by these public clients.

Ran `scripts/configure_local_auth0.py` with those real IDs. HTTPS discovery passed;
wrote mode-0600 `~/.config/recallbox/oidc.env` and Git-ignored
`apps/mobile/.env.local`. Existing database/signing secrets remain outside Git.
No environment-file contents or secret values were echoed.

Actual live activation evidence:

- Backend completed its PostgreSQL lifespan and listened at `127.0.0.1:8001`.
- Real HTTP `/v1/health` returned **200** with only `status: ok`; unauthenticated
  `/v1/me` returned **401 authentication_required**.
- Product PostgreSQL and API listeners remained loopback-only; the task's Metro
  instance listens on `127.0.0.1:8081`, reached through ADB reverse.
- The first native sign-in failed at discovery. Expo 58's discovery helper
  directly appends `/.well-known/openid-configuration`; Auth0's canonical issuer
  includes a trailing slash. Real HTTP confirmed the resulting double-slash URL
  returned **404/non-JSON**, while the single-slash URL returned **200/JSON**.
- Fixed only mobile discovery URL construction by trimming trailing slashes at
  that call. The backend keeps the exact canonical issuer for ID-token validation.
  Temporary stage-only diagnostics were removed. `npm run typecheck` passed.
- After reload, native sign-in successfully handed off to Chrome's first-run
  activity. Browser/account entry was handed to the operator. No real accepted
  login, token refresh/logout, Inbox/note operations, or two-account isolation is
  claimed from browser handoff alone.

The existing lifecycle commands below now have their real OIDC configuration
available. At handoff, the backend, local Metro, and visible emulator remain
running so the operator can finish browser setup/login without losing PKCE state.
Do not reload or edit the sign-in component during that attempt. Full iOS build,
cold callback lifecycle, real accounts, and S1/S2 acceptance remain open gates.

7 November 2026, Asia/Kolkata. Baseline: requested main merge `3005dec`.
**S2 code is implemented; S2.5 PostgreSQL setup passed; real provider/device
acceptance is BLOCKED.** No real authentication or cross-device success is claimed.

## S2.5 operational run — 7 November 2026

This section supersedes the host/database status and checkout instructions below,
which describe the original S2 implementation session. The active checkout is now
`/Users/akshat/Desktop/RecallBox`, branch `main`, initially clean at `5d5e9ed4`.
S1/S2 end-to-end acceptance remains blocked by real identity-provider setup and
native-device verification. No fake account, accepted synthetic identity, public
listener or tunnel was introduced. No automated test cases were added/modified,
and no test suite was run.

### Completed host/database operations

The operator explicitly approved native PostgreSQL 17 + pgvector installation.
Installed PostgreSQL **17.11**, verified Mach-O **arm64**, and pgvector **0.8.7**.
Homebrew encountered an already-linked certificate dependency (retry proceeded),
then failed its PostgreSQL post-install/service step with `unknown install step:
link_dir` / missing `stop_timeout`. The binaries were intact. Completed the
missing directory links from the installed PostgreSQL keg into
`/opt/homebrew/share/postgresql@17` and `/opt/homebrew/lib/postgresql@17`, without
overwriting files. This is a local workaround, not a repaired Homebrew runner;
review package links after any future PostgreSQL upgrade. No launch agent was
registered. Homebrew also emitted an unexpanded certificate-link placeholder in
the checkout; only that newly created broken symlink/empty directory was removed.
No CA trust/security settings were changed. OpenSSL 4's default certificate link
still needs Homebrew maintenance before using that CLI for remote TLS; the local
database does not depend on it. Existing OpenSSL 3 files were retained.

Initialized a separate checksummed cluster at `/opt/homebrew/var/recallbox-pg17`:
loopback `127.0.0.1:5432`, private mode-0700 socket directory, peer local admin,
SCRAM TCP authentication, 128 MB shared buffers, 12 connections, 4 MB work memory,
32 MB maintenance memory, UTC. SQL/parameter statement logging is disabled.
Created only the dedicated `recallbox` database and existing migrator/API roles,
ran `scripts/product_roles.sql`, then applied Alembic through `0002_memories`.
Random database passwords and signing key are outside Git in mode-0600 files
under mode-0700 `~/.config/recallbox/`: `migration.env` and `runtime.env`.
Migration credentials are not loaded by the backend command.

Actual manual PostgreSQL evidence:

- Runtime `recallbox.db.connect()` readiness passed; pool limits are 1–3.
- All eight owned tables belong to the migrator and have ENABLE + FORCE RLS;
  all 16 policies exist. Both roles are non-superuser/non-BYPASSRLS, with no
  CREATEDB/CREATEROLE/INHERIT. Runtime has no schema CREATE or migrator membership.
- Ownerless reads returned zero rows; ownerless insert, CREATE and TRUNCATE were
  rejected. DELETE/TRUNCATE privileges are absent on all eight owned tables.
- All constraints are validated and all indexes ready/valid. Catalog inspection
  confirmed 12 foreign keys, including composite ownership FKs for sessions,
  revisions, retry responses and sync revision references.
- Both SECURITY DEFINER functions have fixed search paths and EXECUTE limited
  to migrator/API, with no PUBLIC grant.
- Transaction-local owner context cleared after both commit and rollback;
  all three simultaneously acquired pooled connections had no residual context.
- Graceful stop, offline `pg_checksums --check`, and restart succeeded:
  1,292 files / 3,888 blocks scanned, **0 bad checksums**. Migration version
  `0002_memories` persisted. This is schema persistence evidence, not note evidence.
- Zero accounts/sessions/memories were seeded. No extractor or benchmark files
  changed, and no extractor SQLite database was opened or migrated.

### Real authentication remains an external dependency

Selected Auth0's free hosted offering using native public clients and S256 PKCE:
[flow documentation](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce),
[application settings](https://auth0.com/docs/get-started/applications/application-settings),
[current plan](https://auth0.com/pricing). The operator requested preparation for
a new tenant; no tenant/client/account credentials have been supplied.

Operator action: create a free tenant and two Native applications named
`RecallBox iOS` / `RecallBox Android`. Both use token endpoint authentication
`None`, authorization code flow, RS256, and exact allowed callback
`app.recallbox.mobile://auth/callback`. Enable the same database connection for
both clients and create two real beta accounts. Leave social providers disabled
until their separate release requirements are satisfied. Do not copy a client
secret into the app or backend. A controlled domain is unnecessary for this
local custom-scheme beta; verified HTTPS app links remain a release gate.

After registration, configure the real public IDs (substitute actual values):

```sh
cd /Users/akshat/Desktop/RecallBox
.venv/bin/python scripts/configure_local_auth0.py \
  --domain YOUR_TENANT.us.auth0.com \
  --ios-client-id YOUR_REAL_IOS_CLIENT_ID \
  --android-client-id YOUR_REAL_ANDROID_CLIENT_ID
```

The helper verifies HTTPS discovery, exact issuer/endpoints, RS256, S256 and
public-client support, then writes private `~/.config/recallbox/oidc.env` and
ignored `apps/mobile/.env.local`. It refuses to overwrite existing configuration.
It does not register clients or claim their dashboard settings are verified.
Manual helper checks: syntax/help passed; non-Auth0 domain was rejected before
network or file access. Live discovery/configuration awaits the actual tenant.

The actual backend startup currently fails closed with
`RECALLBOX_OIDC_PROVIDERS must be configured`; there is no API listener on 8001.
Real login/refresh/logout/reuse revocation, all authenticated note operations,
note persistence across backend restart, idempotency/conflicts/cursor sync and
two-account isolation remain **UNVERIFIED**, pending real provider setup.

### Exact local lifecycle commands

Start/stop the dedicated database (do not use `brew services start`):

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/recallbox-pg17 -l /opt/homebrew/var/recallbox-pg17/server.log start
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/recallbox-pg17 status
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/recallbox-pg17 stop -m fast
```

After real OIDC configuration, start the backend in its own terminal:

```sh
cd /Users/akshat/Desktop/RecallBox
source "$HOME/.config/recallbox/runtime.env"
source "$HOME/.config/recallbox/oidc.env"
unset RECALLBOX_MIGRATION_URL
.venv/bin/recallbox-api
# Stop: Ctrl-C in this terminal. Fixed bind: 127.0.0.1:8001.
```

Start Metro in another terminal after configuring mobile:

```sh
cd /Users/akshat/Desktop/RecallBox/apps/mobile
npm start -- --max-workers 2
# Stop: Ctrl-C in this terminal. Localhost only; no tunnel.
```

For Android builds, set the existing JDK/SDK explicitly:

```sh
export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
cd /Users/akshat/Desktop/RecallBox/apps/mobile
npm run android -- --device
# After a device is connected, for the loopback API and Metro:
adb reverse tcp:8001 tcp:8001
adb reverse tcp:8081 tcp:8081
```

iOS build command remains `npm run ios`, but full compatible Xcode and signing
are absent; `xcodebuild -version` and `xcrun simctl` failed under CommandLineTools.
A physical iPhone also needs a secure local connection path; the API bind must
remain loopback. Android debug uses the generated debug-only cleartext permission
for loopback/USB reverse; no release network permission bypass was added.

### Mobile execution and remaining gates

`npm run typecheck` and `CI=1 npx expo prebuild --platform android --no-install`
passed. Generated native files remain ignored. Expo's incidental tsconfig rewrite
was restored to its original contents. Metro actually started with
`CI=1 EXPO_NO_TELEMETRY=1 npx expo start --dev-client --localhost --max-workers 2`;
`GET http://127.0.0.1:8081/status` returned `packager-status:running`, and `lsof`
confirmed a **127.0.0.1-only** listener. Metro was stopped after verification;
no backend or Metro process remains running.

ADB worked outside sandbox restrictions; **no physical device** was connected.
After the operator explicitly approved the missing Android packages and online
build dependencies, installed **Platform 37.0 revision 2** and **Build Tools
37.0.0**. Existing SDKs and the ARM64 `Medium_Phone_API_36.1` image were retained.
Android Studio's bundled ARM64 JDK **21.0.9** is usable (the shell's default Java
discovery instead reports Java 8). The build uses compile SDK **37**, target SDK
**36**, min SDK **24**, existing NDK **27.1.12297006**, and Gradle **9.4.1**.
`aapt2 version` and installed package metadata verified the new tooling.

The actual ARM64 debug build command was:

```sh
cd /Users/akshat/Desktop/RecallBox/apps/mobile/android
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
ANDROID_HOME=/Users/akshat/Library/Android/sdk \
./gradlew :app:assembleDebug --no-daemon --max-workers=2 \
  -PreactNativeArchitectures=arm64-v8a \
  -Dorg.gradle.jvmargs='-Xmx1536m -XX:MaxMetaspaceSize=512m' \
  -Dorg.gradle.parallel=false --console=plain
```

The earlier offline attempt stopped on uncached Foojay plugin 1.0.0. The approved
online attempt resolved it and **BUILD SUCCESSFUL in 41m 36s**, with **463 tasks
executed**. Much of the first build involved dependency downloads, including
React Native's 275 MiB and Hermes' 112 MiB debug archives. Existing pinned npm
versions/lockfile and application source were unchanged. Gradle/AGP/native modules
emit deprecation warnings; no dependency downgrade or node_modules patch was used.

APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, approximately
**87 MiB**, package `app.recallbox.mobile`, version `0.1.0`, **arm64-v8a** only.
SHA-256: `b506b481db1ace1d3f3a37d74504832cd980c33b68239a16aa7e8c43c90dc8e5`.
Debug signing passed; this is not a release-signed artifact.

Booted the existing emulator without loading/saving snapshots or wiping data.
Android enforced **2 GiB guest RAM** despite an initial 1.5 GiB request. Stopped it
during dependency downloads to reduce memory pressure, then restarted for launch.
`adb install -r` returned **Success**. Android reported a successful cold launch
of `.MainActivity`; Metro bundled **1,322 modules**. The server was started in
watch mode with `EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:8001 npx
expo start --dev-client --localhost --max-workers 2`. Its listener was verified
as `127.0.0.1:8081`. ADB reverse mappings for 8081 and 8001 were verified. The
product API remains stopped awaiting OIDC; API connectivity success is not claimed.

Actual native UI evidence, inspected screenshots and UI hierarchy:

- Welcome renders and its primary button opens sign-in.
- Sign-in displays the provider-setup message; the actual sign-in button is
  disabled while real public client configuration is absent.
- With JavaScript fully loaded, the native custom-scheme callback opens the safe
  recovery screen; Continue returns to sign-in without creating a session.
- A signed-out `app.recallbox.mobile://new` deep link redirects to sign-in.
- **Limitation:** a cold custom-scheme callback opens Expo's development launcher,
  not the recovery route. Sending a second link while a runtime was still starting
  also triggered Expo's `App react context shouldn't be created before` exception.
  The warm probe was repeated after confirming load and passed. No upstream patch
  was applied; cold/startup-race behavior and real provider callbacks remain gates.

Private, Git-ignored screenshot evidence is under `beta-evidence/s25-android/`:
`welcome.png`, `sign-in.png`, `cold-callback.png`, `warm-callback.png`, and
`protected-route.png`. Inbox navigation, real note creation/editing, secure session
restoration, real provider/browser return, physical-device access and release/iOS
signing remain **unverified**. No real authenticated account is available yet.

To start the existing emulator visibly, use a separate terminal:

```sh
"$HOME/Library/Android/sdk/emulator/emulator" -avd Medium_Phone_API_36.1 \
  -no-snapshot-load -no-snapshot-save -memory 2048 -cores 2 -no-audio
```

With Metro running using the earlier command and the emulator booted, install/open
the cached APK from another terminal (set the JDK/SDK/PATH as above):

```sh
cd /Users/akshat/Desktop/RecallBox
adb -s emulator-5554 install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 reverse tcp:8001 tcp:8001
adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW \
  -d 'exp+recallbox://?__expo_url=http%3A%2F%2F127.0.0.1%3A8081' app.recallbox.mobile
# Stop only RecallBox:
adb -s emulator-5554 shell am force-stop app.recallbox.mobile
# Stop this emulator:
adb -s emulator-5554 emu kill
```

The exact build/run above was verified; do not substitute a bare custom-scheme
cold launch for the development-client Metro URL. Metro and emulator were stopped
after screenshots were saved, to free RAM while real identity setup is pending.

### Resource measurements and S3 decision

Mac M2 ARM64, **8 GiB RAM**. Initial free disk was approximately **18 GiB**;
final reading approximately **13 GiB**, below the repository's 30 GiB pilot gate.
Other host activity may contribute to this change. Final memory-pressure report:
65% system-wide free percentage, about **2.42 GiB swap used**. During the emulator
boot swap peaked around 2.8 GiB; stopping the emulator during downloads improved
available memory. PostgreSQL's initial idle process RSS totaled approximately
**35 MiB** (RSS includes shared pages and changes with residency; it is not an
exclusive memory accounting). Cluster occupies **63 MiB**, dedicated DB
approximately **8.2 MiB**. No emulator or Gradle build remains running.

Safe remediation candidates for operator review: Homebrew cache approximately
900 MiB, Gradle directory now approximately 4.0 GiB, and unused Android SDK
components within 7.9 GiB. Generated Android output occupies 1.3 GiB and native
build output under node_modules increases that directory to 1.8 GiB. Review
`brew cleanup -n` before any cleanup; remove
only intentionally selected unused SDKs/images through Android Studio's SDK
Manager. Cache removal requires redownloads and will not alone necessarily reach
30 GiB. Move selected personal data to external storage only with explicit owner
approval. No manual cache cleanup or personal-file/existing-SDK deletion was
performed, and no Xcode, security-setting
change, container, model, public API exposure or Cloudflare Tunnel was introduced.

Final state: dedicated loopback PostgreSQL is running; product API and Metro are
stopped. **S3 should not begin as an accepted operational baseline yet.** Complete
the real Auth0 setup, callback lifecycle verification, native login and real
two-account note/session/sync acceptance before advancing. The structural DB
checks above do not replace any of those real-account checks.

## Location and commits

Branch: `feat/s2-memories-sync`. Implementation worktree:
`/tmp/recallbox-s2-worktree`.

The primary checkout changed concurrently from the S2 branch to older local main,
and dependency files were staged there. Work continued in an isolated worktree;
that checkout/index was not reset, unstaged, merged or overwritten. Three unchanged
untracked source copies created by this session during the checkout change were
removed after their committed worktree copies were verified byte-for-byte. S2
commits remain durable in the repository even if the temporary worktree is removed.
Open the worktree in the IDE to review/run S2; the primary checkout is not S2.
Do not blindly switch its branch while unrelated staged work remains.

Implementation commits:

- `a67613b7`: additive database migration and runtime readiness checks.
- `edf35e51`: private note CRUD, revisions, optimistic writes and durable creation retries.
- `22918020`: signed, account-bound incremental sync and API contract.
- `24bd392b`: mobile inbox, creation/detail, conflict handling and sync client.
- The final verification commit contains this guide, README linkage and a
  cancellation-handling fix for a queued sync when its account provider unmounts.

Nothing was pushed or deployed by this task. No host database packages, services,
security settings, public tunnel, paid API or ML integration were installed/enabled.

## Functionality implemented

Migration `0002_memories` adds memories, immutable memory_revisions, durable
idempotency_keys and sync_changes. Existing users gain sync_epoch/sync_floor.
Composite FKs enforce ownership, all four new tables have forced RLS, and runtime
has no DELETE/TRUNCATE/DDL or update access to revisions/events/retry records.
A stateless cursor contract does not require device acknowledgements, so no
unused device_sync_state table was introduced. S1/benchmark SQLite is unchanged.

Authenticated API routes create/list/read/edit/delete plain notes and sync changes.
Every write rechecks the existing session while holding the user's row lock. The
same transaction commits the note, revision, per-user counter, event and (on
create) retry record. Stale edits/deletes return an owned conflict response;
foreign/deleted IDs cannot be read. Idempotent creation retries return the original
result, detect changed bodies and do not resurrect deleted notes. Lists paginate
recent-first with signed account/filter/snapshot anchors. Sync has replay,
pagination, tombstones and cursor expiry/epoch/floor handling. See the exact
[API and consistency contract](RECALLBOX_S2_API.md).

Mobile now opens the private Inbox after sign-in. It includes recent note cards,
empty/error/loading states, pagination, pull-to-refresh, real star/archive actions,
an archive view and account navigation. Creation shows persistence confirmation
only after the API returns a committed result. A request's UUID/key/body are frozen
when an ambiguous save fails, so retry sends the same intent. Editing and deletion
use expected versions; conflicts show the current server note alongside the local
draft, with explicit merge-base/replace choices. Leaving a dirty draft warns first.
Deletion requires confirmation. No memory content is written to disk in S2; drafts
are in-memory and do not survive process death or deliberate discard.

The existing S1 OIDC/session flow is reused. Its client now exposes an authorized
operation wrapper, ignores stale account responses, guards refresh completion
across account changes and reuses the existing single-flight refresh. Foreground
session restoration keeps authenticated navigation mounted so it cannot erase an
editor draft. A keyed authenticated memory provider clears all cached summaries,
cursors and queued work on logout/account change. Sync runs on inbox focus,
foreground and every 15 seconds while active. List/sync/local-write requests are
serialized to avoid stale response overwrites; summaries merge monotonically by
version. Expired cursors rebuild the inbox without replacing editor drafts.

## Host and external blockers

- PostgreSQL server, psql, pg_ctl and pg_config were absent from PATH; no installed
  PostgreSQL/pgvector Homebrew opt/Cellar entries or Postgres.app were found.
  Installing a supported native ARM64 PostgreSQL and its matching pgvector build,
  then provisioning a loopback service/database/roles, is required. Those are host
  package/service changes and were reported before proceeding; not performed.
- No RECALLBOX provider/database environment configuration was supplied. A real
  provider and public native client IDs/redirects remain required. No credentials,
  synthetic login endpoint or accepted fake identity were introduced.
- Approximately 17 GiB free disk remains below the existing 30 GiB pilot gate.
  No models, containers, OCR/browser services or large native toolchain downloads.
- xcode-select still points to CommandLineTools rather than full Xcode. No
  physical-device access/native build or actual Google/Apple login was verified.
  S1 Apple/Google compatibility/link-ownership and npm advisory gates remain open.

## Manual checks actually performed

No automated test files were written/modified and no test suite was run. Negative
HTTP probes used in-process ASGI without lifespan and ephemeral unprovisioned
identity configuration solely to inspect failure behavior. They did not issue an
accepted login/session or substitute for a database. Cursor checks are component
checks, not authenticated cross-account data acceptance.

| Check | Outcome |
| --- | --- |
| Requested baseline | Fetched origin/main at 3005dec before creating S2 branch |
| Python syntax/imports | Product modules and both migrations parse; note model imports succeed |
| Alembic history | 0001_s1 → 0002_memories resolves as a single additive head |
| SQL generation | Fresh full migration and S1→S2 offline SQL generated successfully; not executed |
| Auth boundary | All six S2 method/path combinations return 401 without authentication |
| Private API boundary | /docs and /v1/benchmark return 404; universal_extractor absent from sys.modules |
| Minimal health | In-process /v1/health 200, only status=ok; no readiness claim |
| Input validation | Blank note, owner injection, explicit null edit, empty patch and boolean version rejected |
| Request byte limits | Auth POST >16 KiB rejected 413; memory POST/PATCH >256 KiB rejected 413 |
| Cursor helpers | Valid roundtrip; cross-account, tamper and wrong-purpose rejected 400; expiry/epoch change rejected 410 |
| Real lifespan with closed local DB port | Startup refused rather than using fallback storage |
| Mobile TypeScript | npm run typecheck PASS |
| Android JavaScript export | Metro/Hermes bundle PASS; no native installation/launch claim |
| iOS JavaScript export | Metro/Hermes bundle PASS; source map confirms all S2 routes/store were included |
| Benchmark preservation | No diff under src/universal_extractor or benchmarks against 3005dec |
| Git whitespace | git diff --check PASS |

Native dependency versions/lockfile remain those of S1; no new dependencies were
added. Existing JavaScript dependencies were reused locally by a temporary ignored
symlink for typecheck/bundling, then the symlink was removed. Exported bundles and
source maps are temporary verification artifacts outside Git, not release builds.

### Acceptance requiring real PostgreSQL and authenticated sessions

All following checks remain **BLOCKED**, with no successful synthetic substitutes:

1. Fresh S1 migration, seeded S1→S2 upgrade, pgvector readiness and runtime grant audit.
2. Start a ready product API at 127.0.0.1:8001 with actual DB/provider configuration.
3. Create a note; restart API; retrieve identical persisted note.
4. Edit/star/archive; confirm revision + sync event commit; stale PATCH/DELETE gives 409.
5. Concurrent identical create retries yield one note/revision/event; mismatched body 409.
6. Actual keyset list pages, concurrent page mutations and sync reconciliation.
7. Delete; list/detail suppression; replay only content-free tombstones; retry cannot resurrect.
8. A/B adversarial probes across all methods, SQL RLS/ownership FKs and pooled context reset.
9. Sync replay/pagination/high-water, cross-account cursors over HTTP and expired-cursor recovery.
10. Concurrent user transactions/rollback demonstrate commit-safe sequence behavior.
11. Two-device foreground sync, draft preservation/conflict merge and logout/account-switch isolation.
12. Native builds, screen visual/accessibility QA and real secure session persistence on both platforms.

## Exact local commands

After approved PostgreSQL/pgvector installation, use the
[S1 setup guide](RECALLBOX_S1_IMPLEMENTATION.md) to provision the dedicated database,
roles, extension and real OIDC clients. Do not run role bootstrap again against an
existing populated DB. S2 does not relax S1's credential validation. Keep migration
credentials outside the API process and both files outside Git, mode 0600.

For an independent environment in this worktree:

```sh
cd /tmp/recallbox-s2-worktree
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-product.lock
uv pip install --python .venv/bin/python --no-deps -e .
# Inject only RECALLBOX_MIGRATION_URL from the private migration environment.
.venv/bin/alembic upgrade head
unset RECALLBOX_MIGRATION_URL
# Inject real API configuration from a separate private environment.
.venv/bin/recallbox-api
```

The product CLI binds 127.0.0.1:8001, one worker, 1–3 pool connections. To use the
already-installed Python runtime during local worktree development instead:

```sh
cd /tmp/recallbox-s2-worktree
PYTHONPATH="$PWD/src" /Users/akshat/Desktop/RecallBox/.venv/bin/python -m uvicorn recallbox.app:create_app --factory --host 127.0.0.1 --port 8001 --workers 1 --no-access-log --no-proxy-headers
```

Both startup alternatives still require a real migrated DB and provider config.
No successful listener startup was claimed in this environment.

```sh
cd /tmp/recallbox-s2-worktree/apps/mobile
npm ci
# Configure real public provider/client/API variables in .env.local.
npm run typecheck
npm run ios           # requires full compatible Xcode, signing/device
npm run android       # requires compatible SDK/JDK and connected device
npm start             # localhost development-client Metro; no public tunnel
```

Do not change the API bind to solve phone connectivity. Use the existing S1
approved local-device connection requirements; real iPhone access still needs an
approved secure path. No release cleartext-network bypass is added.

## File manifest

Created:

```text
migrations/versions/0002_memories.py
src/recallbox/cursors.py
src/recallbox/memories.py
src/recallbox/problems.py
src/recallbox/sync.py
apps/mobile/src/memories.tsx
apps/mobile/app/(account)/account.tsx
apps/mobile/app/(account)/new.tsx
apps/mobile/app/(account)/memory/[id].tsx
docs/RECALLBOX_S2_API.md
docs/RECALLBOX_S2_IMPLEMENTATION.md
```

Modified: src/recallbox/app.py, src/recallbox/db.py,
apps/mobile/src/api.ts, apps/mobile/src/session.tsx, apps/mobile/src/ui.tsx,
apps/mobile/app/(account)/_layout.tsx, apps/mobile/app/(account)/index.tsx, README.md.
The old account screen is now account.tsx and the group's index is the Inbox.
No extractor, private SQLite, benchmark, automated test or dependency-lock changes.

## Remaining limits

S1 and S2 acceptance remain blocked until the listed live checks pass. Server
soft-deleted text/revisions and retry/sync rows are retained in S2; physical purge
and deletion/backup semantics still belong to the later privacy slice. A future
retention task must advance sync_floor transactionally before pruning an event
prefix, retain agreed tombstones, and rotate epoch after restore. No unbounded
background cleanup or future processing service is introduced here. Production
admission/durable abuse limits and independent security review remain pre-ingress
work. Full offline drafts/outbox/share ingestion remain S4, URL extraction S3.
