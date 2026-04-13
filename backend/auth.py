"""
Admorph - JWT authentication.

Issues JWT tokens for any client_id (per PRD FR7.1).
Tokens expire after 60 minutes.
"""

from __future__ import annotations

import time

import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import Settings, get_settings


_bearer = HTTPBearer(auto_error=False)


def _get_settings() -> Settings:
    return get_settings()


def create_token(client_id: str) -> str:
    """Create a signed HS256 JWT for the given client_id."""
    settings = _get_settings()
    now = int(time.time())
    payload = {
        "sub": client_id,
        "iat": now,
        "exp": now + settings.jwt_expiry_minutes * 60,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> dict:
    """
    FastAPI dependency - verifies Bearer JWT.

    Raises 401 if token is missing, invalid, or expired.
    Returns decoded payload dict on success.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = _get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload
