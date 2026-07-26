from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import models, schemas
from .auth import get_current_user
from .db import get_db

# Every route here requires auth and is scoped to the caller's own user_id (no IDOR).
router = APIRouter()


@router.get("/me", response_model=schemas.Me)
async def me(uid: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    u = await db.get(models.User, uid)
    return schemas.Me(id=uid, email=(u.email if u else None))


# ----------------------------- cart -----------------------------
@router.get("/cart", response_model=schemas.CartOut)
async def get_cart(uid: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(models.Cart, uid)
    return schemas.CartOut(items=(c.items if c else {}))


@router.put("/cart")
async def put_cart(body: schemas.CartIn, uid: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(models.Cart, uid)
    if c is None:
        db.add(models.Cart(user_id=uid, items=body.items))
    else:
        c.items = body.items
    await db.commit()
    return {"ok": True}


# ----------------------------- prefs -----------------------------
@router.get("/prefs", response_model=list[schemas.PrefIn])
async def get_prefs(uid: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(models.Preference).where(models.Preference.user_id == uid)
    )).scalars().all()
    return [schemas.PrefIn(kind=r.kind, value=r.value) for r in rows]


@router.put("/prefs")
async def put_prefs(body: list[schemas.PrefIn], uid: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Replace the user's prefs with the supplied set (matches the frontend's whole-array write).
    await db.execute(delete(models.Preference).where(models.Preference.user_id == uid))
    for p in body:
        db.add(models.Preference(user_id=uid, kind=p.kind, value=p.value))
    await db.commit()
    return {"ok": True}


# ----------------------------- orders -----------------------------
@router.get("/orders")
async def get_orders(uid: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    orders = (await db.execute(
        select(models.Order).where(models.Order.user_id == uid).order_by(models.Order.id.desc())
    )).scalars().all()
    out = []
    for o in orders:
        items = (await db.execute(
            select(models.OrderItem).where(models.OrderItem.order_id == o.id)
        )).scalars().all()
        out.append({
            "orderNo": o.order_no, "dateISO": o.date,
            "subtotal": float(o.subtotal), "total": float(o.total), "status": o.status,
            "items": [{
                "id": i.product_id, "name": i.name, "price": float(i.price), "qty": i.qty,
                "warrantyYears": i.warranty_years, "consumable": i.consumable,
            } for i in items],
        })
    return out


@router.post("/orders")
async def post_order(body: schemas.OrderIn, uid: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # SECURITY: every figure below is CLIENT-DECLARED. subtotal, total and each
    # item's id/name/price arrive in the request body and are stored verbatim, so
    # a caller can post an order claiming any price for any product_id — including
    # ids that exist in no catalog. checkout.py already states the rule for the
    # charging path ("never trust client-sent prices for what you actually
    # charge"); it applies here too, and this endpoint is the one that has no
    # guard yet.
    # Harmless while nothing is deployed and nothing charges (the live site runs
    # demoCheckout; see README's "don't deploy this until a real Stage-1 trigger
    # fires"). It stops being harmless the moment these rows are treated as
    # authoritative for fulfilment, invoicing or reporting.
    # TODO before deploying: look each i.id up in the trusted catalog, recompute
    # price/subtotal/total server-side, and reject the request on mismatch rather
    # than silently persisting the client's numbers.
    o = models.Order(
        user_id=uid, order_no=body.orderNo, date=body.dateISO,
        subtotal=body.subtotal, total=body.total, status="placed",
    )
    o.items = [models.OrderItem(
        product_id=i.id, name=i.name, price=i.price, qty=i.qty,
        warranty_years=i.warrantyYears, consumable=i.consumable,
    ) for i in body.items]
    db.add(o)
    await db.commit()
    return {"id": o.id}
