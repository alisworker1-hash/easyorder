# EasyOrder

**Home essentials, reordered the easy way.** A deliberately simple, senior-friendly
procurement website for groceries, household goods, personal care, and health & mobility
items. Built as a **static site** (plain HTML/CSS/JS, no build step) and deployed on
GitHub Pages — same approach as the sibling `dupecheck` project.

## Why it's different from a plain chatbot
- **Exact prices, always.** Every price is shown to the cent (`$3.79`, never "about $4").
  Price changes are flagged up front — green when something dropped, amber when it rose.
- **It looks out for you.** A "Looking out for you" panel anticipates problems *before*
  checkout: reorder reminders based on how often you buy something, price-change alerts,
  low-stock / delivery warnings, and a monthly budget guardrail.
- **One-tap checkout.** A prominent Apple Pay button (Stripe-ready) for fast, familiar payment.
- **A real AI helper.** "Ask EasyOrder" is a chat assistant *grounded in the catalog* — it
  quotes real prices and can actually add items and open the cart for checkout. Runs in a
  grounded demo today; connect Fireworks AI for full conversation (see [AI.md](AI.md)).

## Accessibility first (built for older / less tech-savvy shoppers)
- Large base type with a **Text size** control (A / A+ / A++), remembered between visits.
- High contrast, big tap targets (≥52px), plain language, one clear action per screen.
- Full keyboard support, screen-reader labels, `aria-live` announcements, reduced-motion support.

## Run it locally
It fetches `data.json`, so open it through a local web server (not `file://`):

```bash
cd easyorder
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files
| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `style.css`  | All styling / theming (CSS variables) |
| `app.js`     | Catalog, cart, proactive panel, checkout |
| `assistant.js` | The "Ask EasyOrder" AI shopping assistant (grounded + tool-calling) |
| `data.json`  | The product catalog + store settings (edit this to change products/prices) |
| `proxy/`     | Cloudflare Worker that holds your Fireworks key (for the live AI) |
| `STRIPE.md`  | How to turn on real Apple Pay / card payments via Stripe |
| `AI.md`      | How to connect the AI assistant to Fireworks AI |

## Editing the catalog
Everything shoppers see comes from `data.json`. Each product:

```json
{
  "id": "milk-2pct-gal", "name": "2% Milk", "brand": "Meadow Fresh",
  "category": "grocery", "unit": "1 gallon", "price": 3.79, "priceWas": 3.49,
  "emoji": "🥛", "image": "", "stock": "in", "stockNote": "",
  "reorderDays": 7, "deliveryNote": "", "popular": true
}
```
- `price` / `priceWas` drive the exact-price display and the price-change badges.
- `reorderDays` powers the "you usually buy this every N days" reminders.
- `stock` (`in` / `low` / `out`) + `stockNote` and `deliveryNote` drive the heads-up warnings.
- `image` can be a product photo URL; if empty or it fails to load, the `emoji` shows on a soft tile.

Store-wide settings live in `data.json` → `meta` (delivery fee, free-delivery threshold,
default monthly budget, and your Stripe publishable key).

## Going live with payments
The site ships in **demo mode** (`meta.stripePublishableKey` is empty): checkout shows a
friendly confirmation, no real charge. To take real Apple Pay / card payments, see
[STRIPE.md](STRIPE.md).

## Deploy (GitHub Pages)
```bash
git add -A && git commit -m "EasyOrder site"
git branch -M main
git remote add origin https://github.com/alisworker1-hash/easyorder.git
git push -u origin main
```
Then in the repo: **Settings → Pages → Deploy from branch → `main` / root**. The included
`.nojekyll` file makes GitHub Pages serve everything as-is.

---
Built as a demo. Prices and products are illustrative — replace `data.json` with your real catalog.
