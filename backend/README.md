# EasyOrder backend (Stage 1 — groundwork, NOT yet wired to the frontend)

A thin FastAPI service that persists **state** (cart, preferences, orders, account) and handles
**payments** (Stripe). It does **not** score, price, or recommend — the decision engine stays in
the browser (`scoreDecision` in `assistant.js`). See `../STAGE1-BACKEND.md` for the full design,
the frontend migration path, and the security + compliance checklists.

> Don't deploy this until a real Stage-1 trigger fires (cross-device cart, real payments, or
> accounts). Until then the static site + localStorage is the correct, cheapest setup.

## Layout
```
app/
  main.py        FastAPI app, CORS, /health, router wiring
  config.py      env-driven settings (pydantic-settings)
  db.py          async SQLAlchemy engine + session
  models.py      User, Cart, Preference, Order, OrderItem
  schemas.py     Pydantic shapes — mirror the frontend localStorage 1:1
  auth.py        get_current_user: verifies a managed-provider JWT (JWKS); dev bypass flag
  routes.py      /me, /cart, /prefs, /orders  (auth-required, scoped to the user)
  checkout.py    /checkout/create-session, /webhooks/stripe  (Stripe; sk_live server-side only)
```

## Run locally
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill DATABASE_URL, auth, Stripe

# Quick local spin-up without a real auth provider:
#   set DEV_AUTH_BYPASS=1 in .env (uses a fixed dev user + auto-creates tables)
uvicorn app.main:app --reload
# http://localhost:8000/health   and   http://localhost:8000/docs
```

## Before going to production (see STAGE1-BACKEND.md for the full checklist)
- Wire a real managed auth provider (Clerk / Auth0 / Supabase); set `DEV_AUTH_BYPASS=0`.
- Replace dev `create_all()` with **Alembic** migrations (`alembic init alembic`).
- In `checkout.py`, build Stripe `line_items` from **trusted catalog prices**, not client input.
- Run the Stripe checkout SDK call off the event loop (threadpool).
- Lock `ALLOWED_ORIGINS`; add per-user/IP rate limiting; add DSAR (export/delete) endpoints.
- Publish a privacy policy (storing personal data triggers GDPR/CCPA immediately).
