# Mac M2 host readiness and secure hosting plan

Assessment: **suitable for lightweight local foundation work; blocked for public product hosting**. Read-only inspection on 7 November 2026, approximately 14:39 Asia/Kolkata, baseline `c1ef5ed`. No system settings, router rules, services or tunnel were changed. No packages/models were installed.

## Observed host readiness

Inventory command: `python3 scripts/inspect_mac_host.py`. A second execution outside the sandbox recovered CPU, physical RAM, swap and process utilization hidden by sandbox permissions. Raw inventories remain in temporary local files, not in Git; they contain local process/network metadata. The script does not read secrets, environment variables or process arguments. Results are snapshots, not load-test results.

| Check | Observed / interpretation |
|---|---|
| OS / architecture / CPU | `sw_vers`: macOS 27.0.1, build 26A434; Darwin 27.0.0, arm64; `sysctl`: Apple M2. These are host-reported values |
| Physical RAM | 8,589,934,592 bytes (8 GiB) |
| Available memory | `memory_pressure -Q`: 37% system-wide free estimate; `top`: 7,526 MiB used, 93 MiB unused, 3,485 MiB compressor, 1,265 MiB wired. Different counters describe different concepts; 37% is not guaranteed allocatable service memory |
| Swap | 1,024 MiB allocated, about 194 MiB used, encrypted according to `sysctl`; existing compression/swap means this desktop session has limited spare headroom |
| Workspace filesystem | About 228 GiB capacity, 20 GiB available, 91% capacity according to `df`; `disk_usage` reports about 19.5 GiB free. APFS shared-volume accounting differs from used+free; never sum volumes |
| CPU / load snapshot | 77.69% CPU idle; load averages 3.75 / 3.47 / 4.46; 540 processes. Not a sustained workload or thermal test |
| Existing Python services | Final unrestricted process inventory was not truncated: it showed a VS Code Python environment helper and the inventory Python process itself, with no observed Uvicorn/PostgreSQL/container/tunnel service. No listener on planned 8000/8001 in observed TCP inventory; hidden services still cannot be ruled out |
| Listeners | Observed OS ControlCenter on wildcard TCP 5000/7000, rapportd on 49152, VS Code helpers on loopback ephemeral ports. Do not stop unrelated services. This is not evidence that those ports are reachable through the router |
| Runtime availability | Python3 and Node on PATH; Docker, Podman, Colima, PostgreSQL client/server and cloudflared not on PATH. This does not prove no application bundle exists elsewhere |
| Python packages | Observed Python executable is Homebrew Python 3.14; current `python3` cannot locate FastAPI, HTTPX, BeautifulSoup or Pydantic. Choose and verify a supported Python version for the selected processing dependencies before installation, rather than assuming every optional engine supports 3.14. No `.venv` in this checkout. Current application was not started |
| Power | AC connected, battery charging; observed AC `sleep 0`, display sleep 10, low-power mode 1, standby 1. Battery/lid-close/reboot/logged-out availability not proven |
| Network | Interface counters collected; bandwidth and ISP reliability **not measured**. Sandbox Git DNS failed earlier while an unrestricted Git read succeeded; that is not an upload-speed measurement |
| Recovery / isolation | FileVault, firewall policy, isolated egress, backups, restore, unattended startup and crash recovery not validated |

The existing disk headroom is below the proposed 30 GiB pre-pilot gate. Do not download a VM, browser bundle, model set or ingest media until storage allocation is planned. Do not delete unrelated files automatically. Residential service availability and bandwidth remain deployment blockers, even if individual requests work.

## Reusable safe inventory

Run from the repository in your local terminal:

```bash
python3 scripts/inspect_mac_host.py > /tmp/recallbox-host-private.json
```

Optional bandwidth measurement (transfers upload/download data, up to 50 seconds):

```bash
python3 scripts/inspect_mac_host.py --active-network > /tmp/recallbox-host-private-network.json
```

The default is passive. It reads OS/CPU/memory, free space/APFS capacity, Python/runtime process names, current listening TCP/UDP sockets, interface counters and power settings. Missing commands, denied permissions and timeouts appear as unavailable. No `sudo`, network listener, package install, launch job, login item, `pmset` mutation or router action is performed. Keep raw output private. Rerun on a quiet host and under the eventual capped workload; use Activity Monitor as an additional cross-check.

## Lightest viable operating budget

Use native PostgreSQL rather than running the whole backend in Docker Desktop. However, a bounded Linux ARM64 VM or equivalently enforced sandbox is justified for hostile parsers and outbound network control. A Python child process alone does not isolate filesystem access or network traffic. Installing a container runtime without an enforced network/filesystem policy does not satisfy isolation.

The figures below are **planning ceilings to validate**, not benchmarked RSS or an additive guarantee; host and VM page cache/shared allocations affect accounting.

| Component | Initial budget / control |
|---|---|
| macOS + quiet desktop | Reserve approximately 4 GiB; close simulators/build tooling/browsers during heavy jobs |
| PostgreSQL native | Target 400–600 MiB total; initial shared_buffers 128 MiB, work_mem 4 MiB, maintenance_work_mem 64 MiB, max_connections 12; API pool 3, coordinator pool 2, reserved admin capacity. Measure backend/cache usage |
| Product API + coordinator | Target 300–500 MiB combined; one Uvicorn worker, small pools, streamed uploads; no reload in hosting |
| Ingress / small gateway | Target under 150 MiB; rate/body/time limits and route allowlist |
| Isolated Linux processor | Start 2 GiB VM, 2 vCPU; one task, no swap growth relied upon; reserve a fixed scratch volume and apply cgroup/process limits |
| Safety margin | Keep at least 0.5 GiB effective headroom; pause heavy work if pressure rises. Admission cannot rely on a free-page threshold alone |

A quiet 8 GiB host may fit this envelope narrowly; the current busy session does not demonstrate that fit. Do not co-reside Chromium, Docling, OCR, Whisper and an embedding runtime simultaneously. Tiny/base transcription and one embedding model phase are plausible candidates, subject to measurements. A large LLM, full identity stack, multiple worker processes, HNSW build, a local S3 service and a monitoring cluster are unjustified here.

Start embeddings with exact owner-scoped search, and memory action features with source parsing and editors. If the 2 GiB isolated processor cannot perform required bounded media tasks, reduce input limits and measure again. If the complete supported workload still fails, move the isolated worker to another approved host or upgrade hardware; external release remains blocked. Never relax isolation to fit RAM.

Proposed storage allocation: 30 GiB free before pilot; 5 GiB active product media plus bounded staging/scratch, 2 GiB DB allowance, model/VM capacity planned separately. Pause ingestion below 15 GiB free; stop uploads/heavy processing below 10 GiB; preserve reads/deletion where safe. Reserve estimated expanded bytes before accepting work, not just compressed upload size. Alert on DB/WAL/log growth; bound backups locally and copy encrypted snapshots off-device. The full retention/storage arithmetic must be rechecked after actual binaries/models are chosen.

## HTTPS ingress and route boundary

No router port forwarding or public development listener. Future flow: named HTTPS hostname → Cloudflare Tunnel → loopback gateway on 127.0.0.1:8080 → dedicated product app on 127.0.0.1:8001. Private lab stays on 127.0.0.1:8000 and is not a tunnel target. PostgreSQL binds loopback; no direct mobile DB connection. Origin service uses no reload, strict Host validation and only trusted proxy headers from loopback.

Illustrative, **inactive** tunnel configuration, to be generated only after release gates pass:

```yaml
# DESIGN ONLY: replace hostname/UUID/credential path during reviewed deployment.
tunnel: REPLACE_WITH_UUID
credentials-file: /private/service-config/tunnel.json
ingress:
  - hostname: api.example.invalid
    path: ^/v1/.*$
    service: http://127.0.0.1:8080
  - service: http_status:404
```

A tunnel establishes ingress, not user authorization. The gateway must allow exact product methods/routes from the PRD, reject `/v1/benchmark`, leaderboard/storage/evaluation/export-lab routes, `/docs`, `/redoc`, `/openapi.json`, debug and metrics. Product app must independently lack lab routes and disable public docs. Do not rely on the broad example path regex as the route security control. Normalize paths consistently, reject encoded traversal/ambiguous slashes, and verify matching behavior for the pinned cloudflared version. [Cloudflare configuration reference](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/) describes ingress matching, catch-all rules and validation. Validate rules locally with `cloudflared tunnel ingress validate` and negative path cases before connecting.

Public `/v1/health` may return a minimal liveness status without versions, adapters, paths, queue data or account counts. Detailed readiness/metrics remain loopback-only. Identity exchange/refresh have abuse limits; all memory/media/action/sync/export routes require product authentication. Cloudflare Access can provide an extra invitation gate if compatible with native login, but does not replace per-user isolation. Domain, Cloudflare account, identity provider and push credentials are unprovisioned. Any subscription/domain/backup cost needs an explicit decision before purchase.

## Authorization, quotas and secret handling

Use the architecture's native OIDC flow, short access tokens, rotating hashed refresh tokens and immediate revocation checks. Apply per-owner queries, RLS and composite ownership FKs to every product relation. Include secondary endpoints, file ranges, job status, sync, action sources and exported archives in cross-user probes. Enforce transaction-local user context with a non-owner, non-BYPASSRLS DB role; never let a phone set that context.

Initial authenticated request budget 60 metadata requests/minute/account, 10 searches/minute/account, two concurrent upload streams/account; separate small burst and anonymous/IP limits for auth. Persist counters/reservations with atomic PostgreSQL operations so restart does not reset quotas. Return 429 plus Retry-After; return 413 before parsing oversized bodies. Apply byte-stream limits even with missing/false Content-Length and chunked encoding. Multipart length, query depth/page size, filter count, response size and range count are bounded. Pilot job/media limits are in the PRD and adjustable only through trusted configuration.

Store service secrets outside Git in macOS Keychain or a service-owned mode-0600 file under a 0700 directory. Never put tokens in command arguments, plist literals, mobile bundles, URLs or logs. A launch wrapper retrieves credentials under the intended service identity and builds a minimal environment. Separate migration, API, coordinator, tunnel and backup identities. Processor children get no inherited secrets/home/browser cookies. Production examples must contain names only. Rotate keys with explicit overlap and a tested revocation procedure.

## SSRF, DNS rebinding and hostile-file isolation

The current `security.py` validates DNS separately from HTTPX's connection, leaving a rebinding window. Third-party browser/CLI backends can fetch redirects/subresources outside `fetcher.py`. Therefore do not expose `/v1/extract` as a shortcut.

Required worker boundary: a dedicated ARM64 Linux VM with no shared host home, SSH agent, Docker socket, benchmark directory or cloud metadata credentials. The trusted coordinator stages one task's input/output through a narrow authenticated host-only transfer channel; the untrusted processor never mounts the host data root or receives a DB connection. Reset/delete each task workspace and terminate descendant processes on timeout. Output is schema/size-validated by the coordinator and treated as untrusted text.

Inside the VM, processor UID/network namespace denies all outbound traffic except the explicit trusted proxy; no direct DNS, UDP, QUIC, raw sockets, arbitrary CONNECT or WebRTC. Proxy service has its own restricted identity and connects only to validated public HTTP(S) destinations. Coordinator transfer port is inaccessible to parser processes. Filesystem read-only runtime/model mounts, no host secrets, bounded scratch, memory/CPU/PID/file-descriptor limits and non-root execution are required. VM firewall/host-only routing policy must explicitly deny host, LAN, link-local and service subnet access. A container running as root with default bridge access is not acceptable evidence.

The proxy must parse/normalize URLs; reject credentials, local names, unsupported schemes/ports and IP obfuscations; validate every A/AAAA answer; reject mixed public/private results. At connection time pin to an approved address with correct TLS SNI/certificate validation and HTTP Host; never let a second library lookup select another address. Revalidate on new connection and redirect (at most four), resolve relative redirects safely, block HTTPS downgrade and strip auth/cookies on origin changes. Apply the same rules to images, frames, captions and browser subrequests. HTTPS CONNECT cannot simply tunnel an unvalidated target; target address pinning, port rules and TLS verification must still hold. Disable or exclude an adapter if its networking cannot obey the boundary.

Before ingress: prove denial of localhost, IPv4/IPv6 private/loopback/link-local/mapped addresses, metadata endpoints, host/LAN addresses, mixed DNS answers, DNS rebinding, redirect chains and proxy bypass. Use controlled local fixtures inside an isolated verification network; no probing third-party internal systems. Verify no HTTP request reaches the protected sentinel, not merely that URL parsing returned an error. This protection is proposed, not implemented by the inventory script.

Upload handling: generated storage keys, no user paths/symlinks/archive traversal; detect magic bytes, decoded pixel/page/duration limits, decompression bombs, malformed/encrypted PDFs and codec complexity. No office macro execution or arbitrary archives in baseline scope. Decode/parse without network. Kill full process trees, cap stdout/stderr and temporary files, quarantine/reject unsafe input with a reason. Verify MIME and checksum on finalize and recheck permissions at publication. Antivirus alone is not the sandbox.

## Startup, failures, monitoring and recovery

After gates pass, install launchd jobs under a dedicated service identity with fixed executable paths, working directories, restricted umask, restart throttling, KeepAlive policy and bounded log rotation. Separate jobs for PostgreSQL, API, coordinator and tunnel; each handles unavailable dependencies with bounded backoff. Do not install them in this documentation task. Product API is ready only after DB migrations/version and storage checks; coordinator resumes expired leases with fencing, never starts duplicate publish operations. Tunnel runs only when the approved product deployment exists.

FileVault protects at-rest files but an encrypted cold boot may require local unlock. AC sleep settings alone do not prove lid-close or logged-out availability. Manually verify sleep/wake, reboot/unlock/startup and power/ISP outage behavior; document operator recovery. Keep laptop ventilated and powered; no unreviewed permanent sleep setting changes. This setup is a single point of failure, with no high-availability guarantee.

Private structured logs include request/job IDs, safe error categories and timing, without content/secrets. Monitor memory pressure/swap trend, free disk, queue oldest age, failed/expired leases, DB connection usage, 5xx, processing timeouts, backup age and push receipts. Initial alerts: API unavailable 2 minutes, oldest normal job >10 minutes, last successful backup >26 hours, disk below thresholds, sustained pressure/worker OOM. Use an external uptime check of minimal health plus a separately configured operator alert destination; no message is sent by this task.

Daily encrypted off-device backup using a reviewed tool such as [restic](https://restic.readthedocs.io/en/stable/100_references.html) to a separately controlled destination (no account/cost approved). For initial small library: pause ingestion/publication and purge, keep reads available, stage a consistent PostgreSQL dump plus immutable media manifest, verify all DB-referenced media hashes, then resume writes and encrypt/upload the immutable snapshot. Take a SQLite backup API snapshot plus artifacts separately with lab writers stopped; never copy only an active WAL database. Backup credentials cannot decrypt production app tokens and should have minimal storage privileges. Encryption key recovery lives off the laptop, separately from backup ciphertext.

Initial recovery objectives: RPO ≤24 hours, RTO ≤8 hours, pending measured restore. Retain at most 30 days; use bounded local staging. Restore to a clean isolated directory/host, verify manifests/DB/ownership, replay a separately protected deletion ledger, expire old sessions, then enable reads and ingestion. Account/memory deletion logically hides data immediately, cancels jobs and purges primary blobs/chunks/vectors within 24 hours; historical encrypted backup copies expire by day 30. Retain content-free deletion tombstones 90 days and ensure restore never resurrects them. Monthly restore drill and a deletion-across-restore drill are release evidence, not optional paperwork.

## Deployment blockers

1. Product authentication, authorization, RLS, data model, durable queue and uploads do not exist yet.
2. DNS-pinned fetching and enforceable worker filesystem/egress isolation are unimplemented.
3. Host free disk below gate, significant current compression, no measured concurrent workload or network capacity/reliability.
4. PostgreSQL/pgvector, isolated runtime and cloudflared not available on current PATH; dependency/model selection and installation pending.
5. Identity/push/domain/backup destinations, secrets and any costs need concrete decisions.
6. Both-platform share extension, push/sync/deletion, unattended recovery and encrypted restore remain unverified.

Proceed locally with S0–S2 from [release gates](RECALLBOX_RELEASE_GATES.md). No public tunnel should exist until all applicable pre-ingress checks pass; full external release additionally requires the entire feature and end-to-end gate set.
