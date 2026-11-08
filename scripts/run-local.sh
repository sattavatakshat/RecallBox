#!/bin/bash
# Local-only prototype entrypoints. Private credentials never become shell output.
set -euo pipefail
cd "$(dirname "$0")/.."
task="${1:-api}"
case "$task" in
  api|worker)
    set -a
    source "$HOME/.config/recallbox/runtime.env"
    source "$HOME/.config/recallbox/oidc.env"
    set +a
    if [[ "$task" == api ]]; then
      exec .venv/bin/python -m uvicorn recallbox.app:create_app --factory --host 127.0.0.1 --port 8001 --workers 1 --no-access-log --no-proxy-headers
    fi
    # Bootstrap the local beta allowlist with a read-only peer-admin query, then
    # run every job under the existing constrained runtime role and owner RLS.
    owner_args=()
    while IFS= read -r owner; do
      [[ -n "$owner" ]] && owner_args+=(--owner "$owner")
    done < <(/opt/homebrew/opt/postgresql@17/bin/psql -X -v ON_ERROR_STOP=1 -h /opt/homebrew/var/recallbox-pg17 -U "$(id -un)" -d recallbox -Atc "SELECT id FROM users WHERE status='active' ORDER BY id")
    if [[ ${#owner_args[@]} -eq 0 ]]; then
      echo 'Sign in to one real account before starting the local worker.' >&2
      exit 1
    fi
    exec .venv/bin/python -m recallbox.worker "${owner_args[@]}"
    ;;
  mobile)
    cd apps/mobile
    exec npm start -- --port 8081
    ;;
  android)
    adb_path="$HOME/Library/Android/sdk/platform-tools/adb"
    "$adb_path" wait-for-device
    until [[ "$("$adb_path" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]; do sleep 1; done
    "$adb_path" reverse tcp:8001 tcp:8001
    "$adb_path" reverse tcp:8081 tcp:8081
    "$adb_path" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
    "$adb_path" shell am start -a android.intent.action.VIEW -d 'app.recallbox.mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' app.recallbox.mobile
    ;;
  *) echo 'Usage: bash scripts/run-local.sh api|worker|mobile|android' >&2; exit 2 ;;
esac
