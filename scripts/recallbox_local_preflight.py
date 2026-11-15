#!/usr/bin/env python3
"""Read-only, secret-safe Sunday beta preflight for the operator's local Mac.

This is a manual smoke helper, not an automated acceptance test or a substitute
for real Auth0 login, note persistence, cross-account isolation, or native QA.
No credentials, tokens, environment values or user data are printed.
"""
import json
import os
import socket
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BRANCH = "feat/recallbox-sunday-mvp-20261115"


def check_port(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def git_branch() -> str:
    try:
        return subprocess.run(
            ["git", "branch", "--show-current"], cwd=ROOT, check=True,
            capture_output=True, text=True, timeout=3
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return "(git unavailable)"


def private_file(filename: Path) -> dict:
    try:
        mode = filename.stat().st_mode & 0o777
        return {"exists": True, "private_mode": mode & 0o077 == 0}
    except OSError:
        return {"exists": False, "private_mode": False}


def main() -> None:
    home = Path.home()
    settings = home / ".config" / "recallbox"
    runtime = private_file(settings / "runtime.env")
    oidc = private_file(settings / "oidc.env")
    migration = private_file(settings / "migration.env")
    mobile = private_file(ROOT / "apps" / "mobile" / ".env.local")
    state = {
        "branch": {"current": git_branch(), "expected": BRANCH},
        "configuration": {
            "runtime": runtime,
            "oidc": oidc,
            "migration": migration,
            "mobile": mobile,
        },
        "local_ports": {
            "postgres_5432": check_port(5432),
            "product_api_8001": check_port(8001),
            "expo_metro_8081": check_port(8081),
        },
        "install_presence": {
            "venv_python": (ROOT / ".venv" / "bin" / "python").is_file(),
            "mobile_node_modules": (ROOT / "apps" / "mobile" / "node_modules").is_dir(),
        },
        "manual_acceptance": (
            "NOT CHECKED: run real login, note/link CRUD, restart persistence, "
            "second-account isolation and Android navigation yourself"
        ),
    }
    print(json.dumps(state, indent=2))
    print("NOTE: A listening port or existing config is not proof of a working service.")


if __name__ == "__main__":
    main()
