"""Best-effort network URL safety checks. NOT sufficient for hostile multi-tenant exposure.

All URLs are checked before delegating to third-party crawlers. The HTTP fetcher also
checks each redirect. Browser crawlers and third-party CLIs may perform their own
redirects / DNS lookups; use a network sandbox before allowing untrusted traffic.
"""
import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit


class URLRejected(ValueError):
    pass


def check_url(url: str) -> str:
    if any(ord(c) < 32 for c in url) or "\\" in url:
        raise URLRejected("URL contains invalid control characters or backslashes")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise URLRejected("Malformed URL") from exc
    if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname:
        raise URLRejected("Only absolute http(s) URLs are supported")
    if parsed.username is not None or parsed.password is not None:
        raise URLRejected("URLs with embedded credentials are not supported")
    if port not in (None, 80, 443):
        raise URLRejected("Only standard HTTP(S) ports are supported in this local MVP")
    host = parsed.hostname.rstrip(".").lower()
    if host in ("localhost", "localhost.localdomain") or host.endswith((".localhost", ".local", ".internal", ".onion")):
        raise URLRejected("Local or non-public domain is not allowed")
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
        if not ip.is_global:
            raise URLRejected("Non-public IP address is not allowed")
    except ValueError as exc:
        if isinstance(exc, URLRejected):
            raise
    return url


def _check_public_dns(url: str) -> None:
    parsed = urlsplit(url)
    host = parsed.hostname
    assert host
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except OSError as exc:
        raise URLRejected(f"Could not resolve host: {host}") from exc
    if not infos:
        raise URLRejected("Host does not resolve")
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError as exc:
            raise URLRejected("Invalid DNS answer") from exc
        if not ip.is_global:
            raise URLRejected("DNS resolved to a non-public IP address")


async def validate_url(url: str) -> str:
    check_url(url)
    await asyncio.to_thread(_check_public_dns, url)
    return url
