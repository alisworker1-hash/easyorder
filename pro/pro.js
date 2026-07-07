/* EasyOrder Pro - first UI slice. Command bar -> intent -> discovery -> recommendation ->
   strategy cards -> See Breakdown. All business logic comes from /core; this file only
   routes input and renders engine output. Static-site friendly (ES module over http). */

import {
  resolveIntent, discoverSuppliers, recommend, explainPick,
  displayLanded, money,
} from "../core/index.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STATE = { dir: [], scenarios: {}, rec: null, uni: null, cards: [] };

/* ---------- data ---------- */
async function loadData() {
  const [dir, hw] = await Promise.all([
    fetch("../data/suppliers.json").then((r) => r.json()),
    fetch("../data/sample-hardware.json").then((r) => r.json()),
  ]);
  STATE.dir = dir.suppliers;
  STATE.scenarios.fastener = hw; // the one seeded scenario for this slice
}

/* ---------- run a need through the engine ---------- */
async function run(text) {
  const intent = resolveIntent(text, { projects: [] });
  const seed = intent.args.seed;

  // This demo slice is seeded only for the fastener scenario.
  if (seed !== "fastener") {
    renderRoute(intent, null);
    $("#results").innerHTML = `<div class="empty">This first demo slice is seeded for the
      <b>fastener</b> scenario. Try <button class="chip" data-q="1/2-13 yellow zinc hardware">1/2-13 yellow zinc hardware</button>.
      <br><br>The command bar already routed your request via the engine
      (<b>${esc(intent.workspace)} / ${esc(intent.action)}</b>) - only the seeded data set is limited here.</div>`;
    return;
  }

  const sc = STATE.scenarios.fastener;
  const need = { query: text, productCategory: "fasteners" };
  const uni = await discoverSuppliers(need, { directory: STATE.dir });
  const rec = recommend(sc.materials, sc.sampleQuotes, { suppliers: uni.candidates });
  STATE.rec = rec; STATE.uni = uni;
  STATE.cards = buildCards(rec);

  renderRoute(intent, uni);
  renderCards(STATE.cards);
}

/* ---------- route line (shows intent + discovery, discovery-first story) ---------- */
function renderRoute(intent, uni) {
  const el = $("#routeline");
  el.hidden = false;
  const rows = [
    `<div class="rl-row"><span class="rl-badge">Understood</span> <span>${esc(intent.reason)} <b>(${esc(intent.workspace)} / ${esc(intent.action)})</b></span></div>`,
  ];
  if (uni) rows.push(
    `<div class="rl-row"><span class="rl-badge">Discovered</span> <span>${uni.counts.total} suppliers (${uni.counts.local} local) across ${uni.solutionCategories.length} categories, before pricing.</span></div>`);
  el.innerHTML = rows.join("");
}

/* ---------- strategy cards ---------- */
const sumOf = (id) => STATE.rec.supplierSummaries.find((s) => s.supplierId === id);

function badgeFor(s) {
  if (!s) return null;
  if (!s.meetsMinimum) return { kind: "bad", text: "Below min order" };
  if (s.itemsConfirmed === 0) return { kind: "info", text: "Local · call to confirm" };
  if (s.itemsConfirmed < s.itemsTotal) return { kind: "warn", text: `${s.itemsConfirmed}/${s.itemsTotal} confirmed` };
  if (!s.allExactConfirmed) return { kind: "warn", text: "Has substitute" };
  if (s.fulfillment === "pickup" || (s.shipping && s.shipping.confidence === "confirmed")) return { kind: "good", text: "Confirmed" };
  return { kind: "warn", text: "Shipping est. pending" };
}

function supplierCard(title, icon, s, reason, extraBadge) {
  const badge = extraBadge || badgeFor(s);
  const landed = s.itemsConfirmed === 0 ? "Call for a quote" : displayLanded(s.confirmedPartsTotal, s.shipping);
  return { title, icon, supplierName: s.supplierName, landed, reason,
    badge, cta: s.recommendedAction.label, breakdown: { kind: "supplier", supplierId: s.supplierId } };
}

function splitCard(title, icon, low, reason) {
  return { title, icon, supplierName: `${low.supplierCount} suppliers (split buy)`,
    landed: displayLanded(low.total, null), reason,
    badge: { kind: "warn", text: `${low.supplierCount} vendors` },
    cta: "Review split", breakdown: { kind: "split" } };
}

function futureCard(title, icon, note) {
  return { title, icon, future: true, note };
}

function buildCards(rec) {
  const cards = [];
  const basis = rec.bestConfirmed.basis;
  const axis = rec.axes[basis];
  if (axis.suppliers.length === 1)
    cards.push(supplierCard("Best Overall", "🧭", sumOf(axis.suppliers[0]),
      "Best balance of price, lead time, and number of suppliers"));
  else
    cards.push(splitCard("Best Overall", "🧭", rec.bestLowestCost,
      "Best balance; the cheapest path splits across suppliers"));

  if (rec.bestPriceToday)
    cards.push(supplierCard("Best Price Today", "💰", rec.bestPriceToday,
      "Cheapest complete order you can place now"));

  if (rec.bestPickupCandidate) {
    const s = sumOf(rec.bestPickupCandidate.supplierId);
    const same = rec.bestPickupCandidate.sameDayCapable;
    cards.push(supplierCard("Need It Today", "⏱️", s,
      same ? "In stock now for same-day pickup" : "Fastest to get in hand",
      same ? { kind: "good", text: "Same-day" } : null));
  }

  if (rec.bestExactSpec)
    cards.push(supplierCard("Best Exact Spec", "🎯", rec.bestExactSpec,
      "Every line an exact spec match, cheapest"));

  if (rec.bestLocal)
    cards.push(supplierCard("Best Local Supplier", "📍", rec.bestLocal,
      "A nearby business worth a call before buying online"));

  cards.push(splitCard("Lowest Cost", "🧾", rec.bestLowestCost,
    "Cheapest per item; may split across suppliers and shipments"));

  cards.push(futureCard("Best Bulk Value", "📦", "Coming soon - needs quantity-break pricing"));
  cards.push(futureCard("Best Subscription", "🔁", "Profile-based recommendation coming later"));
  return cards;
}

function landedHTML(text) {
  return text.includes("+ Shipping")
    ? `${esc(text.replace(" + Shipping", ""))} <span class="plus">+ Shipping</span>`
    : esc(text);
}

function cardHTML(c, i) {
  if (c.future) return `
    <div class="card future">
      <div class="card-top"><span class="card-title">${c.icon} ${esc(c.title)}</span>
        <span class="badge info">Coming soon</span></div>
      <div class="card-supplier" style="color:var(--muted)">Not yet available</div>
      <p class="future-note">${esc(c.note)}</p>
    </div>`;
  const b = c.badge ? `<span class="badge ${c.badge.kind}">${esc(c.badge.text)}</span>` : "";
  return `
    <div class="card">
      <div class="card-top"><span class="card-title">${c.icon} ${esc(c.title)}</span>${b}</div>
      <div class="card-supplier">${esc(c.supplierName)}</div>
      <div class="card-landed">${landedHTML(c.landed)}</div>
      <p class="card-reason">${esc(c.reason)}</p>
      <div class="card-foot">
        <button class="cta" data-cta="${i}">${esc(c.cta)}</button>
        <button class="seebk" data-bk="${i}">See Breakdown →</button>
      </div>
    </div>`;
}

function renderCards(cards) {
  $("#results").innerHTML = cards.map(cardHTML).join("");
}

/* ---------- See Breakdown ---------- */
function optionFlags(supplierId) {
  const opts = STATE.rec.options.filter((o) => o.supplierId === supplierId);
  const bits = [];
  for (const o of opts) {
    if (o.status === "exact_confirmed") continue;
    const short = o.item.replace(/^Hex |^Flat /, "").split(" ").slice(0, 2).join(" ");
    bits.push(`${short}: ${o.status.replace(/_/g, " ")}`);
  }
  return bits.join("; ");
}

function cmpTable(highlightId) {
  const rows = STATE.rec.supplierSummaries.slice()
    .sort((a, b) => b.itemsConfirmed - a.itemsConfirmed || a.landedTotal - b.landedTotal);
  const tr = rows.map((s) => {
    const dim = s.itemsConfirmed === 0 ? " dim" : "";
    const win = s.supplierId === highlightId ? " winrow" : "";
    const ship = s.fulfillment === "pickup" ? "pickup"
      : s.shipping && s.shipping.cost != null ? `${money(s.shipping.cost)} (${s.shipping.confidence})`
      : "unknown";
    const landed = s.itemsConfirmed === 0 ? "-" : displayLanded(s.confirmedPartsTotal, s.shipping);
    const minCell = s.meetsMinimum ? "-" : `min ${money(s.minOrderValue)} (short ${money(s.minOrderShortfall)})`;
    return `<tr class="${dim}${win}">
      <td><b>${esc(s.supplierName)}</b></td>
      <td class="num">${s.itemsConfirmed}/${s.itemsTotal}</td>
      <td class="num">${money(s.confirmedPartsTotal)}</td>
      <td class="num">${esc(ship)}</td>
      <td class="num">${esc(landed)}</td>
      <td class="num">${minCell === "-" ? "-" : `<span class="badge bad">${esc(minCell)}</span>`}</td>
      <td class="flags">${esc(optionFlags(s.supplierId) || "-")}</td>
      <td>${esc(s.recommendedAction.label)}</td>
    </tr>`;
  }).join("");
  return `<div class="tbl-scroll"><table class="cmp">
    <thead><tr><th>Supplier</th><th>Cover</th><th>Parts</th><th>Shipping</th><th>Landed</th><th>Min order</th><th>Missing / notes</th><th>Next action</th></tr></thead>
    <tbody>${tr}</tbody></table></div>`;
}

function openBreakdown(card) {
  const body = $("#bkBody");
  $("#bkTitle").textContent = `Breakdown - ${card.title}`;
  let html = "";

  if (card.breakdown.kind === "split") {
    const rowsHtml = STATE.rec.axes.lowestPrice.rows.map((r) =>
      `<div class="lose"><span class="ln">${esc(r.item)}</span><span class="lr">${esc(r.supplierName)} · ${money(r.lineTotal)}</span></div>`).join("");
    html += `<div class="bk-sec"><h3>Cheapest split (per item)</h3>
      <div class="win"><div class="win-reason">Parts ${money(STATE.rec.axes.lowestPrice.itemsSubtotal)} across
      ${STATE.rec.bestLowestCost.supplierCount} suppliers. Splitting saves on parts but adds a shipment/trip per vendor,
      so a single-supplier order can win on landed cost.</div></div>${rowsHtml}</div>`;
    html += `<div class="bk-sec"><h3>All vendors compared</h3>${cmpTable(null)}</div>`;
  } else {
    const exp = explainPick(card.breakdown.supplierId, STATE.rec.supplierSummaries);
    if (exp) {
      html += `<div class="bk-sec"><h3>Why ${esc(exp.winner.supplierName)} won</h3>
        <div class="win"><div class="win-name">${esc(exp.winner.supplierName)} ·
        ${esc(displayLanded(sumOf(card.breakdown.supplierId).confirmedPartsTotal, sumOf(card.breakdown.supplierId).shipping))}</div>
        <div class="win-reason">${esc(exp.winner.reason)}</div></div></div>`;
      if (exp.losers.length) html += `<div class="bk-sec"><h3>Why the others lost</h3>
        ${exp.losers.map((l) => `<div class="lose"><span class="ln">${esc(l.supplierName)}</span>
          <span class="lr">${esc(l.reason)}</span></div>`).join("")}</div>`;
    }
    html += `<div class="bk-sec"><h3>All vendors compared</h3>${cmpTable(card.breakdown.supplierId)}</div>`;
  }

  body.innerHTML = html;
  $("#bkBackdrop").hidden = false;
  $("#breakdown").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#bkClose").focus(), 0);
}
function closeBreakdown() {
  $("#breakdown").hidden = true; $("#bkBackdrop").hidden = true; document.body.style.overflow = "";
}

/* ---------- events ---------- */
document.addEventListener("submit", (e) => {
  if (e.target.id === "cbar") { e.preventDefault(); const v = $("#cbarInput").value.trim(); if (v) run(v); }
});
document.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-q]");
  if (chip) { $("#cbarInput").value = chip.dataset.q; run(chip.dataset.q); return; }
  const bk = e.target.closest("[data-bk]");
  if (bk) { openBreakdown(STATE.cards[+bk.dataset.bk]); return; }
  const cta = e.target.closest("[data-cta]");
  if (cta) { openBreakdown(STATE.cards[+cta.dataset.cta]); return; } // CTA opens breakdown in this demo (no checkout)
  if (e.target.id === "bkClose" || e.target.id === "bkBackdrop") closeBreakdown();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#breakdown").hidden) closeBreakdown(); });

/* ---------- boot ---------- */
loadData().then(() => { $("#cbarInput").focus(); })
  .catch((err) => { $("#results").innerHTML = `<div class="empty">Couldn't load demo data (${esc(err.message)}). Run a local server from the repo root and open <b>/pro/</b>.</div>`; });
