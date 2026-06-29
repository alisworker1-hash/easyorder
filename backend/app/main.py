from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import checkout, routes
from .config import settings
from .db import create_all


@asynccontextmanager
async def lifespan(app: FastAPI):
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
