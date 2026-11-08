# Local Android prototype

Uses the existing PostgreSQL 17/pgvector database, real Auth0 native PKCE clients,
Expo Android development application, and Universal Extractor HTML parser.
No authentication bypass, seeded results, paid AI API, public listener or tunnel.

## Start on this Mac

From `/Users/akshat/Desktop/RecallBox`, use separate terminals:

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/recallbox-pg17 -l /opt/homebrew/var/recallbox-pg17/server.log start
bash scripts/run-local.sh api
bash scripts/run-local.sh worker
bash scripts/run-local.sh mobile
```

If PostgreSQL is already running, skip its start command. Start the existing
emulator, wait for its home screen, then install/open the cached debug APK:

```sh
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 -memory 2048 -no-boot-anim
bash scripts/run-local.sh android
```

The worker reads a local beta account allowlist at startup through a read-only
peer-admin query, then processes jobs under the existing constrained API role and
transaction-local ownership policies. Restart it after registering a new account.
It processes one job at a time. API and Metro remain on loopback, reached by ADB
reverse. Private runtime and Auth0 environment files remain outside Git.

## After a fresh checkout or dependency change

```sh
uv pip install --python .venv/bin/python -r requirements-product.lock -r requirements-capture.lock
uv pip install --python .venv/bin/python --no-deps -e .
# Apply migrations with only the private migrator configuration in this shell.
set -a; source ~/.config/recallbox/migration.env; set +a
.venv/bin/alembic upgrade head
unset RECALLBOX_MIGRATION_URL
mkdir -p build
xcrun clang -fobjc-arc -framework Foundation -framework NaturalLanguage scripts/local_embeddings.m -o build/local-embed
cd apps/mobile
npm ci
npx expo prebuild --platform android --no-install
cd android
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
ANDROID_HOME="$HOME/Library/Android/sdk" \
./gradlew :app:assembleDebug --no-daemon --max-workers=1 \
  -PreactNativeArchitectures=arm64-v8a \
  '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=384m'
```

Stop the emulator before a Gradle rebuild. Reuse the resulting APK afterward.
The generated native directories are ignored; the callback module and config
plugin are tracked and reapplied by prebuild.

## Behavior and limits

- Notes, URLs, PNG/JPEG/WebP images and PDFs persist in PostgreSQL. Capture writes
  are idempotent; originals have an 8 MiB limit and a 128 MiB account quota.
- Durable jobs expose queued, processing, ready, metadata-only and failed states;
  three attempts, bounded backoff and 90-second leases permit restart recovery.
- Network retrieval happens in a credential-free sandbox child, with manual
  redirect validation, public DNS checks, pinned connections, no proxies, and
  bounded download size, runtime and resident memory. Keep this prototype private;
  independent pre-ingress security review remains required.
- Keyword search includes captured text, labels and collections. Meaning search
  uses Apple's installed English sentence model, revision 1, with 512-dimensional
  pgvector storage. The measured probe took 0.53 seconds and about 35 MiB peak RSS.
  Up to 6,000 input characters are sent to that local model. No model downloads.
  It searches saved text and notes; it does not understand image pixels.
- Labels identify actual source hosts and file kinds. Collections are user-named.
- Images retain their original bytes and verified dimensions. OCR is unavailable.
  PDFs extract embedded text only, up to 100 pages/100,000 characters; scanned or
  encrypted PDFs are retained with an honest metadata-only explanation.
- Social/video links retain URL and available preview metadata; no transcripts
  or unavailable-media understanding are claimed.
- Android originals are retrieved through authenticated requests and a temporary
  share-sheet file, removed when the sheet closes. Unsaved drafts remain in memory.
- This is a development-client build. Cold startup on this 8 GB host can be slow.
  iOS native acceptance, physical-device performance, release signing/app links,
  offline capture/share extensions, OCR and production privacy/retention remain
  release work. No public hosting is configured.

## Manual evidence — 8 November 2026

No automated test cases were generated and no test suite was run. TypeScript,
Python compilation, migration execution and the actual Android build passed.

| Real execution check | Result |
| --- | --- |
| Auth0 PKCE | Two distinct real accounts authenticated; no synthetic sessions |
| Cold callback | App process killed during browser signup; encrypted callback recovered and new account authenticated |
| Cancel/retry | Browser cancellation followed by a new real authorization request; primary account signed in again |
| Notes | Create/read, content edit to version 2, delete to version 3, persisted sync tombstone |
| Article capture | Python.org article saved from Android, 1,724 extracted characters and a real vector |
| PDF | 13,264 original bytes matched SHA-256; embedded text extracted; authenticated share-sheet retrieval |
| Screenshot | 136,446 selected bytes matched SHA-256; dimensions 1080 × 2400; authenticated retrieval |
| Camera | Virtual emulator camera captured and saved a 27,628-byte JPEG, 1440 × 1920, with an authenticated preview; no physical Mac camera used |
| Search | Keyword `eravikulam` found its note; semantic `trekking in rainy mountains` ranked it first |
| Organization | Star/archive and Travel collection persisted; starred Travel filter returned the actual archived note |
| Restart | Backend, app and worker restarted; queued URL recovered to ready; saved content and secure session restored |
| Logout | Returned to sign-in; no active replacement session remained for the signed-out account |
| Account isolation | Second account had an empty library; first account's note was unavailable; its keyword search returned no matches |
| Database isolation | Foreign rows invisible; foreign update affected zero rows; foreign asset insertion rejected; pooled owner context cleared |
| Worker isolation | No RecallBox environment secrets; private config read blocked; API/database ports blocked |
| URL errors/recovery | Loopback source captured zero content, failed after three attempts, and requeued through the real retry action; disposable probe then deleted |

Screenshots are local, ignored artifacts in `beta-evidence/rapid-prototype/`.
Verified generated beta credentials are mode 0600 at
`~/.config/recallbox/beta-account-2.json`; no password or token is committed.
The controlled redirect boundary probe and direct private-address probes passed;
these checks do not replace independent public-ingress review.

The dependency installation reported five moderate npm advisories. A separate
`npm audit` was not executed: automatic approval review rejected transmission of
the project's dependency metadata to the external npm registry. No dependency
tree was sent by that rejected audit command; dependency advisory review remains
pending operator authorization.
