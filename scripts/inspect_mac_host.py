#!/usr/bin/env python3
"""Read-only host inventory. No settings, services, or credentials are changed.

Run locally; output includes process names and listening addresses, so keep it private.
An optional networkQuality probe transfers data; it is never run by default.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import platform
import shutil
import subprocess


def probe(argv: list[str], timeout: int = 10, max_chars: int = 24000) -> dict:
    if not shutil.which(argv[0]):
        return {"status": "unavailable", "reason": "command not installed"}
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                                check=False, stdin=subprocess.DEVNULL)
        # Do not collect stderr: vendor tools may print local configuration details.
        return {"status": "ok" if result.returncode == 0 else "unavailable",
                "exit_code": result.returncode, "output": result.stdout[:max_chars].strip(),
                "truncated": len(result.stdout) > max_chars}
    except subprocess.TimeoutExpired:
        return {"status": "timeout"}
    except OSError as exc:
        return {"status": "unavailable", "reason": type(exc).__name__}


def inspect(active_network: bool = False) -> dict:
    disk = shutil.disk_usage(".")
    report = {
        "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "read-only inventory; no credentials, environment, or process arguments",
        "platform": {"system": platform.system(), "release": platform.release(),
                     "architecture": platform.machine()},
        "workspace_filesystem_bytes": {"total": disk.total, "used": disk.used, "free": disk.free},
    }
    if platform.system() != "Darwin":
        report["limitation"] = "Not macOS; run this script on the intended Mac host."
        return report
    commands = {
        "macos": ["sw_vers"],
        "cpu": ["sysctl", "-n", "machdep.cpu.brand_string"],
        "physical_ram_bytes": ["sysctl", "-n", "hw.memsize"],
        "virtual_memory": ["vm_stat"],
        "memory_pressure": ["memory_pressure", "-Q"],
        "swap": ["sysctl", "vm.swapusage"],
        "filesystem_capacity": ["df", "-h", "."],
        "apfs_capacity": ["diskutil", "apfs", "list"],
        "power_settings": ["pmset", "-g", "custom"],
        "battery": ["pmset", "-g", "batt"],
        "power_assertions": ["pmset", "-g", "assertions"],
        "listening_tcp": ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"],
        "udp_sockets": ["lsof", "-nP", "-iUDP"],
        "interface_counters": ["netstat", "-ib"],
        "utilization": ["top", "-l", "1", "-n", "0"],
    }
    for name, command in commands.items():
        report[name] = probe(command)
    processes = probe(["ps", "-axo", "pid=,ppid=,%cpu=,%mem=,rss=,comm="], max_chars=2000000)
    if processes["status"] == "ok":
        lines = processes["output"].splitlines()
        report["python_and_runtime_processes"] = [
            line for line in lines if any(word in line.lower() for word in
            ("python", "uvicorn", "postgres", "docker", "colima", "qemu", "cloudflared"))
        ]
        report["process_inventory_truncated"] = processes["truncated"]
    else:
        report["python_and_runtime_processes"] = processes
    report["runtime_commands"] = {name: bool(shutil.which(name)) for name in
        ("python3", "docker", "podman", "colima", "psql", "postgres", "cloudflared", "node")}
    # Listing existing containers is read-only; never start a desktop app or daemon.
    report["docker_version"] = probe(["docker", "version", "--format", "{{.Server.Version}}"], 5)
    report["docker_running"] = probe(["docker", "ps", "--format", "{{.Names}}\t{{.Status}}"], 5)
    report["podman_running"] = probe(["podman", "ps", "--format", "{{.Names}}\t{{.Status}}"], 5)
    report["network_capacity"] = (
        probe(["networkQuality", "-s"], 50) if active_network else
        {"status": "not_measured", "reason": "Use --active-network to opt into upload/download traffic."}
    )
    report["limitations"] = [
        "Sandbox and user permissions can hide processes, ports, disk and power information.",
        "No sudo is used. Missing output is unknown, not proof of absence.",
        "Free pages and memory_pressure are snapshots, not an application RAM budget.",
        "Filesystem/APFS capacity shares a storage pool; do not sum volume capacities.",
        "Interface byte counters are not an upload/download speed test.",
        "No firewall, FileVault, isolation, recovery, or availability certification is performed.",
    ]
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--active-network", action="store_true",
                        help="Opt in to up to 50 seconds of networkQuality upload/download traffic")
    arguments = parser.parse_args()
    print(json.dumps(inspect(arguments.active_network), indent=2))
