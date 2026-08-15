"""Trusted server-side catalog — the same data.json the site renders from.

Trust boundary (REVIEW-2026-08-15 #8): every monetary figure the backend
persists or charges is recomputed from this catalog; client-declared numbers
are treated as a claim to VERIFY, never as data to store. All math happens in
integer cents so float drift can't manufacture a mismatch.

The delivery rule mirrors the frontend exactly (app.js deliveryFee()):
fee applies to any non-empty order under meta.freeDeliveryOver; missing
freeDeliveryOver means the fee always applies.
"""
import json
from functools import lru_cache
from pathlib import Path

from .config import settings


def cents(amount: float) -> int:
    return int(round(float(amount) * 100))


def _resolved_path() -> str:
    p = Path(settings.catalog_path)
    if not p.is_absolute():
        p = Path(__file__).resolve().parents[2] / p  # backend/.. = repo root
    return str(p)


@lru_cache(maxsize=1)
def _load(path: str) -> dict:
    data = json.loads(Path(path).read_text())
    meta = data.get("meta", {})
    return {
        "products": {p["id"]: p for p in data.get("products", [])},
        "delivery_fee_cents": cents(meta.get("deliveryFee", 0)),
        "free_over_cents": (cents(meta["freeDeliveryOver"])
                            if meta.get("freeDeliveryOver") is not None else None),
    }


def reset_cache() -> None:
    """Test seam: re-read the catalog after settings.catalog_path changes."""
    _load.cache_clear()


def get_product(product_id: str) -> dict | None:
    return _load(_resolved_path())["products"].get(product_id)


def delivery_fee_cents(subtotal_cents: int) -> int:
    c = _load(_resolved_path())
    if subtotal_cents <= 0:
        return 0
    if c["free_over_cents"] is not None and subtotal_cents >= c["free_over_cents"]:
        return 0
    return c["delivery_fee_cents"]
