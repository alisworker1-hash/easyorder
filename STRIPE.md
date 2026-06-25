# Turning on real payments (Apple Pay + cards) with Stripe

EasyOrder ships in **demo mode**: when `data.json` → `meta.stripePublishableKey` is empty,
the Apple Pay button just shows a friendly confirmation and records the order locally — no
money moves. This file explains the two real options and the one important catch for a
**static** GitHub Pages site.

## The catch: Apple Pay on the web needs a server step
Apple Pay on the web requires **merchant validation**, which must happen on a server you
control — a pure static site can't do it alone. The good news: **Stripe handles all of it
for you** if you use **Stripe Checkout**, which automatically shows Apple Pay in Safari on
Apple devices once your domain is verified. You still need a tiny bit of server code (or a
no-code Payment Link) to create the payment — but you never touch merchant validation,
card data, or PCI scope yourself.

---

## Option A — No server at all: Stripe Payment Links (simplest)
Best if you sell a **fixed set of bundles** rather than fully dynamic carts.

1. In the Stripe Dashboard, create a **Product + Price**, then a **Payment Link** for it.
2. Apple Pay shows automatically on the Stripe-hosted page (no domain verification needed —
   it's on `stripe.com`).
3. In `app.js`, point the checkout button at the Payment Link URL.

Trade-off: a Payment Link is a fixed amount, so it doesn't map cleanly to an arbitrary cart
total. Fine for "reorder my usual box" style bundles; not ideal for a free-form cart.

---

## Option B — Dynamic cart: one small serverless function (recommended)
Best for real carts where the total varies. You need exactly one HTTPS endpoint that
creates a Checkout Session. GitHub Pages can't run server code, so host the function on a
free serverless platform and call it from the static site.

### 1. Set your publishable key
In `data.json`:
```json
"meta": { "stripePublishableKey": "pk_live_xxx", ... }
```
The moment this is non-empty, `app.js` switches from demo mode to `startStripeCheckout()`.

### 2. Create the serverless endpoint `POST /create-checkout-session`
Host on Cloudflare Workers, Vercel, Netlify Functions, or AWS Lambda. It receives the cart
and returns a Checkout Session URL. Keep your **secret** key (`sk_live_...`) only here —
never in the static site. Example (Node / Vercel):

```js
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const { items } = req.body; // [{ name, unit, price, qty }]
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: items.map(i => ({
      quantity: i.qty,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(i.price * 100), // cents — exact, no rounding drift
        product_data: { name: `${i.name} (${i.unit})` },
      },
    })),
    // Apple Pay appears automatically in Checkout on verified Apple devices:
    payment_method_types: ["card"],
    success_url: "https://YOURDOMAIN/?paid=1",
    cancel_url:  "https://YOURDOMAIN/?canceled=1",
  });
  res.json({ url: session.url });
}
```

### 3. Wire the static site to it
`app.js` already contains a clearly-marked `startStripeCheckout(items)` stub. Point it at
your endpoint:
```js
const r = await fetch("https://YOUR-FUNCTION-HOST/create-checkout-session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items }),
});
const { url } = await r.json();
window.location = url; // Stripe Checkout — Apple Pay shows here in Safari
```

### 4. Verify your domain for Apple Pay
In Stripe Dashboard → **Settings → Payments → Apple Pay**, add and verify your domain
(Stripe gives you a file to host at `/.well-known/apple-developer-merchantid-domain-association`
— you *can* host that one file on GitHub Pages). After that, Apple Pay shows in Checkout for
your customers on iPhone/iPad/Mac Safari.

---

## Recommendation
Start in **demo mode** (already on) to validate the experience with real users. When ready
to charge, use **Option B** — it keeps prices exact (amounts sent in integer cents), keeps
your secret key off the static site, and gets Apple Pay "for free" through Stripe Checkout.
