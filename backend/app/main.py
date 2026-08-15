from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import checkout, routes
from .config import settings
from .db import create_all


def validate_runtime_config(s) -> None:
    """Fail closed at startup (REVIEW-2026-08-15 #10): without the dev bypass,
    a half-configured auth provider must be a crash at boot, not an open API."""
    if s.dev_auth_bypass:
        return
    missing = [k for k in ("auth_issuer", "auth_audience", "auth_jwks_url")
               if not getattr(s, k)]
    if missing:
        raise RuntimeError(
            "refusing to start: auth is not configured "
            f"({', '.join(missing)} empty). Set them for production, or "
            "DEV_AUTH_BYPASS=1 strictly for local dev.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_config(settings)
    # DEV convenience: auto-create tables when running in dev-bypass mode.
    # In real environments, run Alembic migrations instead (see README).
    if settings.dev_auth_bypass:
        await create_all()
    yield


app = FastAPI(title="EasyOrder API", lifespan=lifespan)

# CORS locked to the configured site origin(s) only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(routes.router)
app.include_router(checkout.router)


@app.get("/health")
async def health():
    return {"ok": True}
