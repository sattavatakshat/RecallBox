# S1 implementation and local operator guide

7 November 2026, Asia/Kolkata. **S1 acceptance remains BLOCKED** until PostgreSQL,
real provider credentials and both physical mobile platforms verify the full flow.
No public deployment is authorized or configured. The full PRD scope remains unchanged.

## Implemented boundaries

`src/recallbox` is a separate FastAPI executable. It never imports the extractor,
its FastAPI app, SQLite, benchmark storage, adapters or lab routes. It registers
only `GET /v1/health`, `POST /v1/auth/exchange`, `POST /v1/auth/refresh`,
`POST /v1/auth/logout`, `GET /v1/me`. OpenAPI/docs are disabled. Health exposes
only liveness; lifespan requires a reachable, migrated PostgreSQL DB with safe roles.
The CLI binds 127.0.0.1:8001, disables proxy headers/access logging and uses one
worker; the pool uses 1–3 connections. Logs include generated request ID, status
and elapsed time, never bodies, tokens, SQL exceptions or URL/query strings.

The S1 Alembic migration creates users, identities, devices and sessions only.
No future feature tables are stubbed. UUIDs, timestamptz, owner FKs, family/hash
indexes and same-owner device/replacement links constrain data. All four tables
use ENABLE + FORCE RLS with transaction-local account context. Runtime is a
non-owner, non-superuser, non-BYPASSRLS role. `users` scopes by its primary key;
other tables scope by owner_id. The two fixed-search-path SECURITY DEFINER
functions bootstrap verified identity lookup/creation and hash-to-owner lookup.
Their owner is the trusted migration role, whose explicit policy permits bootstrap;
PUBLIC cannot execute them. That role is never a runtime credential.

`resolve_identity` is a trusted API boundary, not a public token verifier: only
call it after real OIDC verification. Runtime SQL compromise could invoke it with
arbitrary subjects or change `app.user_id`; RLS protects against query mistakes,
not compromise of the service's credentials/code. Runtime has no DELETE/DDL or
TRUNCATE privileges. UPDATE on users.sync_sequence permits row locking and the
planned S2 sync counter, not updates to account status or identity.

## Python setup and API startup

Use Python 3.12 (verified here). Lightweight dependencies only:

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-product.lock
uv pip install --python .venv/bin/python --no-deps -e .
```

Provision a dedicated local PostgreSQL database named `recallbox`, never the lab
SQLite store. PostgreSQL/pgvector are NOT installed by this task. Select a supported
native ARM64 PostgreSQL and matching pgvector build with the operator; keep
loopback binding and SCRAM authentication. Start with the hosting plan's 128 MiB
shared_buffers and 12-connection budget; measure before pilot.

As database administrator, create the empty `recallbox` database, connect to it,
and run `scripts/product_roles.sql`. The script creates separate login roles and
enables the installed pgvector extension under administrator privileges; it does
not grant extension installation or superuser to the migrator/API. Set each role's
password interactively using `\password recallbox_migrator` and
`\password recallbox_api`. Do not put passwords in shell history, argv or Git.
Do not rerun the bootstrap against an existing populated database.

Load `RECALLBOX_MIGRATION_URL` from a private mode-0600 environment file outside
Git: URL format `postgresql+psycopg://recallbox_migrator:<URL-encoded-password>@127.0.0.1:5432/recallbox`.

```sh
.venv/bin/alembic upgrade head
unset RECALLBOX_MIGRATION_URL
```

Create a separate private API environment file using `.env.product.example` as a
reference. `RECALLBOX_DATABASE_URL` must use the API role and `postgresql://`.
Generate at least 48 random bytes of signing key with a password manager/secret
generator. The example placeholders are deliberately not working configuration.
No automatic dotenv loading; inject only product variables into the API process.
Then:

```sh
.venv/bin/recallbox-api
# Equivalent fixed local boundary:
.venv/bin/uvicorn recallbox.app:create_app --factory --host 127.0.0.1 --port 8001 --workers 1 --no-access-log --no-proxy-headers
```

The unchanged private lab remains a separate startup command:

```sh
.venv/bin/uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

Starting the lab can initialize its own storage; it was not started by this task.
Never put it behind product ingress. Product migrations are operator-run; the API
refuses a missing/incompatible migration instead of silently creating a database.
Migration downgrade intentionally refuses destructive account deletion. Back up
and review any future schema change; no live rollback by dropping identity tables.

## Identity-provider configuration

No provider account, credentials, domain ownership or paid service was invented.
Choose an externally hosted OIDC provider supporting **native public clients**,
authorization code + S256 PKCE, RS256 ID tokens, `openid` scope and a nonce echoed
in the signed ID token. A broker can offer Google and Apple upstream while
presenting the same PKCE contract on both platforms. No identity server is run on
the 8 GB laptop. Verify any provider pricing/privacy separately; no purchase was made.

1. Register one native public client per platform, with no client secret and token
   endpoint authentication method `none`. Do not use a confidential web client.
   Ensure the provider issues the same stable subject for the same account across
   both public clients (configure shared subject/sector behavior if required).
   Verify this on devices; never repair differences by trusting matching emails.
2. Register the exact redirect URI on both clients and the native builds. Local
   development uses `app.recallbox.mobile://auth/callback`. Before release use
   a controlled HTTPS app/universal link, host Apple AASA and Android assetlinks
   with actual app IDs/signing fingerprints, and configure the matching
   `EXPO_PUBLIC_LINK_HOST` + redirect URI. Changing link configuration requires
   a new development build. Domain ownership is still BLOCKED.
3. From the provider's reviewed discovery document obtain exact `issuer`,
   `token_endpoint`, `jwks_uri`; set `RECALLBOX_OIDC_PROVIDERS` to the JSON mapping
   in the example. Each entry has a platform-specific client_id and redirect_uri.
   Mobile provider keys and IDs must match those entries exactly. Endpoints must
   be HTTPS; endpoints/issuer are operator-controlled, never accepted in requests.
4. Set the public mobile variables in `apps/mobile/.env.local` (ignored by Git).
   No secret belongs in EXPO_PUBLIC variables. Configure both client IDs and keys.
5. Verify end to end with actual development builds on iOS AND Android, including
   app links, cancellation, expired code, nonce/state mismatch and key rotation.

The browser generates state, nonce and PKCE per attempt. The app checks state,
then sends code + verifier + nonce + platform/device UUID to `/v1/auth/exchange`.
The server exchanges the single-use code at the configured token endpoint with
its exact client/redirect binding, validates RS256 signature with bounded cached
JWKS, exact issuer/audience, exp/iat/sub/nonce and azp where applicable. It never
accepts a bare client ID token as login. No provider refresh/access tokens are
persisted. No email-based linking: `(issuer,subject)` is the account key.

Google/Apple compatibility review: a direct Google custom-scheme OAuth redirect
is not supported on Android. Apple Sign in with Apple web token exchange has
provider-specific confidential-client requirements; its native API is not this
public-client PKCE contract. **Do not configure either direct service as if it were
an interchangeable PKCE provider.** The implemented provider-neutral path needs
a compatible hosted broker, or a separately reviewed native provider adapter.
For iOS, if Google/social sign-in establishes the primary account, provide the
equivalent privacy-preserving login option required by Apple guideline 4.8 (normally
Sign in with Apple). Configure Apple upstream on the broker and verify both options
on both platforms before enabling social login for release. That gate is BLOCKED.

Product access expires after ten minutes and stays in mobile memory. Opaque
48-random-byte refresh credentials are SHA-256 hashed in PostgreSQL; families have
an absolute 30-day lifetime. Each rotation preserves the original expiry and
atomically records replacement. Access-token lifetime is capped by family expiry.
A fresh sign-in revokes previous sessions for that account's registered device. Reuse of an ancestor revokes the entire family,
including all still-live access sessions. Old rows must be retained through family
expiry to detect reuse. Logout revokes this device's current family. `/me` checks
account active + session unrevoked/unexpired on every access; logout does not
revoke provider sign-in or unrelated devices. Account-wide revocation can be
performed by an operator in a reviewed DB transaction; no unscheduled admin route.

Concurrent refreshes are serialized by the owner's user-row lock. The mobile
client uses one refresh promise. It removes the old refresh token before sending
a rotation and saves its replacement before exposing access. Network loss/process
kill during rotation requires fresh sign-in rather than unsafe replay. Local
logout completes after server revocation; an offline logout reports failure and
allows retry. SecureStore uses this-device-only unlocked storage. Platform backup,
reinstall/keychain persistence and revocation after restart need actual devices.
Cold callback after process death cannot recover an in-memory PKCE transaction;
the callback screen safely starts a new sign-in instead of trusting URL credentials.

## Mobile development

The project uses Expo SDK 58 (stable npm release resolved 7 November), React Native
and Expo modules selected from that SDK's compatibility manifest, TypeScript and
Expo Router. `package-lock.json` pins the actual dependency graph. It uses native
development builds; Expo Go is not authentication acceptance evidence.

```sh
cd apps/mobile
npm ci
# Set the public variables described above in .env.local first.
npm run typecheck
npm run ios          # full compatible Xcode + signing + device required
npm run android      # compatible JDK/Android SDK + device required
npm start            # localhost Metro, development client, no public tunnel
```

The API stays loopback-only. Android local development can use USB
`adb reverse tcp:8001 tcp:8001` and the loopback API address; configure development
cleartext permission only in a reviewed development build if needed. Do not enable
cleartext in release. iOS Simulator uses the host loopback; a physical iPhone needs
an approved secure local path with valid HTTPS, before device acceptance. Do not
solve device connectivity by binding this API publicly or starting a tunnel.
The code permits HTTP API origins only for known emulator/loopback hosts in
`__DEV__`; release requires HTTPS. There is no custom ATS/Android release bypass.

The welcome/sign-in/callback/account screens use paper/forest colors, editorial
serif headings, shared spacing, scalable text, 56-point controls, safe areas,
keyboard avoidance and light/dark palettes. There are no fake memories, future
feature tabs or paid integrations. `src/api.ts` defines the S1 request/response
contract; `src/session.tsx` handles secure restoration, foreground revalidation,
expiry and logout. Shared UI primitives include type, input, button and layout.
No cached memory content exists in S1.

## Verification evidence and open gates

Manual smoke only; no automated test cases were created, edited or run. Raw
credentials/token fixtures were ephemeral process-local data and were not saved.

| Gate | Observed evidence | Status |
| --- | --- | --- |
| Python dependency setup | Local Python 3.12 environment; product dependencies resolved and installed, pinned in requirements-product.lock | PASS |
| Configuration and syntax | Missing config rejected; all product/migration modules parsed | PASS |
| Product route isolation | In-process ASGI request inspection: exactly five S1 routes; no extractor module in sys.modules; /docs and /v1/benchmark 404 | PASS |
| Minimal health | In-process /v1/health returned only status=ok, with no lifespan/DB claim | PASS (handler only) |
| Missing/invalid auth | /me and /auth/logout 401 without credentials; bare id_token exchange rejected 422; malformed refresh rejected 422 | PASS |
| Invalid product JWTs | Ephemeral locally signed rejection probes: expired, wrong audience and wrong signature each 401 before DB access | PASS |
| Input bounds | 16,385-byte request rejected 413; validation responses omit submitted values | PASS |
| DB unavailable | Entering real lifespan against closed local DB port refused startup; no fallback DB/store | PASS (fail closed) |
| Alembic structure | history resolves 0001_s1; offline upgrade emits transactional SQL | PASS (generation only) |
| PostgreSQL + pgvector execution | Neither server nor client on PATH; no host DB installation performed | BLOCKED |
| Complete independent API startup | Requires real migrated DB and provider configuration; not claimed from ASGI probes | BLOCKED |
| Provider JWT/nonce verification with real issuer | No provisioned provider/clients | BLOCKED |
| Actual refresh/reuse/logout/access revocation | Code present; no live provider + DB session available | BLOCKED |
| Two-user/RLS and pool-reset adversarial check | Requires migrated DB + two real identities | BLOCKED |
| iOS development build and launch | xcodebuild reports active CommandLineTools rather than full Xcode | BLOCKED |
| Android development build and launch | JDK 21 + Android SDK present; ADB listener denied by sandbox, no physical device verified; native build not run | BLOCKED |
| Native secure restore and restart | Requires both physical platforms + real credentials | BLOCKED |
| Public hosting | ~17–18 GiB free, below 30 GiB gate; no tunnel or public listener configured | BLOCKED |

Additional mobile verification results are appended below after dependency checks.

Before calling S1 complete, provision DB roles/extension and migrate; attempt
ownerless and cross-owner reads/writes using the API role; verify role cannot
DDL/TRUNCATE or bypass RLS; check that committing/rolling back returns pooled
connections without owner context. Sign in as A and B on separate devices. Verify
/me always returns the authenticated account, owner_id is rejected in request
payloads, replayed refresh revokes its replacement and all family access tokens,
concurrent rotations preserve revocation, expiry holds across restarts, logout
persists server-side, and unknown credentials yield uniform unauthorized errors.
Exercise real wrong-issuer/audience/nonce/expiry/signature provider rejection and
JWKS rotation/cache expiry. Run fresh DB migration and future seeded upgrades,
record exact PostgreSQL/pgvector versions, and review grants with a second engineer.

## Remaining security work and S2 boundary

No public release claim: anonymous auth limits are bounded in-memory single-worker
controls, not durable distributed budgets; trusted edge/body/time limits, durable
abuse controls and independent security review remain ingress gates. Key rotation
currently requires coordinated signing-key replacement and expires existing
access; retain refresh rows until family expiry, then add reviewed content-free
retention cleanup. Provider outage and SecureStore/OS lifecycle failure need real
manual evidence. Provider key rotation rejects unknown keys until the five-minute
cache expires (fail closed). No implicit email merging, access-only logout,
plaintext refresh storage or release mock login exists.

S2 may build owned notes, idempotency and sync on the package/migration/owner
transaction pattern, typed client and protected navigation. Apply the same RLS and
composite-FK rules to each new table and use the users.sync_sequence lock for
commit-safe sync ordering. **First close S1 live authentication/DB/device gates.**
Do not connect product content to the benchmark lab. Keep future extraction in
isolated workers after the separate network/filesystem security gates.

Primary compatibility references checked during implementation:
[Expo SDK 58](https://expo.dev/changelog/sdk-58),
[Expo AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/),
[Expo authentication](https://docs.expo.dev/guides/authentication/),
[Google native OAuth restrictions](https://developers.google.com/identity/protocols/oauth2/native-app),
[Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens),
[Apple guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services).

### Final mobile and dependency observations

- Expo **58.0.23**, React **19.3.0**, React Native **0.88.1**; native versions
  selected by `expo install`, compatibility check reports up to date.
- TypeScript 5.9.3: `npm run typecheck` PASS. `npm ls --depth=0` PASS with no invalid
  peer relationships. React DOM is explicitly pinned to React's SDK-compatible
  version because Expo tooling's optional peer initially selected a newer patch.
- Android Metro/Hermes export PASS (1,181 modules, approximately 2.6 MB bytecode).
- iOS Metro/Hermes export PASS (1,187 modules, approximately 2.6 MB bytecode).
  Exports went to private temporary directories outside the repository. These are
  JavaScript bundle checks, not installable native builds or screen visual QA.
- Expo public config resolves with the intended app slug/plugins. The status-bar
  plugin was added explicitly because Expo cannot edit dynamic app.config.ts.
- `npm audit` reports five **moderate** findings through Expo CLI/fingerprint:
  [glob cancellation](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and
  [minimatch amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  npm's proposed fix is a major downgrade to Expo 53; no forced downgrade or
  unverified transitive major override was applied. Track upstream fixes and
  re-audit/review before release. No zero-vulnerability claim is made.
- No browser, OCR, transcription, model, container, PostgreSQL or Xcode installation
  was performed. Dependencies are repository-local; download caches use /tmp.
  Free disk remains below the pilot's 30 GiB gate.

### Actual source/configuration manifest

Created:

```text
.env.product.example
alembic.ini
requirements-product.lock
migrations/env.py
migrations/versions/0001_s1.py
scripts/product_roles.sql
src/recallbox/__init__.py
src/recallbox/config.py
src/recallbox/db.py
src/recallbox/cli.py
src/recallbox/identity.py
src/recallbox/auth.py
src/recallbox/app.py
apps/mobile/.env.example
apps/mobile/app.config.ts
apps/mobile/package.json
apps/mobile/package-lock.json
apps/mobile/tsconfig.json
apps/mobile/src/api.ts
apps/mobile/src/config.ts
apps/mobile/src/session.tsx
apps/mobile/src/ui.tsx
apps/mobile/app/_layout.tsx
apps/mobile/app/index.tsx
apps/mobile/app/sign-in.tsx
apps/mobile/app/auth/callback.tsx
apps/mobile/app/(account)/_layout.tsx
apps/mobile/app/(account)/index.tsx
docs/RECALLBOX_S1_IMPLEMENTATION.md
```

Modified existing files: `.gitignore`, `pyproject.toml`, `README.md` only.
No extractor/lab source, SQLite schema, benchmark files, architecture baseline
or automated test cases were modified. Local .venv/node_modules/.expo are ignored
build/dependency output, not source deliverables. No commit was pushed or deployed.
