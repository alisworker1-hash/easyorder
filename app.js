/* EasyOrder — all app logic. Vanilla JS, no dependencies.
   Reads data.json at runtime. State persists in localStorage. */

"use strict";

/* ---------------- tiny helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* Money is ALWAYS shown to the exact cent — never rounded or abbreviated. */
const money = (n) => "$" + Number(n).toFixed(2);
const DAY = 86400000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / DAY);
const daysAgoISO = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

/* ---------------- persistence ---------------- */
const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

/* ---------------- state ---------------- */
let DATA = { meta: {}, categories: [], products: [] };
let PRODUCTS = {};            // id -> product
let cart = LS.get("eo.cart", {});        // id -> qty
let history = LS.get("eo.history", null); // id -> lastBoughtISO
let budget = LS.get("eo.budget", null);   // monthly budget number
let dismissed = LS.get("eo.dismissed", []); // proactive card keys
let activeCat = "all";
let searchQuery = "";
let lastFocus = null;         // restore focus after closing dialogs

/* ---------------- accessibility announce ---------------- */
function announce(msg) {
  const live = $("#live");
  if (!live) return;
  live.textContent = "";
  // force re-announce even if text repeats
  setTimeout(() => { live.textContent = msg; }, 30);
}

/* ---------------- text size ---------------- */
function applyTextSize(size) {
  document.documentElement.dataset.size = size;
  LS.set("eo.textSize", size);
  $$(".ts-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.size === size)));
}

/* ---------------- cart math ---------------- */
const cartItems = () =>
  Object.entries(cart)
    .filter(([id, q]) => PRODUCTS[id] && q > 0)
    .map(([id, q]) => ({ ...PRODUCTS[id], qty: q }));
const cartCount = () => Object.values(cart).reduce((a, q) => a + q, 0);
const subtotal = () => cartItems().reduce((a, p) => a + p.price * p.qty, 0);
function deliveryFee() {
  const sub = subtotal();
  if (sub <= 0) return 0;
  return sub >= (DATA.meta.freeDeliveryOver ?? Infinity) ? 0 : (DATA.meta.deliveryFee || 0);
}
const cartTotal = () => subtotal() + deliveryFee();

function saveCart() { LS.set("eo.cart", cart); }

function addToCart(id, qty = 1) {
  const p = PRODUCTS[id];
  if (!p || p.stock === "out") return;
  cart[id] = (cart[id] || 0) + qty;
  saveCart();
  updateCartBadge();
  renderCart();
  renderProactive();
  announce(`Added ${qty} ${p.name} to your cart. Cart now has ${cartCount()} item${cartCount() === 1 ? "" : "s"}.`);
}
function setCartQty(id, qty) {
  if (qty <= 0) delete cart[id]; else cart[id] = qty;
  saveCart(); updateCartBadge(); renderCart(); renderProactive();
}

/* ---------------- categories ---------------- */
function catLabel(id) { return (DATA.categories.find((c) => c.id === id) || {}).label || id; }

function renderCategories() {
  const counts = { all: DATA.products.length };
  DATA.products.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
  const tiles = [{ id: "all", label: "All items", icon: "🗂️" }, ...DATA.categories];
  $("#categories").innerHTML = tiles.map((c) => `
    <button class="cat-tile ${c.id === activeCat ? "active" : ""}" data-cat="${esc(c.id)}"
            aria-pressed="${c.id === activeCat}">
      <span class="cat-emoji" aria-hidden="true">${esc(c.icon)}</span>
      <span class="cat-label">${esc(c.label)}</span>
      <span class="cat-count">${counts[c.id] || 0} item${(counts[c.id] || 0) === 1 ? "" : "s"}</span>
    </button>`).join("");
}

/* ---------------- product cards ---------------- */
function priceTag(p) {
  if (p.priceWas == null || p.priceWas === p.price) return "";
  const drop = p.price < p.priceWas;
  return `<span class="price-tag ${drop ? "drop" : "up"}">${drop ? "▼ price drop" : "▲ price up"}</span>`;
}
function thumbBadge(p) {
  if (p.priceWas != null && p.priceWas !== p.price)
    return p.price < p.priceWas
      ? `<span class="thumb-badge drop">Save ${money(p.priceWas - p.price)}</span>`
      : `<span class="thumb-badge up">Price up</span>`;
  return "";
}
function stockLine(p) {
  if (p.stock === "out") return `<span class="stock-line out">● Out of stock${p.stockNote ? " — " + esc(p.stockNote) : ""}</span>`;
  if (p.stock === "low") return `<span class="stock-line low">● Low stock${p.stockNote ? " — " + esc(p.stockNote) : ""}</span>`;
  return `<span class="stock-line in">● In stock</span>`;
}
function thumb(p) {
  // Emoji-only tiles — no scraped product photos (they were unreliable and mislabeled).
  return `<div class="product-thumb"><span class="thumb-emoji" aria-hidden="true">${esc(p.emoji || "📦")}</span>${thumbBadge(p)}</div>`;
}
// A real-photo link: opens a web search for the item so shoppers can see the actual product.
function viewLink(p) {
  const q = encodeURIComponent(`${p.brand} ${p.name}`.trim());
  return `<a class="view-link" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener noreferrer">🔎 See real photos</a>`;
}
function productCard(p) {
  const out = p.stock === "out";
  // Only show the struck "was" price for genuine drops (a deal) — not for increases.
  const wasLine = (p.priceWas != null && p.price < p.priceWas)
    ? `<span class="price-was">was ${money(p.priceWas)}</span>` : "";
  return `
  <article class="product" data-id="${esc(p.id)}">
    ${thumb(p)}
    <div class="product-body">
      <span class="product-brand">${esc(p.brand)}</span>
      <h3 class="product-name">${esc(p.name)}</h3>
      <span class="product-unit">${esc(p.unit)}</span>
      <div class="price-row">
        <span class="price-now">${money(p.price)}</span>
        ${wasLine}${priceTag(p)}
      </div>
      ${stockLine(p)}
      ${viewLink(p)}
      <div class="product-foot">
        <div class="qty" role="group" aria-label="Quantity for ${esc(p.name)}">
          <button type="button" data-step="-1" data-id="${esc(p.id)}" aria-label="Decrease quantity" ${out ? "disabled" : ""}>−</button>
          <output id="qty-${esc(p.id)}">1</output>
          <button type="button" data-step="1" data-id="${esc(p.id)}" aria-label="Increase quantity" ${out ? "disabled" : ""}>+</button>
        </div>
        <button class="btn btn-primary btn-block" data-add="${esc(p.id)}" ${out ? "disabled" : ""}>
          ${out ? "Out of stock" : "Add to cart"}
        </button>
      </div>
    </div>
  </article>`;
}

function visibleProducts() {
  let list = activeCat === "all" ? DATA.products : DATA.products.filter((p) => p.category === activeCat);
  const q = searchQuery.trim().toLowerCase();
  if (q) list = list.filter((p) =>
    (p.name + " " + p.brand + " " + (p.tags || []).join(" ")).toLowerCase().includes(q));
  return list;
}

function renderGrid() {
  const list = visibleProducts();
  if (!list.length) {
    $("#grid").innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji" aria-hidden="true">🔍</div>
        <p>No products found${searchQuery.trim() ? ` for “${esc(searchQuery)}”` : " here"}. Try another word or category.</p>
      </div>`;
    $("#resultsNote").textContent = "";
    return;
  }
  $("#grid").innerHTML = list.map(productCard).join("");
  $("#resultsNote").textContent =
    `Showing ${list.length} item${list.length === 1 ? "" : "s"}${activeCat === "all" ? "" : " in " + catLabel(activeCat)}${searchQuery.trim() ? ` matching “${searchQuery}”` : ""}.`;
}

/* per-card quantity (UI only until "Add") */
function cardQty(id) { const o = $(`#qty-${CSS.escape(id)}`); return o ? Math.max(1, parseInt(o.textContent, 10) || 1) : 1; }

/* ---------------- proactive "looking out for you" engine ---------------- */
function seedHistoryIfNeeded() {
  if (history && typeof history === "object") return;
  // First visit: seed a believable purchase history so reorder reminders are useful immediately.
  history = {};
  const seed = {
    "milk-2pct-gal": 9, "bread-whole-wheat": 8, "eggs-large-dozen": 12,
    "toilet-paper-12": 34, "dish-soap": 50, "toothpaste-2pk": 48,
  };
  for (const [id, ago] of Object.entries(seed)) if (PRODUCTS[id]) history[id] = daysAgoISO(ago);
  LS.set("eo.history", history);
}

function buildProactive() {
  // Keep the panel calm: each product appears in AT MOST ONE card, and each type is
  // capped. Priority = most urgent first: stock/delivery, then reorder, then savings.
  const cards = [];
  const used = new Set();
  const CAP = { stock: 2, reorder: 3, price: 2 };

  /* 1. Delivery & stock pre-emption — warn before checkout, not after. */
  const watch = DATA.products.filter((p) =>
    (p.popular || cart[p.id]) && (p.stock === "low" || p.stock === "out" || p.deliveryNote));
  for (const p of watch) {
    if (used.has(p.id) || cards.filter((c) => c.type === "stock").length >= CAP.stock) break;
    if (p.stock === "out") {
      cards.push({ key: "stock:" + p.id, type: "stock", out: true, emoji: "⏳",
        title: `${p.name} is out of stock`,
        body: `${p.stockNote || "Temporarily unavailable"}. We'll keep it on your list — check back soon.`, action: null });
    } else if (p.stock === "low") {
      cards.push({ key: "stock:" + p.id, type: "stock", emoji: "⚠️",
        title: `${p.name} is running low`,
        body: `${p.stockNote || "Only a few left"} — order soon so you don't miss it.`,
        action: { label: `Add ${p.name}`, addId: p.id } });
    } else {
      cards.push({ key: "stock:" + p.id, type: "stock", emoji: "🚚",
        title: `${p.name}: ${p.deliveryNote}`,
        body: `Add it now so everything arrives together.`,
        action: { label: `Add ${p.name}`, addId: p.id } });
    }
    used.add(p.id);
  }

  /* 2. Reorder reminders — based on how often the shopper buys something. Most overdue first. */
  const due = [];
  for (const [id, iso] of Object.entries(history || {})) {
    const p = PRODUCTS[id];
    if (!p || used.has(id) || cart[id] || !p.reorderDays || p.reorderDays <= 0) continue;
    const since = daysSince(iso);
    if (since >= p.reorderDays) due.push({ p, since });
  }
  due.sort((a, b) => (b.since - b.p.reorderDays) - (a.since - a.p.reorderDays));
  for (const { p, since } of due.slice(0, CAP.reorder)) {
    cards.push({ key: "reorder:" + p.id, type: "reorder", emoji: p.emoji || "🔁",
      title: `Time to restock ${p.name}?`,
      body: `You usually buy this about every ${p.reorderDays} days — it's been ${since}. Add it so you don't run out.`,
      action: { label: `Add ${p.name}`, addId: p.id } });
    used.add(p.id);
  }

  /* 3. Price drops — framed as savings (biggest first). Price *increases* are flagged on the
        product card itself, so the panel stays positive and uncluttered. */
  const drops = DATA.products
    .filter((p) => p.priceWas != null && p.price < p.priceWas && !used.has(p.id))
    .sort((a, b) => (b.priceWas - b.price) - (a.priceWas - a.price));
  for (const p of drops.slice(0, CAP.price)) {
    cards.push({ key: "price:" + p.id, type: "price", emoji: "🏷️",
      title: `${p.name} is cheaper now`,
      body: `Dropped from ${money(p.priceWas)} to ${money(p.price)} — that's ${money(p.priceWas - p.price)} saved.`,
      action: { label: `Add & save ${money(p.priceWas - p.price)}`, addId: p.id } });
    used.add(p.id);
  }

  return cards.filter((c) => !dismissed.includes(c.key));
}

function budgetCard() {
  const b = budget || DATA.meta.monthlyBudgetDefault || 0;
  const spent = subtotal();
  const pct = b > 0 ? Math.min(100, Math.round((spent / b) * 100)) : 0;
  const over = b > 0 && spent > b;
  return `
  <div class="pcard budget ${over ? "over" : ""}">
    <div class="pcard-top">
      <span class="pcard-title"><span class="pcard-emoji" aria-hidden="true">${over ? "🛟" : "🎯"}</span> Monthly budget</span>
      <button class="btn btn-ghost btn-small" data-budget-edit>Adjust</button>
    </div>
    <div class="meter ${over ? "over" : ""}" role="img" aria-label="This order is ${money(spent)} of your ${money(b)} budget">
      <span style="width:${pct}%"></span>
    </div>
    <div class="budget-line"><span>This order: <b>${money(spent)}</b></span><span>Budget: ${money(b)}</span></div>
    ${over ? `<p>This order is ${money(spent - b)} over your monthly budget. Want to remove anything?</p>` : ""}
  </div>`;
}

function renderProactive() {
  const panel = $("#proactive");
  if (!panel) return; // proactive panel intentionally removed in the calm redesign
  const cards = buildProactive();
  const html = cards.map((c) => {
    const cls = c.type + (c.up ? " up" : "") + (c.out ? " out" : "");
    const act = c.action
      ? `<button class="btn btn-primary btn-small" data-add="${esc(c.action.addId)}">${esc(c.action.label)}</button>` : "";
    return `
    <div class="pcard ${cls}">
      <div class="pcard-top">
        <span class="pcard-title"><span class="pcard-emoji" aria-hidden="true">${esc(c.emoji)}</span> ${esc(c.title)}</span>
        <button class="pcard-dismiss" data-dismiss="${esc(c.key)}" aria-label="Dismiss this reminder">✕</button>
      </div>
      <p>${esc(c.body)}</p>
      ${act ? `<div class="pcard-actions">${act}</div>` : ""}
    </div>`;
  }).join("");
  $("#proactiveCards").innerHTML = html + budgetCard();
  panel.hidden = false; // budget card always present, so panel is always shown
}

/* ---------------- cart drawer ---------------- */
function updateCartBadge() {
  const n = cartCount();
  const el = $("#cartCount");
  el.textContent = n;
  el.style.display = n ? "" : "none";
}

function renderCart() {
  const items = cartItems();
  const body = $("#cartBody");
  const foot = $("#cartFoot");
  if (!items.length) {
    body.innerHTML = `<div class="cart-empty"><p style="font-size:2.4rem" aria-hidden="true">🛍️</p>
      <p>Your cart is empty.</p><p>Add items and they'll show up here.</p></div>`;
    foot.innerHTML = `<button class="btn btn-ghost btn-block" data-close-cart>Keep shopping</button>`;
    return;
  }
  body.innerHTML = items.map((p) => `
    <div class="cart-line">
      <div class="cart-line-emoji" aria-hidden="true">${esc(p.emoji || "📦")}</div>
      <div class="cart-line-main">
        <div class="cart-line-name">${esc(p.name)}</div>
        <div class="cart-line-unit">${esc(p.unit)} · ${money(p.price)} each</div>
        <div class="cart-line-bottom">
          <div class="qty" role="group" aria-label="Quantity for ${esc(p.name)}">
            <button type="button" data-cart-step="-1" data-id="${esc(p.id)}" aria-label="Decrease">−</button>
            <output>${p.qty}</output>
            <button type="button" data-cart-step="1" data-id="${esc(p.id)}" aria-label="Increase">+</button>
          </div>
          <span class="cart-line-price">${money(p.price * p.qty)}</span>
        </div>
        <button class="cart-remove" data-remove="${esc(p.id)}">Remove</button>
      </div>
    </div>`).join("");

  const sub = subtotal();
  const fee = deliveryFee();
  const over = DATA.meta.freeDeliveryOver;
  const freeNote = (over && sub > 0 && sub < over)
    ? `<div class="free-ship-note">Add ${money(over - sub)} more for FREE delivery.</div>` : "";
  const b = budget || DATA.meta.monthlyBudgetDefault || 0;
  const overBudget = b > 0 && cartTotal() > b
    ? `<div class="over-budget-note">⚠️ This order is ${money(cartTotal() - b)} over your ${money(b)} monthly budget.</div>` : "";

  foot.innerHTML = `
    ${freeNote}
    <div class="summary-row"><span>Subtotal</span><span>${money(sub)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${fee === 0 ? "FREE" : money(fee)}</span></div>
    <div class="summary-row total"><span>Total</span><span>${money(cartTotal())}</span></div>
    ${overBudget}
    <button class="apple-pay" id="applePayBtn">
      <span class="apple-logo" aria-hidden="true"></span> Pay with Apple Pay
    </button>
    <button class="btn btn-ghost btn-block" id="payOther" style="margin-top:.6rem">Pay another way</button>`;
}

/* focus trap utilities for dialogs */
function trapFocus(container, e) {
  const f = $$('button, [href], input, output, [tabindex]:not([tabindex="-1"])', container)
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function openCart() {
  lastFocus = document.activeElement;
  renderCart();
  $("#drawerBackdrop").hidden = false;
  $("#cartDrawer").hidden = false;
  setTimeout(() => $("#cartClose").focus(), 0);
  document.body.style.overflow = "hidden";
}
function closeCart() {
  $("#cartDrawer").hidden = true;
  $("#drawerBackdrop").hidden = true;
  document.body.style.overflow = "";
  if (lastFocus) lastFocus.focus();
}

function openBrowse() {
  lastFocus = document.activeElement;
  $("#browseBackdrop").hidden = false;
  $("#browseView").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#browseClose").focus(), 0);
}
function closeBrowse() {
  $("#browseView").hidden = true;
  $("#browseBackdrop").hidden = true;
  if ($("#cartDrawer").hidden && $("#modal").hidden) document.body.style.overflow = "";
  if (lastFocus) lastFocus.focus();
}

/* ---------------- checkout ---------------- */
function checkout() {
  const items = cartItems();
  if (!items.length) return;
  if (DATA.meta.stripePublishableKey) { startStripeCheckout(items); return; }
  demoCheckout(items);
}

/* DEMO mode: no real charge. Records the purchase so reorder reminders learn from it. */
function demoCheckout(items) {
  const total = cartTotal();
  const orderNo = "EO-" + Date.now().toString().slice(-6);
  const today = todayISO();
  items.forEach((p) => { history[p.id] = today; });
  LS.set("eo.history", history);

  const lines = items.map((p) =>
    `<div class="receipt-row"><span>${esc(p.name)} × ${p.qty}</span><span>${money(p.price * p.qty)}</span></div>`).join("");
  const fee = deliveryFee();

  openModal(`
    <div class="confirm-icon" aria-hidden="true">✅</div>
    <h2 id="modalTitle">Order placed!</h2>
    <p class="confirm-sub">Thank you. We'll text you when it's on the way.</p>
    <div class="receipt">
      ${lines}
      <div class="receipt-row"><span>Delivery</span><span>${fee === 0 ? "FREE" : money(fee)}</span></div>
      <div class="receipt-row total"><span>Total</span><span>${money(total)}</span></div>
    </div>
    <p class="order-no">Order number: <b>${orderNo}</b></p>
    <button class="btn btn-primary btn-block" data-close-modal style="margin-top:1rem">Done</button>
  `);
  announce(`Order ${orderNo} placed. Total ${money(total)}.`);
  celebrate();

  cart = {}; saveCart(); updateCartBadge(); renderCart(); renderProactive();
  closeCart();
}

/* A gentle, brand-coloured celebration on a placed order (canvas-confetti, vendored in /vendor).
   Degrades silently if the library didn't load, and respects prefers-reduced-motion. */
function celebrate() {
  if (typeof confetti !== "function") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#0f8f64", "#0a6f4d", "#b88a36", "#ffffff"];
  const base = { spread: 75, startVelocity: 36, gravity: 0.95, scalar: 0.9, ticks: 150, zIndex: 2000, useWorker: false, colors, disableForReducedMotion: true };
  confetti({ ...base, particleCount: 55, origin: { x: 0.25, y: 1 } });
  confetti({ ...base, particleCount: 55, origin: { x: 0.75, y: 1 } });
}

/* REAL payments: wired only when meta.stripePublishableKey is set. See STRIPE.md.
   Apple Pay shows automatically inside Stripe Checkout in Safari on verified domains. */
async function startStripeCheckout(items) {
  try {
    // Your serverless endpoint creates the Checkout Session (keeps the secret key off this static site).
    const res = await fetch("/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((p) => ({ name: p.name, unit: p.unit, price: p.price, qty: p.qty })),
      }),
    });
    const { url } = await res.json();
    window.location = url; // Stripe-hosted Checkout (Apple Pay appears here)
  } catch (err) {
    openModal(`<h2 id="modalTitle">Couldn't start checkout</h2>
      <p class="confirm-sub">${esc(err.message)}</p>
      <p>Set up your payment endpoint as described in STRIPE.md, or leave the Stripe key blank to use demo mode.</p>
      <button class="btn btn-primary btn-block" data-close-modal>Close</button>`);
  }
}

/* ---------------- modal ---------------- */
function openModal(html) {
  lastFocus = lastFocus || document.activeElement;
  $("#modalBody").innerHTML = html;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => { const b = $("#modalBody button"); (b || $("#modalClose")).focus(); }, 0);
}
function closeModal() {
  $("#modal").hidden = true;
  if ($("#cartDrawer").hidden) document.body.style.overflow = "";
  if (lastFocus) { lastFocus.focus(); lastFocus = null; }
}

/* ---------------- budget editor ---------------- */
function editBudget() {
  const current = budget || DATA.meta.monthlyBudgetDefault || 0;
  const val = window.prompt("Set your monthly budget (in dollars):", String(current));
  if (val == null) return;
  const n = Math.max(0, Math.round(parseFloat(val) || 0));
  budget = n; LS.set("eo.budget", n);
  renderProactive(); renderCart();
  announce(`Monthly budget set to ${money(n)}.`);
}

/* ---------------- global events (delegation) ---------------- */
document.addEventListener("click", (e) => {
  const t = e.target;

  // text size
  const ts = t.closest(".ts-btn");
  if (ts) { applyTextSize(ts.dataset.size); return; }

  // category
  const cat = t.closest(".cat-tile");
  if (cat) { activeCat = cat.dataset.cat; renderCategories(); renderGrid(); return; }

  // per-card qty stepper
  const step = t.closest("[data-step]");
  if (step) {
    const o = $(`#qty-${CSS.escape(step.dataset.id)}`);
    if (o) { const v = Math.max(1, (parseInt(o.textContent, 10) || 1) + Number(step.dataset.step)); o.textContent = v; }
    return;
  }

  // add to cart (cards + proactive). Quantity comes from the card's stepper; proactive adds 1.
  const add = t.closest("[data-add]");
  if (add) { const id = add.dataset.add; addToCart(id, t.closest(".product") ? cardQty(id) : 1); return; }

  // cart drawer qty
  const cstep = t.closest("[data-cart-step]");
  if (cstep) { const id = cstep.dataset.id; setCartQty(id, (cart[id] || 0) + Number(cstep.dataset.step)); return; }

  // remove from cart
  const rm = t.closest("[data-remove]");
  if (rm) { setCartQty(rm.dataset.remove, 0); return; }

  // dismiss proactive card
  const dis = t.closest("[data-dismiss]");
  if (dis) { dismissed.push(dis.dataset.dismiss); LS.set("eo.dismissed", dismissed); renderProactive(); return; }

  // budget
  if (t.closest("[data-budget-edit]")) { editBudget(); return; }

  // browse overlay
  if (t.closest("#browseOpen")) { openBrowse(); return; }
  if (t.closest("#browseClose") || t.id === "browseBackdrop") { closeBrowse(); return; }

  // open/close cart
  if (t.closest("#cartOpen")) { openCart(); return; }
  if (t.closest("#cartClose") || t.closest("[data-close-cart]") || t.id === "drawerBackdrop") { closeCart(); return; }

  // checkout
  if (t.closest("#applePayBtn") || t.closest("#payOther")) { checkout(); return; }

  // modal
  if (t.closest("#modalClose") || t.closest("[data-close-modal]") || t.id === "modal") { closeModal(); return; }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!$("#modal").hidden) return closeModal();
    if (!$("#cartDrawer").hidden) return closeCart();
    if (!$("#browseView").hidden) return closeBrowse();
  }
  if (e.key === "Tab") {
    if (!$("#modal").hidden) trapFocus($("#modal"), e);
    else if (!$("#cartDrawer").hidden) trapFocus($("#cartDrawer"), e);
    else if (!$("#browseView").hidden) trapFocus($("#browseView"), e);
  }
});

$("#searchInput").addEventListener("input", (e) => { searchQuery = e.target.value; renderGrid(); });

/* ---------------- boot ---------------- */
fetch("data.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then((json) => {
    DATA = json;
    DATA.products.forEach((p) => { PRODUCTS[p.id] = p; });
    if (budget == null) budget = DATA.meta.monthlyBudgetDefault || 0;
    applyTextSize(LS.get("eo.textSize", "base"));
    seedHistoryIfNeeded();
    renderCategories();
    renderGrid();
    renderProactive();
    updateCartBadge();
    $("#footNote").textContent =
      `${DATA.products.length} products · free delivery over ${money(DATA.meta.freeDeliveryOver || 0)} · last updated ${DATA.meta.updated || ""}.`;
  })
  .catch((err) => {
    $("#grid").innerHTML =
      `<div class="empty-state"><div class="empty-emoji">⚠️</div>
       <p>Couldn't load the store (${esc(err.message)}).</p>
       <p>If you opened this file directly, run a local server instead — see the README.</p></div>`;
  });
