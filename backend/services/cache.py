"""
Admorph - SHA256 in-memory cache with TTL.

Thread-safe dictionary cache keyed by SHA256(ad_bytes + landing_page_url).
Prevents duplicate LLM calls for identical inputs.
"""

from __future__ import annotations

import hashlib
import threading
import time
from typing import Any


class InMemoryCache:
    """Thread-safe in-memory cache with per-entry TTL."""

    def __init__(self, default_ttl: int = 3600) -> None:
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = threading.RLock()
        self._default_ttl = default_ttl

    def _make_key(self, ad_bytes: bytes, landing_page_url: str) -> str:
        """Generate a deterministic SHA256 cache key."""
        payload = ad_bytes + landing_page_url.encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def get(self, ad_bytes: bytes, landing_page_url: str) -> Any | None:
        """Return cached value or None if missing/expired."""
        key = self._make_key(ad_bytes, landing_page_url)
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    def set(
        self,
        ad_bytes: bytes,
        landing_page_url: str,
        value: Any,
        ttl: int | None = None,
    ) -> None:
        """Store value with TTL (defaults to instance default_ttl)."""
        key = self._make_key(ad_bytes, landing_page_url)
        ttl = ttl if ttl is not None else self._default_ttl
        expires_at = time.monotonic() + ttl
        with self._lock:
            self._store[key] = (value, expires_at)

    def evict_expired(self) -> int:
        """Remove all expired entries. Returns count removed."""
        now = time.monotonic()
        with self._lock:
            expired = [k for k, (_, exp) in self._store.items() if now > exp]
            for k in expired:
                del self._store[k]
        return len(expired)

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)


# Module-level singleton
_cache: InMemoryCache | None = None


def get_cache(ttl: int = 3600) -> InMemoryCache:
    global _cache
    if _cache is None:
        _cache = InMemoryCache(default_ttl=ttl)
    return _cache
