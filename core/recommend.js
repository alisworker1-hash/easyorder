/* EasyOrder core - deterministic recommendation engine.
   Input: a material list + the quotes suppliers returned. Output: purchasing strategies
   across five axes. Pure functions, integer-cent math, NO AI. This is what makes the
   "AI-assisted procurement" story credible without spending on AI.

   Axes:
     lowestPrice          cheapest per item (may split across suppliers)
     fastestAvailability  minimize the longest lead time in the basket
     fewestSuppliers      smallest supplier set that covers everything (then cheapest)
     deliveryVsPickup     total with delivery fees vs. pickup (fees avoided)
     bestOverallValue     explainable weighted blend of the above
*/

import { toCents, fromCents, round2, money, displayLanded } from "./money.js";
import { MATCH_STATUS, CONFIRMED_STATUSES, deriveLineStatus } from "./models.js";
import { evaluateOption, procurementEffort, shippingKnown, ACTION } from "./intelligence.js";
import { estimateShipping, landedTotal, meetsMinimum } from "./shipping.js";

const STATUS_REASON = {
  [MATCH_STATUS.PRICE_UNCONFIRMED]: "item exists but the price could not be confirmed",
  [MATCH_STATUS.AVAILABILITY_UNCONFIRMED]: "a price was seen but stock/pack count is unconfirmed",
  [MATCH_STATUS.IN_STORE_VERIFICATION_NEEDED]: "likely available locally; verify at the counter",
  [MATCH_STATUS.NOT_RECOMMENDED]: "carried but a poor fit",
};

/* Classify every quote line ONCE:
   - confirmed-tier lines (exact/substitute/partial + a usable price) feed the math
   - everything else becomes a labeled CANDIDATE (or an exclusion for not_recommended)
   Nothing is silently dropped and nothing unconfirmed is treated as $0 or unavailable. */
function classifyLines(materials, quotes) {
  const qtyOf = (id) => {
    const m = materials.find((x) => x.id === id);
    return m ? Math.max(0, Math.floor(Number(m.qty) || 0)) : 0;
  };
  const offers = new Map();
  materials.forEach((m) => offers.set(m.id, []));
  const candidates = [], excluded = [];

  for (const q of quotes || []) {
    for (const li of q.lineItems || []) {
      if (!offers.has(li.materialId)) continue;
      const status = li.status || deriveLineStatus(li);
      const reason = li.matchNote || STATUS_REASON[status] || "";
      const base = {
        supplierId: q.supplierId, materialId: li.materialId, status,
        unitPrice: li.unitPrice == null ? null : Number(li.unitPrice),
        leadDays: li.leadDays == null ? null : Number(li.leadDays),
        fulfillment: q.fulfillment, reason,
      };
      if (status === MATCH_STATUS.NOT_RECOMMENDED) { excluded.push(base); continue; }
      if (CONFIRMED_STATUSES.has(status) && li.unitPrice != null && li.available !== false) {
        const qty = qtyOf(li.materialId);
        const unitPriceCents = toCents(li.unitPrice);
        offers.get(li.materialId).push({
          supplierId: q.supplierId, unitPriceCents, qty,
          lineCents: unitPriceCents * qty,
          leadDays: base.leadDays, status,
          matchNote: li.matchNote || "",
        });
      } else {
        candidates.push(base);
      }
    }
  }
  return { offers, candidates, excluded };
}

function supplierFeeMap(quotes) {
  const m = new Map();
  for (const q of quotes || []) m.set(q.supplierId, toCents(q.deliveryFee || 0));
  return m;
}

/* Evaluate an assignment (Map materialId -> offer) into a comparable basket summary. */
function evalAssignment(assignment, materials, feeMap, nameOf) {
  let itemsCents = 0, maxLead = 0;
  const suppliers = new Set();
  const rows = [];
  for (const [mid, offer] of assignment) {
    const m = materials.find((x) => x.id === mid);
    itemsCents += offer.lineCents;
    suppliers.add(offer.supplierId);
    if (Number.isFinite(offer.leadDays)) maxLead = Math.max(maxLead, offer.leadDays);
    rows.push({
      materialId: mid, item: m ? m.item : mid, qty: offer.qty,
      supplierId: offer.supplierId, supplierName: nameOf(offer.supplierId),
      unitPrice: fromCents(offer.unitPriceCents), lineTotal: fromCents(offer.lineCents),
      leadDays: offer.leadDays,
      status: offer.status, ...(offer.matchNote ? { matchNote: offer.matchNote } : {}),
    });
  }
  let feeCents = 0;
  for (const s of suppliers) feeCents += (feeMap.get(s) || 0);
  return {
    rows,
    suppliers: [...suppliers],
    supplierCount: suppliers.size,
    itemsSubtotal: fromCents(itemsCents),
    deliveryFees: fromCents(feeCents),
    total: fromCents(itemsCents + feeCents),
    totalCents: itemsCents + feeCents,
    maxLeadDays: maxLead,
  };
}

/* ---- assignment strategies ---- */

function assignCheapest(offers) {
  const a = new Map();
  for (const [mid, list] of offers) {
    if (!list.length) continue;
    a.set(mid, list.reduce((best, o) => (o.lineCents < best.lineCents ? o : best)));
  }
  return a;
}

function assignFastest(offers) {
  const a = new Map();
  for (const [mid, list] of offers) {
    if (!list.length) continue;
    a.set(mid, list.reduce((best, o) => {
      const ol = Number.isFinite(o.leadDays) ? o.leadDays : Infinity;
      const bl = Number.isFinite(best.leadDays) ? best.leadDays : Infinity;
      if (ol !== bl) return ol < bl ? o : best;
      return o.lineCents < best.lineCents ? o : best; // tie-break on price
    }));
  }
  return a;
}

function* combinations(arr, k) {
  const n = arr.length;
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map((i) => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function cheapestWithin(offers, mats, allowed) {
  const a = new Map();
  for (const mid of mats) {
    const list = offers.get(mid).filter((o) => allowed.has(o.supplierId));
    if (list.length) a.set(mid, list.reduce((b, o) => (o.lineCents < b.lineCents ? o : b)));
  }
  return a;
}

/* Smallest supplier set that covers every coverable material; among minimal covers, cheapest.
   Brute-forces subsets (supplier counts are small); greedy fallback if the set is large. */
function assignFewestSuppliers(offers) {
  const mats = [...offers.keys()].filter((mid) => offers.get(mid).length);
  const canCover = new Map(); // supplierId -> Set(materialId)
  for (const mid of mats) {
    for (const o of offers.get(mid)) {
      if (!canCover.has(o.supplierId)) canCover.set(o.supplierId, new Set());
      canCover.get(o.supplierId).add(mid);
    }
  }
  const suppliers = [...canCover.keys()];
  const target = mats.length;

  if (suppliers.length > 14) { // greedy fallback for large directories
    const covered = new Set(); const chosen = new Set();
    while (covered.size < target) {
      let best = null, gain = -1;
      for (const s of suppliers) {
        if (chosen.has(s)) continue;
        let g = 0; for (const mid of canCover.get(s)) if (!covered.has(mid)) g++;
        if (g > gain) { gain = g; best = s; }
      }
      if (best == null || gain <= 0) break;
      chosen.add(best); for (const mid of canCover.get(best)) covered.add(mid);
    }
    return cheapestWithin(offers, mats, chosen);
  }

  for (let size = 1; size <= suppliers.length; size++) {
    let best = null;
    for (const combo of combinations(suppliers, size)) {
      const covered = new Set();
      for (const s of combo) for (const mid of canCover.get(s)) covered.add(mid);
      if (covered.size !== target) continue;
      const allowed = new Set(combo);
      const a = cheapestWithin(offers, mats, allowed);
      const cost = [...a.values()].reduce((s, o) => s + o.lineCents, 0);
      if (!best || cost < best.cost) best = { a, cost };
    }
    if (best) return best.a; // first size that can cover all wins
  }
  return assignCheapest(offers);
}

/* ---- pickup convenience ranking ----
   Ranks pickup-fulfillment quotes by how much of the list they cover (confirmed lines
   first, labeled candidates counted separately), so a convenient local option with one
   unconfirmed field still SHOWS UP instead of being discarded. */
function rankPickupOptions(materials, quotes, nameOf) {
  const options = [];
  for (const q of quotes || []) {
    if (q.fulfillment !== "pickup") continue;
    let confirmedCents = 0, confirmed = 0, candidate = 0, maxLead = 0, sameDay = true;
    const flags = [];
    for (const li of q.lineItems || []) {
      const m = materials.find((x) => x.id === li.materialId);
      if (!m) continue;
      const status = li.status || deriveLineStatus(li);
      if (status === MATCH_STATUS.NOT_RECOMMENDED) continue;
      if (CONFIRMED_STATUSES.has(status) && li.unitPrice != null && li.available !== false) {
        confirmed++;
        confirmedCents += toCents(li.unitPrice) * Math.max(0, Math.floor(Number(m.qty) || 0));
        const lead = Number.isFinite(li.leadDays) ? li.leadDays : 0;
        maxLead = Math.max(maxLead, lead);
        if (lead > 0) sameDay = false;
        if (status !== MATCH_STATUS.EXACT_CONFIRMED) flags.push(`${m.item}: ${status}${li.matchNote ? " (" + li.matchNote + ")" : ""}`);
      } else {
        candidate++;
        sameDay = false; // can't promise same-day on an unverified line
        flags.push(`${m.item}: ${status}${li.matchNote ? " (" + li.matchNote + ")" : ""}`);
      }
    }
    if (!confirmed && !candidate) continue;
    options.push({
      supplierId: q.supplierId, supplierName: nameOf(q.supplierId),
      itemsConfirmed: confirmed, itemsCandidate: candidate,
      itemsCovered: confirmed + candidate, itemsTotal: materials.length,
      confirmedPartsTotal: fromCents(confirmedCents),
      maxLeadDays: maxLead, sameDayCapable: sameDay && confirmed > 0,
      verificationFlags: flags,
    });
  }
  options.sort((a, b) =>
    (b.itemsCovered - a.itemsCovered) ||
    (b.itemsConfirmed - a.itemsConfirmed) ||
    (a.confirmedPartsTotal - b.confirmedPartsTotal));
  return options;
}

/* explainPick: why a chosen supplier won, and why each rival lost. Pure over the
   supplierSummaries the engine already produced - powers the "See Breakdown" view.
   `winnerId` is a supplierId (the single-supplier strategy picks resolve to one). */
export function explainPick(winnerId, supplierSummaries) {
  const winner = (supplierSummaries || []).find((s) => s.supplierId === winnerId);
  if (!winner) return null;

  const winReasons = [];
  winReasons.push(`covers ${winner.itemsConfirmed}/${winner.itemsTotal} confirmed`);
  if (winner.allExactConfirmed) winReasons.push("all lines exact");
  if (winner.fulfillment === "pickup") winReasons.push("in-store pickup");
  else if (winner.shipping && winner.shipping.confidence === "confirmed") winReasons.push("shipping confirmed");
  winReasons.push(`landed ${displayLanded(winner.confirmedPartsTotal, winner.shipping)}`);

  const loseReason = (s) => {
    if (!s.meetsMinimum)
      return `below the $${s.minOrderValue} order minimum (short $${s.minOrderShortfall.toFixed(2)})`;
    if (s.itemsConfirmed < winner.itemsConfirmed)
      return `covers only ${s.itemsConfirmed}/${s.itemsTotal} confirmed`;
    if (s.fulfillment === "delivery" && !s.shippingKnown)
      return `shipping cost unknown (parts ${money(s.confirmedPartsTotal)})`;
    if (s.landedShippingKnown && winner.landedShippingKnown && s.landedTotal > winner.landedTotal)
      return `${money(s.landedTotal - winner.landedTotal)} more landed`;
    if (!s.allExactConfirmed && winner.allExactConfirmed)
      return "includes a substitute or partial line";
    if (s.effort > winner.effort) return "higher procurement effort";
    return "edged out on overall balance";
  };

  const losers = (supplierSummaries || [])
    .filter((s) => s.supplierId !== winnerId && s.itemsConfirmed > 0)
    .map((s) => ({ supplierId: s.supplierId, supplierName: s.supplierName,
      landedTotal: s.landedTotal, reason: loseReason(s) }));

  return {
    winner: {
      supplierId: winner.supplierId, supplierName: winner.supplierName,
      landedTotal: winner.landedTotal, shippingConfidence: winner.shipping ? winner.shipping.confidence : null,
      reason: winReasons.join(", "),
    },
    losers,
  };
}

/* Per-supplier recommended next action, derived from coverage / minimum / shipping state.
   Distinct from the per-line nextAction: this is "what do I do with THIS supplier". */
function supplierAction(s) {
  if (s.itemsConfirmed === 0) return { action: "gather_quotes", label: "Get quotes / verify availability" };
  if (!s.meetsMin.ok) return { action: "add_items_or_skip",
    label: `Add $${s.meetsMin.shortfall.toFixed(2)} to reach the $${s.meetsMin.minOrderValue} minimum, or skip` };
  if (s.itemsConfirmed < s.itemsTotal) return { action: "verify_remaining", label: "Verify the remaining item(s)" };
  if (s.fulfillment === "pickup") return { action: "buy_now", label: "Buy now - in-store pickup" };
  if (s.shippingKnown) return { action: "order_online", label: "Order online (shipping confirmed)" };
  return { action: "confirm_shipping", label: "Confirm shipping, then order" };
}

/* ---- public API ---- */

export function recommend(materials, quotes, opts = {}) {
  const suppliers = opts.suppliers || [];
  const nameOf = (id) => (suppliers.find((s) => s.id === id) || {}).name || id;
  const { offers, candidates: candidateLines, excluded } = classifyLines(materials, quotes);
  const feeMap = supplierFeeMap(quotes);

  /* Enforce vendor order minimums on the offer pool. A supplier whose ENTIRE confirmed
     basket for this order is below its minimum-order value cannot fulfill a viable order,
     so it must not appear in any assignment axis (lowestPrice split, fewest-suppliers, etc).
     It still shows in supplierSummaries flagged not-buyable. Prevents recommending or
     splitting to a vendor you literally cannot order from. */
  const supTotalCents = new Map();
  for (const list of offers.values())
    for (const o of list) supTotalCents.set(o.supplierId, (supTotalCents.get(o.supplierId) || 0) + o.lineCents);
  const belowMin = new Set();
  for (const [sid, cents] of supTotalCents) {
    const sp = (suppliers.find((s) => s.id === sid) || {}).shippingPolicy;
    if (sp && sp.minOrderValue != null && fromCents(cents) < sp.minOrderValue) belowMin.add(sid);
  }
  if (belowMin.size)
    for (const [mid, list] of offers) offers.set(mid, list.filter((o) => !belowMin.has(o.supplierId)));

  const covered   = [...offers.keys()].filter((mid) => offers.get(mid).length);
  const uncovered = [...offers.keys()].filter((mid) => !offers.get(mid).length);

  const ev = (a) => evalAssignment(a, materials, feeMap, nameOf);
  const lowestPrice = ev(assignCheapest(offers));
  const fastest     = ev(assignFastest(offers));
  const fewest      = ev(assignFewestSuppliers(offers));

  /* delivery vs pickup: pickup avoids per-supplier delivery fees */
  const deliveryTotal = lowestPrice.total;
  const pickupTotal   = lowestPrice.itemsSubtotal;
  const deliveryVsPickup = {
    deliveryTotal, pickupTotal,
    recommended: pickupTotal <= deliveryTotal ? "pickup" : "delivery",
    savings: round2(Math.abs(deliveryTotal - pickupTotal)),
    note: "Pickup avoids delivery fees but means collecting from " +
          lowestPrice.supplierCount + " supplier" + (lowestPrice.supplierCount === 1 ? "" : "s") + ".",
  };

  /* best overall value: explainable weighted blend (lower score = better) */
  const weights = Object.assign({ price: 0.5, lead: 0.3, suppliers: 0.2 }, opts.weights || {});
  const candidates = [
    { key: "lowestPrice", e: lowestPrice },
    { key: "fastestAvailability", e: fastest },
    { key: "fewestSuppliers", e: fewest },
  ];
  const totals = candidates.map((c) => c.e.totalCents);
  const leads  = candidates.map((c) => c.e.maxLeadDays);
  const counts = candidates.map((c) => c.e.supplierCount);
  const norm = (v, mn, mx) => (mx === mn ? 0 : (v - mn) / (mx - mn));
  const ranked = candidates.map((c) => {
    const score =
        weights.price     * norm(c.e.totalCents,    Math.min(...totals), Math.max(...totals))
      + weights.lead      * norm(c.e.maxLeadDays,    Math.min(...leads),  Math.max(...leads))
      + weights.suppliers * norm(c.e.supplierCount,  Math.min(...counts), Math.max(...counts));
    return {
      key: c.key, score: Math.round(score * 1000) / 1000,
      total: c.e.total, maxLeadDays: c.e.maxLeadDays, supplierCount: c.e.supplierCount,
    };
  }).sort((a, b) => a.score - b.score);
  const bestOverallValue = { basis: ranked[0].key, ...ranked[0], weights, ranked };

  /* Candidates & exclusions, enriched with names so a UI can render them directly. */
  const describe = (c) => ({ ...c, supplierName: nameOf(c.supplierId),
    item: (materials.find((m) => m.id === c.materialId) || {}).item || c.materialId });
  const candidateList = candidateLines.map(describe);
  const excludedList = excluded.map(describe);

  const pickupOptions = rankPickupOptions(materials, quotes, nameOf);

  /* ---- intelligence layer: per-option evaluation, effort, headline picks ---- */
  const supplierOf = (id) => suppliers.find((s) => s.id === id) || { id, name: nameOf(id) };
  const materialOf = (id) => materials.find((m) => m.id === id);
  const qtyOf = (id) => { const m = materialOf(id); return m ? Math.max(0, Math.floor(Number(m.qty) || 0)) : 0; };

  /* Every supplier/item option, scored - the UI's comparison-matrix row model. */
  const options = [];
  for (const q of quotes || []) {
    for (const li of q.lineItems || []) {
      if (!materialOf(li.materialId)) continue;
      options.push(evaluateOption(li, q, supplierOf(q.supplierId), materialOf(li.materialId)));
    }
  }

  /* Per-supplier summary: coverage, confirmed parts total, effort/convenience. */
  const supplierSummaries = (quotes || []).map((q) => {
    let confirmed = 0, candidate = 0, cents = 0, exactOnly = true, exactCount = 0, subCount = 0;
    for (const li of q.lineItems || []) {
      const m = materialOf(li.materialId);
      if (!m) continue;
      const st = li.status || deriveLineStatus(li);
      if (st === MATCH_STATUS.NOT_RECOMMENDED) { exactOnly = false; continue; }
      if (CONFIRMED_STATUSES.has(st) && li.unitPrice != null && li.available !== false) {
        confirmed++; cents += toCents(li.unitPrice) * qtyOf(li.materialId);
        if (st === MATCH_STATUS.EXACT_CONFIRMED) exactCount++; else { exactOnly = false; subCount++; }
      } else { candidate++; exactOnly = false; }
    }
    const sup = supplierOf(q.supplierId);
    const effort = procurementEffort(q, sup, materials);
    const partsTotal = fromCents(cents);
    /* shipping estimate + landed total (parts + shipping when known) */
    const shipping = estimateShipping(q, sup, partsTotal);
    const landed = landedTotal(partsTotal, shipping);
    const minOrder = meetsMinimum(sup, partsTotal); // vendor dollar floor, if any
    const recommendedAction = supplierAction({
      itemsConfirmed: confirmed, itemsTotal: materials.length, meetsMin: minOrder,
      fulfillment: q.fulfillment, shippingKnown: landed.shippingKnown });
    return {
      supplierId: q.supplierId, supplierName: nameOf(q.supplierId),
      fulfillment: q.fulfillment,
      itemsConfirmed: confirmed, itemsCandidate: candidate, itemsTotal: materials.length,
      fullConfirmedCoverage: confirmed === materials.length,
      allExactConfirmed: exactOnly && confirmed === materials.length,
      /* exact vs substitute counts drive the "preference met" (e.g. organic) strategy */
      exactCount, substituteCount: subCount,
      confirmedPartsTotal: partsTotal,
      /* shipping is now a first-class, estimated field with its own confidence */
      shipping, shippingKnown: landed.shippingKnown,
      landedTotal: landed.total, landedShippingKnown: landed.shippingKnown,
      /* minimum-order gate: buyable only if the order meets any vendor floor */
      meetsMinimum: minOrder.ok, minOrderValue: minOrder.minOrderValue, minOrderShortfall: minOrder.shortfall,
      recommendedAction,
      effort: effort.score, convenience: effort.convenience, effortFactors: effort.factors,
      /* supplier-level confidence from the discovery engine, when present (category-fit,
         distinct from per-line price confidence). */
      supplierConfidence: sup.supplierConfidence ?? null,
      supplierCategory: sup.supplierCategory ?? null,
      supplierType: sup.type ?? null,
    };
  }).sort((a, b) => b.itemsConfirmed - a.itemsConfirmed ||
    // rank full-coverage suppliers by LANDED total when both shipping figures are known,
    // else fall back to parts (mixing known/unknown landed would be apples-to-oranges)
    ((a.landedShippingKnown && b.landedShippingKnown)
      ? a.landedTotal - b.landedTotal
      : a.confirmedPartsTotal - b.confirmedPartsTotal));

  /* Headline picks. Only BUYABLE suppliers (meet any minimum-order floor) can be a pick. */
  const fullCover = supplierSummaries.filter((s) => s.fullConfirmedCoverage && s.meetsMinimum);
  const bestConvenience = fullCover.slice().sort((a, b) =>
    a.effort - b.effort || a.confirmedPartsTotal - b.confirmedPartsTotal)[0] || null;
  const bestExactSpec = supplierSummaries.filter((s) => s.allExactConfirmed && s.meetsMinimum)
    .sort((a, b) => a.confirmedPartsTotal - b.confirmedPartsTotal)[0] || null;

  /* Best Price Today: cheapest COMPLETE order you can place now. Prefer suppliers whose
     landed cost is known (pickup or confirmed shipping); fall back to parts when none is. */
  const withLanded = fullCover.filter((s) => s.landedShippingKnown);
  const bestPriceToday = (withLanded.length
    ? withLanded.slice().sort((a, b) => a.landedTotal - b.landedTotal)[0]
    : fullCover.slice().sort((a, b) => a.confirmedPartsTotal - b.confirmedPartsTotal)[0]) || null;

  /* One-Store Best: cheapest SINGLE store that covers the whole basket in one trip - the
     grocery "one trip vs cherry-pick" tradeoff against bestLowestCost (the multi-store split). */
  const bestOneStore = (withLanded.length
    ? withLanded.slice().sort((a, b) => a.landedTotal - b.landedTotal)[0]
    : fullCover.slice().sort((a, b) => a.confirmedPartsTotal - b.confirmedPartsTotal)[0]) || null;

  /* Best Organic / preference-met: the full-coverage store that satisfies the most PREFERRED
     (exact_confirmed) lines - e.g. organic/brand preference - then cheapest. Distinguishes an
     exact/preferred match from a cheaper non-organic substitute. */
  const bestOrganic = fullCover.slice().sort((a, b) =>
    b.exactCount - a.exactCount ||
    ((a.landedShippingKnown && b.landedShippingKnown) ? a.landedTotal - b.landedTotal : a.confirmedPartsTotal - b.confirmedPartsTotal))[0] || null;

  /* Best Local Supplier: the strongest nearby business, even if it's still quote-by-phone
     (it surfaces with a "call" action rather than being hidden). Local = supplier type
     "local" or a discovery local-* category. */
  const isLocal = (s) => s.supplierType === "local" || String(s.supplierCategory || "").startsWith("local");
  const bestLocal = supplierSummaries.filter(isLocal).sort((a, b) =>
    b.itemsConfirmed - a.itemsConfirmed ||
    ((a.landedShippingKnown && b.landedShippingKnown) ? a.landedTotal - b.landedTotal : a.effort - b.effort) ||
    ((a.confirmedPartsTotal || Infinity) - (b.confirmedPartsTotal || Infinity)))[0] || null;

  /* Aggregated next actions: the buyer's to-do list for shrinking uncertainty.
     Buy-ready actions are omitted here - they live on the picks themselves. */
  const TODO = new Set([ACTION.CALL_SUPPLIER, ACTION.REQUEST_QUOTE, ACTION.CHECK_IN_STORE,
    ACTION.VERIFY_DIMENSIONS, ACTION.CONFIRM_SHIPPING, ACTION.WAIT_FOR_RESTOCK]);
  const grouped = new Map();
  for (const o of options) {
    if (!TODO.has(o.nextAction.action)) continue;
    const key = o.supplierId + "|" + o.nextAction.action;
    if (!grouped.has(key)) grouped.set(key, {
      action: o.nextAction.action, supplierId: o.supplierId, supplierName: o.supplierName,
      items: [], reason: o.nextAction.reason });
    grouped.get(key).items.push(o.item);
  }
  const nextActions = [...grouped.values()].sort((a, b) => b.items.length - a.items.length);

  /* Warnings: honest caveats on the headline picks. */
  const warnings = [];
  if (uncovered.length)
    warnings.push(`${uncovered.length} material(s) have no confirmed option yet: ` +
      uncovered.map((id) => (materialOf(id) || {}).item || id).join(", "));
  const bestPick = bestOverallValue.basis === "fewestSuppliers" ? fewest
    : bestOverallValue.basis === "fastestAvailability" ? fastest : lowestPrice;
  const softRows = bestPick.rows.filter((r) => r.status && r.status !== MATCH_STATUS.EXACT_CONFIRMED);
  for (const r of softRows)
    warnings.push(`Best confirmed option includes a non-exact line: ${r.item} is ${r.status}` +
      (r.matchNote ? ` (${r.matchNote})` : ""));
  if (lowestPrice.supplierCount > 1)
    warnings.push(`Lowest-cost split uses ${lowestPrice.supplierCount} suppliers = ` +
      `${lowestPrice.supplierCount} shipping charges or trips; a single-supplier order may win in practice.`);
  const unknownShip = supplierSummaries.filter((s) => s.fulfillment === "delivery" && !s.shippingKnown && s.itemsConfirmed > 0);
  if (unknownShip.length)
    warnings.push(`${unknownShip.length} delivery supplier(s) have unknown shipping costs; ` +
      `parts totals are before shipping: ` + unknownShip.map((s) => s.supplierName).join(", "));
  for (const s of supplierSummaries.filter((x) => !x.meetsMinimum && x.itemsConfirmed > 0))
    warnings.push(`${s.supplierName} requires a $${s.minOrderValue} minimum order; this order ` +
      `($${s.confirmedPartsTotal.toFixed(2)}) is $${s.minOrderShortfall.toFixed(2)} short and can't be placed as-is.`);

  return {
    generatedAt: new Date().toISOString(),
    materialCount: materials.length,
    coverage: { covered, uncovered, complete: uncovered.length === 0 },
    axes: { lowestPrice, fastestAvailability: fastest, fewestSuppliers: fewest, deliveryVsPickup, bestOverallValue },
    /* headline picks - what a UI shows as recommendation cards */
    bestConfirmed: bestOverallValue,
    bestPickupCandidate: pickupOptions[0] || null,
    bestConvenience,
    bestLowestCost: { ...lowestPrice,
      reason: "cheapest confirmed line per material; may split across suppliers" },
    bestExactSpec,
    bestPriceToday,
    bestOneStore,
    bestOrganic,
    bestLocal,
    pickupOptions,
    /* uncertainty made visible */
    options,
    supplierSummaries,
    nextActions,
    warnings,
    candidates: candidateList,
    excluded: excludedList,
    mathNote: "Recommendation math uses only confirmed-tier lines (exact_confirmed, " +
      "substitute_confirmed, partial_confirmed with a usable price). Candidate lines are " +
      "listed with reasons, never priced as $0 and never silently dropped.",
  };
}
