import time

import httpx
from fastapi import Header, HTTPException, status
from jose import jwt
from jose.exceptions import JWTError

from .config import settings

_DEV_USER = "dev-user"
_JWKS_TTL = 600  # seconds — refresh the key set periodically so rotation is picked up
_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0


async def _fetch_jwks() -> dict:
    async with httpx.AsyncClient(timeout=5) as c:
        resp = await c.get(settings.auth_jwks_url)
        resp.raise_for_status()
        return resp.json()


async def _jwks(force: bool = False) -> dict:
    """Return the provider JWKS, refreshing on a TTL or when forced (e.g. a 'kid' miss)."""
    global _jwks_cache, _jwks_fetched_at
    now = time.monotonic()
    if force or _jwks_cache is None or (now - _jwks_fetched_at) > _JWKS_TTL:
        _jwks_cache = await _fetch_jwks()
        _jwks_fetched_at = now
    return _jwks_cache


def _has_kid(jwks: dict, kid: str | None) -> bool:
    return any(k.get("kid") == kid for k in (jwks.get("keys") or []))


async def get_current_user(authorization: str | None = Header(default=None)) -> str:
    """Return the authenticated user's id (the provider 'sub'). Verifies the bearer JWT
    against the managed provider's JWKS — we never see or store a password."""
    if settings.dev_auth_bypass:
        return _DEV_USER  # DEV ONLY — guarded by an env flag; never enable in production

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]

    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token header")

    # JWKS-endpoint failures are a SERVER fault -> 503, never 401 (so a provider outage
    # doesn't log valid users out). A 'kid' miss likely means a rotated key -> refresh once.
    try:
        jwks = await _jwks()
        if not _has_kid(jwks, kid):
            jwks = await _jwks(force=True)
    except Exception:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "auth keys unavailable")

    # Only genuine token-validation failures become 401.
    try:
        claims = jwt.decode(
            token,
            jwks,  # python-jose selects the key from the JWK set by 'kid'
            algorithms=["RS256"],  # pin the alg — never allow 'none' or HS/RS confusion
            audience=settings.auth_audience,
            issuer=settings.auth_issuer,
            options={"verify_at_hash": False},
        )
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token missing sub")
    return sub
