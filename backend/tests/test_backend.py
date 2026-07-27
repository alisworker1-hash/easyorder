import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://localhost/easyorder")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import datetime
from decimal import Decimal

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import auth
from app.main import app
from app.routes import get_current_user as routes_get_current_user
from app.db import get_db
from app.models import Cart, Order, OrderItem, Preference, User


class ScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class FakeResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def scalars(self):
        return ScalarResult(self._rows)


class FakeDB:
    def __init__(self):
        self.users = {}
        self.carts = {}
        self.preferences = []
        self.orders = []
        self.order_items = {}
        self.commits = 0
        self._order_id = 1
        self._pref_id = 1
        self.added = []

    async def get(self, model, key):
        if model is User:
            return self.users.get(key)
        if model is Cart:
            return self.carts.get(key)
        if model is Order:
            return next((o for o in self.orders if o.user_id == key), None)
        return None

    async def execute(self, stmt):
        sql = str(stmt)
        if sql.startswith("DELETE FROM preference"):
            user_id = stmt._where_criteria[0].right.value
            self.preferences = [p for p in self.preferences if p.user_id != user_id]
            return FakeResult()
        if "FROM preference" in sql:
            user_id = stmt._where_criteria[0].right.value
            return FakeResult([p for p in self.preferences if p.user_id == user_id])
        if "FROM order_item" in sql:
            order_id = stmt._where_criteria[0].right.value
            return FakeResult(self.order_items.get(order_id, []))
        if "FROM \"order\"" in sql or "FROM order" in sql:
            user_id = stmt._where_criteria[0].right.value
            rows = [o for o in self.orders if o.user_id == user_id]
            rows.sort(key=lambda o: o.id, reverse=True)
            return FakeResult(rows)
        raise AssertionError(f"Unexpected SQL: {sql}")

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, Cart):
            self.carts[obj.user_id] = obj
        elif isinstance(obj, Preference):
            obj.id = self._pref_id
            self._pref_id += 1
            self.preferences.append(obj)
        elif isinstance(obj, Order):
            obj.id = self._order_id
            self._order_id += 1
            self.orders.append(obj)
            self.order_items[obj.id] = list(obj.items)
        elif isinstance(obj, OrderItem):
            pass

    async def commit(self):
        self.commits += 1


@pytest.fixture()
def client_and_db():
    db = FakeDB()

    async def override_db():
        yield db

    async def override_user():
        return "user-1"

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[routes_get_current_user] = override_user
    try:
        yield TestClient(app), db
    finally:
        app.dependency_overrides.clear()


def test_health(client_and_db):
    client, _ = client_and_db
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_me_happy_path(client_and_db):
    client, db = client_and_db
    db.users["user-1"] = User(id="user-1", email="dev@example.com")

    response = client.get("/me")

    assert response.status_code == 200
    assert response.json() == {"id": "user-1", "email": "dev@example.com"}


def test_me_missing_user_returns_null_email(client_and_db):
    client, _ = client_and_db

    response = client.get("/me")

    assert response.status_code == 200
    assert response.json() == {"id": "user-1", "email": None}


def test_cart_get_and_put(client_and_db):
    client, db = client_and_db

    response = client.get("/cart")
    assert response.status_code == 200
    assert response.json() == {"items": {}}

    response = client.put("/cart", json={"items": {"sku-1": 2}})
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert db.carts["user-1"].items == {"sku-1": 2}

    response = client.get("/cart")
    assert response.status_code == 200
    assert response.json() == {"items": {"sku-1": 2}}


def test_cart_put_invalid_input(client_and_db):
    client, _ = client_and_db

    response = client.put("/cart", json={"items": {"sku-1": "two"}})

    assert response.status_code == 422


def test_prefs_get_and_put(client_and_db):
    client, db = client_and_db
    db.preferences = [
        Preference(id=1, user_id="user-1", kind="note", value="fragile"),
        Preference(id=2, user_id="user-1", kind="avoid_brand", value="Acme"),
    ]

    response = client.get("/prefs")
    assert response.status_code == 200
    assert response.json() == [
        {"kind": "note", "value": "fragile"},
        {"kind": "avoid_brand", "value": "Acme"},
    ]

    response = client.put("/prefs", json=[{"kind": "note", "value": "gift wrap"}])
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert [(p.kind, p.value) for p in db.preferences] == [("note", "gift wrap")]


def test_prefs_put_invalid_input(client_and_db):
    client, _ = client_and_db

    response = client.put("/prefs", json=[{"kind": "note"}])

    assert response.status_code == 422


def test_orders_get_and_post(client_and_db):
    client, db = client_and_db
    first = Order(
        id=1,
        user_id="user-1",
        order_no="ORD-2",
        date="2026-07-25",
        subtotal=Decimal("10.00"),
        total=Decimal("12.00"),
        status="placed",
    )
    second = Order(
        id=2,
        user_id="user-1",
        order_no="ORD-1",
        date="2026-07-24",
        subtotal=Decimal("20.00"),
        total=Decimal("22.00"),
        status="paid",
    )
    db.orders = [first, second]
    db.order_items = {
        1: [
            OrderItem(
                id=1,
                order_id=1,
                product_id="sku-1",
                name="Widget",
                price=Decimal("10.00"),
                qty=1,
                warranty_years=2,
                consumable=None,
            )
        ],
        2: [],
    }

    response = client.get("/orders")
    assert response.status_code == 200
    assert response.json() == [
        {
            "orderNo": "ORD-1",
            "dateISO": "2026-07-24",
            "subtotal": 20.0,
            "total": 22.0,
            "status": "paid",
            "items": [],
        },
        {
            "orderNo": "ORD-2",
            "dateISO": "2026-07-25",
            "subtotal": 10.0,
            "total": 12.0,
            "status": "placed",
            "items": [
                {
                    "id": "sku-1",
                    "name": "Widget",
                    "price": 10.0,
                    "qty": 1,
                    "warrantyYears": 2,
                    "consumable": None,
                }
            ],
        },
    ]

    response = client.post(
        "/orders",
        json={
            "orderNo": "ORD-3",
            "dateISO": "2026-07-26",
            "subtotal": 30,
            "total": 33,
            "items": [
                {
                    "id": "sku-2",
                    "name": "Gadget",
                    "price": 30,
                    "qty": 1,
                    "warrantyYears": None,
                    "consumable": "no",
                }
            ],
        },
    )
    assert response.status_code == 200
    assert response.json() == {"id": 3}
    assert db.orders[-1].status == "placed"
    assert db.order_items[3][0].name == "Gadget"


def test_orders_post_invalid_input(client_and_db):
    client, _ = client_and_db

    response = client.post(
        "/orders",
        json={
            "orderNo": "ORD-4",
            "dateISO": "2026-07-26",
            "subtotal": 1,
            "total": 1,
            "items": [{"id": "sku-3"}],
        },
    )

    assert response.status_code == 422


def test_checkout_create_session_happy_path(monkeypatch, client_and_db):
    client, db = client_and_db
    db.carts["user-1"] = Cart(user_id="user-1", items={"sku-1": 2})

    class Session:
        url = "https://stripe.test/session"

    def fake_create(**kwargs):
        assert kwargs["mode"] == "payment"
        assert kwargs["client_reference_id"] == "user-1"
        assert kwargs["line_items"] == []
        return Session()

    monkeypatch.setattr("app.checkout.stripe.checkout.Session.create", fake_create)

    response = client.post("/checkout/create-session")

    assert response.status_code == 200
    assert response.json() == {"url": "https://stripe.test/session"}


def test_checkout_create_session_empty_cart(client_and_db):
    client, _ = client_and_db

    response = client.post("/checkout/create-session")

    assert response.status_code == 400
    assert response.json()["detail"] == "cart is empty"


def test_webhook_stripe_happy_path(monkeypatch, client_and_db):
    client, _ = client_and_db
    monkeypatch.setattr(
        "app.checkout.stripe.Webhook.construct_event",
        lambda payload, signature, secret: {"type": "checkout.session.completed"},
    )

    response = client.post("/webhooks/stripe", headers={"stripe-signature": "sig"}, content=b"{}")

    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_webhook_stripe_invalid_signature(monkeypatch, client_and_db):
    client, _ = client_and_db

    def boom(*args, **kwargs):
        raise Exception("bad signature")

    monkeypatch.setattr("app.checkout.stripe.Webhook.construct_event", boom)

    response = client.post("/webhooks/stripe", headers={"stripe-signature": "sig"}, content=b"{}")

    assert response.status_code == 400
    assert response.json()["detail"] == "invalid signature"


@pytest.mark.asyncio
async def test_get_current_user_dev_bypass(monkeypatch):
    monkeypatch.setattr(auth.settings, "dev_auth_bypass", True)
    assert await auth.get_current_user() == "dev-user"


@pytest.mark.asyncio
async def test_get_current_user_missing_bearer(monkeypatch):
    monkeypatch.setattr(auth.settings, "dev_auth_bypass", False)

    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user(None)

    assert exc.value.status_code == 401
    assert exc.value.detail == "missing bearer token"


@pytest.mark.asyncio
async def test_get_current_user_invalid_header(monkeypatch):
    monkeypatch.setattr(auth.settings, "dev_auth_bypass", False)
    monkeypatch.setattr(auth.jwt, "get_unverified_header", lambda token: (_ for _ in ()).throw(auth.JWTError()))

    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user("Bearer token")

    assert exc.value.status_code == 401
    assert exc.value.detail == "invalid token header"


@pytest.mark.asyncio
async def test_get_current_user_jwks_unavailable(monkeypatch):
    monkeypatch.setattr(auth.settings, "dev_auth_bypass", False)
    monkeypatch.setattr(auth.jwt, "get_unverified_header", lambda token: {"kid": "kid-1"})
    async def fetch_jwks():
        raise RuntimeError("offline")

    monkeypatch.setattr(auth, "_fetch_jwks", fetch_jwks)
    auth._jwks_cache = None
    auth._jwks_fetched_at = 0.0

    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user("Bearer token")

    assert exc.value.status_code == 503
    assert exc.value.detail == "auth keys unavailable"


@pytest.mark.asyncio
async def test_get_current_user_invalid_token(monkeypatch):
    monkeypatch.setattr(auth.settings, "dev_auth_bypass", False)
    monkeypatch.setattr(auth.settings, "auth_audience", "aud")
    monkeypatch.setattr(auth.settings, "auth_issuer", "iss")
    monkeypatch.setattr(auth.jwt, "get_unverified_header", lambda token: {"kid": "kid-1"})
    async def fetch_jwks():
        return {"keys": [{"kid": "kid-1"}]}

    def decode(*args, **kwargs):
        raise auth.JWTError()

    monkeypatch.setattr(auth, "_fetch_jwks", fetch_jwks)
    monkeypatch.setattr(auth.jwt, "decode", decode)
    auth._jwks_cache = None
    auth._jwks_fetched_at = 0.0

    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user("Bearer token")

    assert exc.value.status_code == 401
    assert exc.value.detail == "invalid token"


@pytest.mark.asyncio
async def test_get_current_user_missing_sub(monkeypatch):
    monkeypatch.setattr(auth.settings, "dev_auth_bypass", False)
    monkeypatch.setattr(auth.settings, "auth_audience", "aud")
    monkeypatch.setattr(auth.settings, "auth_issuer", "iss")
    monkeypatch.setattr(auth.jwt, "get_unverified_header", lambda token: {"kid": "kid-1"})
    async def fetch_jwks():
        return {"keys": [{"kid": "kid-1"}]}

    def decode(*args, **kwargs):
        return {}

    monkeypatch.setattr(auth, "_fetch_jwks", fetch_jwks)
    monkeypatch.setattr(auth.jwt, "decode", decode)
    auth._jwks_cache = None
    auth._jwks_fetched_at = 0.0

    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user("Bearer token")

    assert exc.value.status_code == 401
    assert exc.value.detail == "token missing sub"
