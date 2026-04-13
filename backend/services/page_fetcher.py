"""
Admorph - Safe async HTML page fetcher.

Blocks private IPs (SSRF guard), retries up to 3 times with exponential backoff,
and enforces a 5-second timeout. Raises typed exceptions for clean error handling.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)


# ---------------------------------------------------------------------------
# Typed exceptions
# ---------------------------------------------------------------------------


class PageFetchError(Exception):
    """Base page fetch error - maps to an HTTP status code."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class SSRFError(PageFetchError):
    """URL targets a private/restricted IP (SSRF prevention)."""

    def __init__(self, detail: str = "private URLs not allowed") -> None:
        super().__init__(detail, status_code=400)


class PageTimeoutError(PageFetchError):
    def __init__(self) -> None:
        super().__init__("page took too long to load", status_code=504)


class PageAccessError(PageFetchError):
    pass


class NoReadableContentError(PageFetchError):
    def __init__(self) -> None:
        super().__init__(
            "page has no readable content - might be JS-rendered",
            status_code=400,
        )


# ---------------------------------------------------------------------------
# SSRF guard
# ---------------------------------------------------------------------------

_PRIVATE_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / AWS metadata
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

_BLOCKED_HOSTS: frozenset[str] = frozenset(
    {"localhost", "metadata.google.internal", "169.254.169.254"}
)


def _validate_url(url: str) -> None:
    """Raise SSRFError if URL is unsafe, PageFetchError if malformed."""
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise PageFetchError("URL must start with http:// or https://")

    host = parsed.hostname or ""
    if not host:
        raise PageFetchError("URL has no valid hostname")

    if host.lower() in _BLOCKED_HOSTS:
        raise SSRFError()

    try:
        addr_infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise PageFetchError(f"cannot resolve hostname: {host}")

    for _, _, _, _, sockaddr in addr_infos:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        for net in _PRIVATE_NETWORKS:
            if ip in net:
                raise SSRFError()


# ---------------------------------------------------------------------------
# Fetcher
# ---------------------------------------------------------------------------

_HEADERS: dict[str, str] = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}


@retry(
    retry=retry_if_exception_type(httpx.TransportError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4.0),
    reraise=True,
)
async def _fetch_with_retry(url: str, timeout: float) -> httpx.Response:
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(timeout),
        headers=_HEADERS,
        verify=False,
    ) as client:
        return await client.get(url)


async def fetch_page(url: str, timeout: float = 5.0) -> str:
    """
    Fetch HTML for a publicly accessible URL.

    Raises:
        SSRFError: Private/blocked IP.
        PageTimeoutError: Request exceeded timeout.
        PageAccessError: 403/4xx/5xx response.
        NoReadableContentError: Page has no usable HTML.
        PageFetchError: Other network errors.
    """
    _validate_url(url)

    try:
        response = await _fetch_with_retry(url, timeout)
    except httpx.TimeoutException:
        raise PageTimeoutError()
    except httpx.TransportError as exc:
        raise PageFetchError(f"network error: {exc}", status_code=502)

    if response.status_code == 403:
        raise PageAccessError(
            "page returned 403 - might be bot-protected", status_code=400
        )
    if response.status_code >= 400:
        raise PageAccessError(
            f"page returned {response.status_code}", status_code=400
        )

    html = response.text
    
    # Bot/Robot detection
    lowered_html = html.lower()
    bot_markers = [
        "verify you're not a robot", 
        "automated access", 
        "captcha", 
        "security challenge",
        "human verification"
    ]
    if any(marker in lowered_html for marker in bot_markers):
        raise PageAccessError(
            "site detected our bot and served a security challenge (CAPTCHA)", 
            status_code=400
        )

    if len(html.strip()) < 100:
        raise NoReadableContentError()

    return html
