"""
Admorph - slowapi rate limiter setup.

- POST /api/personalize: 3/min per client_id
- POST /auth/token: 20/min per IP
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address


def _get_client_id(request) -> str:
    """
    Key function for personalize endpoint.
    Uses JWT sub (client_id) if authenticated, falls back to IP.
    """
    # The auth dependency runs before rate limiter resolves the key,
    # so we read the decoded payload stored in request.state by the dependency.
    client_id = getattr(request.state, "client_id", None)
    if client_id:
        return client_id
    return get_remote_address(request)


limiter = Limiter(key_func=get_remote_address, default_limits=[])
personalize_limiter_key = _get_client_id
