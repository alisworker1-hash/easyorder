from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import catalog, models, schemas
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
    # Trust boundary (REVIEW-2026-08-15 #8): the client's figures are a CLAIM,
    # verified against the trusted catalog; the persisted row is entirely
    # server-computed. A mismatch is a 422 naming the field — never a silent
    # correction, because the UI showing one price while the server records
    # another is a bug somebody needs to see. Names are persisted from the
    # catalog (cosmetic client drift tolerated); warranty/consumable are
    # descriptive pass-through, not money.
    if not body.items:
        raise HTTPException(422, "order has no items")
    subtotal_c = 0
    server_items = []
    for i in body.items:
        p = catalog.get_product(i.id)
        if p is None:
            raise HTTPException(422, f"unknown product id: {i.id}")
        if not 1 <= i.qty <= 999:
            raise HTTPException(422, f"bad quantity for {i.id}: {i.qty}")
        price_c = catalog.cents(p["price"])
        if catalog.cents(i.price) != price_c:
            raise HTTPException(
                422, f"price mismatch for {i.id}: client {i.price} vs catalog {p['price']}")
        subtotal_c += price_c * i.qty
        server_items.append(models.OrderItem(
            product_id=p["id"], name=p["name"], price=p["price"], qty=i.qty,
            warranty_years=i.warrantyYears, consumable=i.consumable,
        ))
    total_c = subtotal_c + catalog.delivery_fee_cents(subtotal_c)
    if catalog.cents(body.subtotal) != subtotal_c:
        raise HTTPException(
            422, f"subtotal mismatch: client {body.subtotal} vs computed {subtotal_c / 100:.2f}")
    if catalog.cents(body.total) != total_c:
        raise HTTPException(
            422, f"total mismatch: client {body.total} vs computed {total_c / 100:.2f}")
    o = models.Order(
        user_id=uid, order_no=body.orderNo, date=body.dateISO,
        subtotal=subtotal_c / 100, total=total_c / 100, status="placed",
    )
    o.items = server_items
    db.add(o)
    await db.commit()
    return {"id": o.id}
