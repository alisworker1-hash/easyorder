# EasyOrder — Stage 1 backend (groundwork, not yet active)

> **Status: scaffold only.** `main` still runs fully on static + localStorage. This backend is
> built and waiting on the `stage1-backend` branch so it's ready the day a trigger fires.

## Don't turn this on yet — wait for a real trigger
Activate Stage 1 only when one of these is actually true (per SCALING-COMPLIANCE.md):
- A user asks "why isn't my cart on my phone?" (you need cross-device state), **or**
- you take a real Stripe payment and need an order record that survives a cleared browser, **or**
- you launch accounts.

Until then, localStorage is the correct, cheapest answer. Building a backend earlier just adds
cost and an attack surface for no user benefit.

## The one rule that must not break
**The decision engine (`scoreDecision`) stays in the browser.** The backend persists *state* and
handles *payments* — it never scores or prices. This keeps every recommendation auditable,
zero-latency, and out of any server/model path (also a compliance asset). The backend's only jobs:

| Concern | Where it lives after Stage 1 |
|---|---|
| Scoring / recommend / confidence / cost-to-own | **Browser** (unchanged) |
| Catalog (`data.json`) | **CDN/static** (unchanged; later a `/catalog` API at Stage 3) |
| Cart, preferences, orders, account | **Backend** (moves off localStorage) |
| Payments (Stripe session + webhook) | **Backend** |
| Auth | **Managed provider** (Clerk / Auth0 / Supabase) — never our own passwords |

## Data model (mirrors the current localStorage shapes 1:1)
The frontend already stores exactly these — migration is a straight copy:

| localStorage key | Backend table | Shape |
|---|---|---|
| `eo.cart` | `cart` | `{ user_id, items: {productId: qty}, updated_at }` |
| `eo.prefs` | `preference` | rows of `{ user_id, kind, value }` |
| `eo.orders` | `order` + `order_item` | order: `{order_no, date, subtotal, total, status}`; items: `{product_id, name, price, qty, warranty_years?, consumable?}` |
| (auth) | `user` | `{ id = provider 'sub', email, created_at }` |

`eo.history`/`eo.budget`/`eo.dismissed` can stay client-only or move later; they're not load-bearing.

## API contract (all state routes require auth, scoped to the user)
```
GET  /health
GET  /me                      -> { id, email }
GET  /cart                    -> { items: {id: qty} }
PUT  /cart        { items }    -> 200            (replace the user's cart)
GET  /prefs                   -> [{ kind, value }]
PUT  /prefs       [ ... ]      -> 200
GET  /orders                  -> [ order... ]
POST /orders      { order }    -> { id }          (record a placed order)
POST /checkout/create-session  -> { url }         (Stripe Checkout; sk_live stays server-side)
POST /webhooks/stripe          -> 200             (verify signature; mark order paid)
```

## Auth: managed provider, never our own passwords
Use **Clerk, Auth0, or Supabase Auth**. The frontend gets a JWT from the provider; the backend's
`get_current_user` dependency verifies it against the provider's JWKS (issuer/audience/JWKS URL in
env) and returns `sub` (the user id). We never see or store a password — the most common breach
path, eliminated by construction. A clearly-flagged `DEV_AUTH_BYPASS` exists for local dev only.

## Stripe: the frontend's existing stub becomes the first real route
`app.js`'s `startStripeCheckout()` already POSTs to `/create-checkout-session` when
`meta.stripePublishableKey` is set. That POST now hits the backend, which creates a Stripe
Checkout Session with `STRIPE_SECRET_KEY` (server-only) and returns the hosted URL (Apple Pay shows
up there automatically). The `/webhooks/stripe` route verifies the signature and marks the order
paid. **Card numbers never touch us → PCI stays at the lightest tier (SAQ-A).**

## Frontend migration: one storage seam, flipped by a flag (no rewrite)
Today, app.js reads/writes localStorage directly (`LS.get`/`LS.set`). Introduce a tiny `storage`
seam so the swap is a one-line flag, and the engine/UI never change:

```js
// storage.js  (sketch — not wired into the live app yet)
const API = window.EO_API_BASE; // e.g. set once you deploy the backend; unset = localStorage mode
const authHeader = () => ({ Authorization: `Bearer ${window.EO_TOKEN || ""}` });

export const Store = {
  async getCart() {
    if (!API) return LS.get("eo.cart", {});
    return (await fetch(`${API}/cart`, { headers: authHeader() }).then(r => r.json())).items;
  },
  async setCart(items) {
    if (!API) return LS.set("eo.cart", items);
    await fetch(`${API}/cart`, { method: "PUT", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
  },
  // ...same shape for prefs and orders
};
```
- **Unset `EO_API_BASE` → unchanged localStorage behavior** (today's product).
- **Set it → the same calls hit the backend.** The decision engine, cards, and cart math are untouched.
- **On first login, migrate:** read any existing localStorage cart/prefs/orders and `PUT` them up once, so a returning shopper keeps their data.

## Security checklist (review before activating)
- [ ] Managed auth only; **zero** password storage. JWT verified against JWKS (sig + iss + aud + exp).
- [ ] Every state query scoped to `current_user.id` (no IDOR — a user can never read another's cart/orders).
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` server-side only; webhook signature verified.
- [ ] CORS locked to the real site origin(s) only.
- [ ] Parameterized ORM queries only (no string-built SQL).
- [ ] Per-user/IP rate limiting on write + checkout routes.
- [ ] HTTPS only; secure/HttpOnly cookies if you use cookie sessions.
- [ ] Server-side validation: never trust client prices/totals for fulfillment — recompute the
      order total from the catalog server-side before creating the Stripe session.

## Compliance obligations this stage triggers (see SCALING-COMPLIANCE.md)
Storing names/emails/orders server-side switches on privacy law **immediately**, even while tiny:
- [ ] Publish a **privacy policy**; establish a lawful basis.
- [ ] Build **DSAR** endpoints (export + delete a user's data).
- [ ] If you store identity-linked *health-purchase* history → see a privacy lawyer first
      (heightened-sensitivity rules in some states, even though HIPAA still doesn't apply).
- [ ] PCI: complete the SAQ-A self-assessment with Stripe.

## Deploy & cost
- **Backend:** Railway / Render / Fly.io (one container) — ~$5–20/mo.
- **Postgres:** Supabase / Neon / Railway managed — ~$0–25/mo at this size.
- **Frontend:** stays on Pages/Cloudflare (static).
- **Auth:** Clerk/Auth0/Supabase free tiers cover early scale.
- **Total Stage 1:** ~$20–50/mo, only once a trigger justifies it.

## How to run the scaffold locally (when you're ready)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill DATABASE_URL, auth, Stripe
uvicorn app.main:app --reload
# open http://localhost:8000/health and http://localhost:8000/docs
```
