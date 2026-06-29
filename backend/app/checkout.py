import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from . import models
from .auth import get_current_user
from .config import settings
from .db import get_db

router = APIRouter()
stripe.api_key = settings.stripe_secret_key


@router.post("/checkout/create-session")
async def create_session(uid: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Create a Stripe Checkout Session. Card data never touches us (PCI stays SAQ-A)."""
    cart = await db.get(models.Cart, uid)
    items = (cart.items if cart else {})
    if not items:
        raise HTTPException(400, "cart is empty")

    # SECURITY: never trust client-sent prices for what you actually charge. Recompute every
    # line price from your authoritative catalog before building the Stripe line_items.
    # TODO: look up real unit prices for each product_id (data.json / a products table) and build:
    #   line_items = [{"price_data": {"currency": "usd", "unit_amount": <cents>,
    #                  "product_data": {"name": <name>}}, "quantity": qty} ...]
    line_items: list[dict] = []  # TODO: populate from the trusted catalog

    # NOTE: the stripe SDK call is synchronous; in production run it in a threadpool
    # (e.g. await anyio.to_thread.run_sync(...)) so it doesn't block the event loop.
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=line_items,
        success_url="https://YOUR-SITE/success?session={CHECKOUT_SESSION_ID}",  # TODO
        cancel_url="https://YOUR-SITE/cart",  # TODO
        client_reference_id=uid,
    )
    return {"url": session.url}


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, stripe_signature: str = Header(default="")):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.stripe_webhook_secret
        )
    except Exception:
        raise HTTPException(400, "invalid signature")

    if event["type"] == "checkout.session.completed":
        # TODO: mark the matching order paid (look it up by client_reference_id / session id).
        pass
    return {"received": True}
