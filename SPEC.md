# EasyOrder — build spec

A **static** procurement website (plain HTML/CSS/JS, NO build step, NO framework, NO npm).
Deployed on GitHub Pages from the repo root, exactly like the sibling project `dupecheck`.
Files are loaded directly by the browser. `data.json` is fetched at runtime.

## Product
EasyOrder lets people reorder **home & everyday essentials** (groceries, household, personal
care, health & mobility). The audience is **older / less tech-savvy shoppers**, so the #1
design requirement is **clarity and ease of use**. Apple-Pay-style one-tap checkout.

## Non-negotiable design principles (senior-friendly)
1. **Large type** — base font 20px, headings bigger. A built-in **Text size** control (A / A+ / A++)
   that scales the whole page and is remembered (localStorage `eo.textSize`).
2. **High contrast**, simple flat layout, generous whitespace. No tiny gray-on-gray text.
3. **Big tap targets** — every button/link min 52px tall, lots of padding.
4. **Plain language** — "Add to cart", "Pay now", "You usually buy this". No jargon.
5. **Obvious focus states**, full keyboard support, ARIA labels, `prefers-reduced-motion` respected.
6. One clear primary action per screen. Confirmations are friendly and explicit.
7. Works great on phone AND desktop (responsive, single column on mobile).

## Files (you, Codex, write these three; do NOT touch data.json — it is generated separately)
- `index.html` — semantic structure, Google Font "Inter" (already the dupecheck choice), links `style.css?v=1` and `app.js?v=1`.
- `style.css` — CSS variables for theming, light theme, accessible sizes, responsive grid, cart drawer, modals, the "Looking out for you" panel, Apple Pay button.
- `app.js` — all logic (vanilla, no deps). Use the same lightweight idioms as dupecheck:
  a `$`/`$$` helper, an `esc()` HTML-escaper, template-literal rendering, event delegation, `localStorage`.

## Data contract (`data.json`)  — read this shape, do not generate it
```json
{
  "meta": {
    "brand": "EasyOrder",
    "tagline": "Home essentials, reordered the easy way.",
    "updated": "2026-06-24",
    "currency": "USD",
    "freeDeliveryOver": 35,
    "deliveryFee": 4.99,
    "monthlyBudgetDefault": 250,
    "stripePublishableKey": ""    // "" => DEMO mode (no real charge). If set => real Stripe Checkout.
  },
  "categories": [
    { "id": "grocery",   "label": "Groceries",        "icon": "🛒" },
    { "id": "household", "label": "Household",         "icon": "🧻" },
    { "id": "personal",  "label": "Personal Care",     "icon": "🧼" },
    { "id": "health",    "label": "Health & Mobility", "icon": "💊" }
  ],
  "products": [
    {
      "id": "milk-2pct-gal",
      "name": "2% Milk",
      "brand": "Meadow Fresh",
      "category": "grocery",
      "unit": "1 gallon (3.78 L)",
      "price": 3.79,
      "priceWas": 3.49,         // optional previous price. price>priceWas => went UP, price<priceWas => DROP
      "emoji": "🥛",
      "image": "",               // optional CDN URL; if empty/loads-fail show the emoji on a soft tile
      "stock": "in",            // "in" | "low" | "out"
      "stockNote": "",          // e.g. "Only 3 left" when low
      "reorderDays": 7,          // typical days between repurchases -> drives reorder reminders
      "deliveryNote": "",       // optional e.g. "Ships in 2 days"
      "popular": true
    }
  ]
}
```

## Required features in app.js

### 1. Catalog
- Big category tiles (from `data.categories`) + an "All" tile, with item counts.
- Large search box (filters by name/brand/tag, case-insensitive).
- Responsive product grid. Each card shows: image-or-emoji tile, name, brand, **unit**, and **price always with 2 decimals** (`$3.79`).
- **Price accuracy is a headline feature**: never round prices; always show exact `price.toFixed(2)`.
  If `priceWas` exists and differs, show a small badge: green "▼ Price drop, was $X.XX" or amber "▲ Up from $X.XX".
- Stock badge: green "In stock", amber "Low — {stockNote}", red "Out of stock" (Out = disable Add).
- Quantity stepper (− / qty / +) and a big **Add to cart** button per card.

### 2. Cart (slide-in drawer or modal)
- Line items with name, unit, unit price, qty stepper, line total, remove (×).
- Subtotal, delivery fee (free when subtotal ≥ `freeDeliveryOver`, else `deliveryFee`; show "Add $X.XX for free delivery"), **Total**.
- Persist cart in `localStorage` (`eo.cart`).
- Cart count badge on the header cart button.

### 3. "Looking out for you" proactive panel  (the differentiator — show ABOVE the grid)
Generate friendly, dismissable cards from these rules:
- **Reorder reminders**: keep a purchase history in `localStorage` (`eo.history` = `{ [productId]: lastBoughtISO }`).
  Seed a realistic demo history on first load (a few staple items bought N days ago) so reminders appear immediately.
  If `today - lastBought >= reorderDays`, show "You usually buy **{name}** about every {reorderDays} days — running low? [Add to cart]".
- **Price-change alerts**: for items with `priceWas`, show "**{name}** {dropped/rose} from $was to $now". Drops first, framed as savings.
- **Delivery & stock pre-emption**: if any cart item (or a popular staple) is `low`/`out` or has a `deliveryNote`, warn early:
  "Heads up: **{name}** is low in stock — order soon" / "**{name}** ships in 2 days, add it now so it arrives with your order".
- **Budget guardrail**: monthly budget (default `monthlyBudgetDefault`, editable, stored `eo.budget`). Show a progress bar of
  this order vs budget. If the cart pushes over budget, gentle amber notice "This order is $X over your $Y budget". Confirm large orders.

Each proactive card has a clear action (Add / Dismiss / Adjust budget). Dismissed ids stored in `eo.dismissed`.

### 4. Checkout + Apple Pay  (Stripe-ready, demo now)
- A prominent **black "Pay with  Apple Pay" button** (Apple logo glyph ``, white text) plus a secondary "Pay another way" button.
- `checkout()` logic:
  - If `meta.stripePublishableKey` is empty → **DEMO mode**: show a friendly confirmation modal with the full order summary,
    an order number, and "we'll text you when it's on the way", then clear the cart and record purchases into `eo.history`.
  - If a key is present → load Stripe.js and call a `startStripeCheckout(items)` function (leave a clearly-commented stub that
    posts the cart to a `/create-checkout-session` endpoint and redirects — real wiring documented in STRIPE.md).
  - Keep the two paths cleanly separated so flipping to real Stripe is a one-line config change.
- Apple Pay button only needs to *look* native and be obvious; do not fake a real Apple Pay sheet.

### 5. Accessibility & polish
- All interactive elements keyboard reachable; Escape closes drawers/modals; focus trapped in open dialogs; focus returned on close.
- `aria-live="polite"` region announces "Added to cart", price/stock warnings.
- Respect `prefers-reduced-motion`. Semantic landmarks (`header`, `main`, `nav`, `footer`).
- Graceful empty states. If `data.json` fails to load, show a friendly message (mention running a local server).

## Style direction
Warm, trustworthy, calm. Suggested palette (use CSS vars): primary green `#0f9d76` (matches the EasyOrder/dupecheck family),
ink `#1d2433`, soft bg `#f6f8f7`, card `#ffffff`, amber `#c97a16`, danger `#c0392b`. Rounded corners ~14px, soft shadows.
Apple Pay button pure black `#000`. Keep it friendly, not clinical.
