/* EasyOrder core - procurement intelligence.
   Principle: NEVER stop because data is missing. Make uncertainty visible (confidence
   score + missing fields) and recommend the next best action. Pure functions, no DOM.

   Concepts:
     confidenceScore   0-100 per supplier/item option, band-aligned and explainable
     missingFieldsFor  which facts are unknown (price, dims, finish, shipping, ...)
     nextActionFor     the single next best procurement action for an option
     procurementEffort how much work/friction an option costs the buyer (0 = effortless)
*/

import { MATCH_STATUS, PRICE_CONFIDENCE, derivePriceConfidence } from "./models.js";

/* ---------------- missing fields ---------------- */

export const MISSING_FIELD = {
  PRICE: "price",
  AVAILABILITY: "availability",
  DIMENSIONS: "dimensions",
  FINISH: "finish",
  GRADE: "grade",
  PACK_QUANTITY: "pack_quantity",
  SHIPPING: "shipping",
  PICKUP_STATUS: "pickup_status",
  SUPPLIER_CONTACT: "supplier_contact",
};

/* Shipping is "known" when: pickup (not applicable), an explicit fee > 0, or the quote
   says so. deliveryFee 0 on a delivery quote means UNKNOWN unless shippingKnown: true. */
export function shippingKnown(quote) {
  if (!quote) return false;
  if (quote.fulfillment === "pickup") return true;
  if (quote.shippingKnown === true) return true;
  return Number(quote.deliveryFee) > 0;
}

/* Merge researcher-declared gaps (line.missingFields) with derivable ones. */
export function missingFieldsFor(line, quote, supplier) {
  const out = new Set(Array.isArray(line.missingFields) ? line.missingFields : []);
  if (line.unitPrice == null) out.add(MISSING_FIELD.PRICE);
  if (line.available === false || line.status === MATCH_STATUS.AVAILABILITY_UNCONFIRMED)
    out.add(MISSING_FIELD.AVAILABILITY);
  if (quote && quote.fulfillment === "delivery" && !shippingKnown(quote))
    out.add(MISSING_FIELD.SHIPPING);
  if (supplier && !supplier.email && !supplier.phone)
    out.add(MISSING_FIELD.SUPPLIER_CONTACT);
  return [...out];
}

/* ---------------- confidence score ---------------- */
/* Band anchors (product spec):
     100 exact confirmed with price + availability
      95 likely exact, one minor field missing
      80 likely usable substitute
      60 promising but needs supplier confirmation
      40 weak candidate (floor for anything still worth showing)
       0 not recommended
   Score = status base − 5 per missing field beyond what the status already implies,
   clamped to [40, 100] for live options. Fully explainable via `deductions`. */

const STATUS_BASE = {
  [MATCH_STATUS.EXACT_CONFIRMED]: 100,
  [MATCH_STATUS.PARTIAL_CONFIRMED]: 95,
  [MATCH_STATUS.SUBSTITUTE_CONFIRMED]: 80,
  [MATCH_STATUS.AVAILABILITY_UNCONFIRMED]: 65,
  [MATCH_STATUS.IN_STORE_VERIFICATION_NEEDED]: 60,
  [MATCH_STATUS.PRICE_UNCONFIRMED]: 60,
  [MATCH_STATUS.NOT_RECOMMENDED]: 0,
};
/* How many missing fields the status itself already accounts for (not re-deducted). */
const STATUS_IMPLIES = {
  [MATCH_STATUS.PARTIAL_CONFIRMED]: 1,
  [MATCH_STATUS.AVAILABILITY_UNCONFIRMED]: 1,
  [MATCH_STATUS.IN_STORE_VERIFICATION_NEEDED]: 1,
  [MATCH_STATUS.PRICE_UNCONFIRMED]: 1,
};

/* Non-confirmed PRICE confidence lowers the option score (a demo/snippet number is less
   trustworthy than a page-confirmed one), and is shown as an explainable deduction. */
const PRICE_PENALTY = { [PRICE_CONFIDENCE.ESTIMATED]: 5, [PRICE_CONFIDENCE.DEMO]: 10 };

export function confidenceScore(line, quote, supplier) {
  const status = line.status || MATCH_STATUS.EXACT_CONFIRMED;
  const base = STATUS_BASE[status] ?? 60;
  if (status === MATCH_STATUS.NOT_RECOMMENDED)
    return { score: 0, base: 0, deductions: [], missingFields: missingFieldsFor(line, quote, supplier),
             priceConfidence: derivePriceConfidence(line) };
  const missing = missingFieldsFor(line, quote, supplier);
  const implied = STATUS_IMPLIES[status] || 0;
  const extra = Math.max(0, missing.length - implied);
  const deductions = missing.slice(implied).map((f) => ({ field: f, points: 5 }));
  const priceConfidence = derivePriceConfidence(line);
  const pricePenalty = PRICE_PENALTY[priceConfidence] || 0;
  if (pricePenalty) deductions.push({ field: priceConfidence, points: pricePenalty });
  const score = Math.max(40, Math.min(100, base - 5 * extra - pricePenalty));
  return { score, base, deductions, missingFields: missing, priceConfidence };
}

/* ---------------- next best action ---------------- */

export const ACTION = {
  BUY_NOW: "buy_now",
  ADD_TO_CART: "add_to_cart",
  CALL_SUPPLIER: "call_supplier",
  REQUEST_QUOTE: "request_quote",
  VERIFY_DIMENSIONS: "verify_dimensions",
  CHECK_IN_STORE: "check_in_store",
  CONFIRM_SHIPPING: "confirm_shipping",
  WAIT_FOR_RESTOCK: "wait_for_restock",
  DO_NOT_BUY: "do_not_buy",
};

export function nextActionFor(line, quote, supplier) {
  const status = line.status || MATCH_STATUS.EXACT_CONFIRMED;
  const pickup = quote && quote.fulfillment === "pickup";
  const missing = missingFieldsFor(line, quote, supplier);
  const has = (f) => missing.includes(f);

  if (status === MATCH_STATUS.NOT_RECOMMENDED)
    return { action: ACTION.DO_NOT_BUY, reason: line.matchNote || "poor fit for this need" };
  if (line.available === false && line.unitPrice != null)
    return { action: ACTION.WAIT_FOR_RESTOCK, reason: "priced but currently out of stock" };
  if (status === MATCH_STATUS.IN_STORE_VERIFICATION_NEEDED)
    return { action: ACTION.CHECK_IN_STORE, reason: line.matchNote || "stocked in-store; confirm at the counter" };
  if (status === MATCH_STATUS.PRICE_UNCONFIRMED) {
    if (supplier && supplier.phone)
      return { action: ACTION.CALL_SUPPLIER, reason: "no published price; a phone call gets a quote fastest" };
    return { action: ACTION.REQUEST_QUOTE, reason: "no published price; send an RFQ" };
  }
  if (status === MATCH_STATUS.AVAILABILITY_UNCONFIRMED) {
    return pickup
      ? { action: ACTION.CHECK_IN_STORE, reason: line.matchNote || "price seen but stock/pack count unconfirmed" }
      : { action: ACTION.ADD_TO_CART, reason: "price seen; final price/stock will confirm in cart" };
  }
  if (has(MISSING_FIELD.DIMENSIONS) || has(MISSING_FIELD.FINISH) || has(MISSING_FIELD.GRADE))
    return { action: ACTION.VERIFY_DIMENSIONS, reason: "spec fields unconfirmed (" +
      missing.filter((f) => ["dimensions", "finish", "grade"].includes(f)).join(", ") + ")" };
  if (has(MISSING_FIELD.PACK_QUANTITY))
    return pickup
      ? { action: ACTION.CHECK_IN_STORE, reason: "pack quantity unconfirmed; check the package" }
      : { action: ACTION.CONFIRM_SHIPPING, reason: "pack quantity unconfirmed; confirm before ordering" };
  if (!pickup && has(MISSING_FIELD.SHIPPING))
    return { action: ACTION.CONFIRM_SHIPPING, reason: "parts price confirmed; shipping cost unknown" };
  if (pickup)
    return { action: ACTION.BUY_NOW, reason: "confirmed and ready for pickup" };
  return { action: ACTION.ADD_TO_CART, reason: "confirmed; order online" };
}

/* ---------------- procurement effort ---------------- */
/* 0 = effortless, 100 = high effort. convenience = 100 - effort.
   Factors: distance (pickup), shipping wait + unknown shipping (delivery), lead time,
   per-line verification work, substitutes to double-check, missing supplier contact. */

export function procurementEffort(quote, supplier, materials) {
  const factors = [];
  const add = (points, factor, note) => { if (points > 0) factors.push({ factor, points: Math.round(points), note }); };

  const pickup = quote.fulfillment === "pickup";
  const dist = supplier && Number.isFinite(supplier.distanceMiles) ? supplier.distanceMiles : null;
  if (pickup) {
    if (dist == null) add(10, "distance", "distance unknown");
    else add(Math.min(30, dist), "distance", `~${dist} mi drive`);
  } else {
    add(12, "shipping-wait", "delivery instead of pickup");
    if (!shippingKnown(quote)) add(10, "shipping-unknown", "shipping cost unknown");
  }

  let maxLead = 0, verify = 0, subs = 0;
  for (const li of quote.lineItems || []) {
    if (!materials.find((m) => m.id === li.materialId)) continue;
    const s = li.status || MATCH_STATUS.EXACT_CONFIRMED;
    if (Number.isFinite(li.leadDays)) maxLead = Math.max(maxLead, li.leadDays);
    if ([MATCH_STATUS.PRICE_UNCONFIRMED, MATCH_STATUS.AVAILABILITY_UNCONFIRMED,
         MATCH_STATUS.IN_STORE_VERIFICATION_NEEDED].includes(s)) verify++;
    if ([MATCH_STATUS.SUBSTITUTE_CONFIRMED, MATCH_STATUS.PARTIAL_CONFIRMED].includes(s)) subs++;
  }
  add(maxLead * 3, "lead-time", `${maxLead} day max lead`);
  add(verify * 8, "verification", `${verify} line(s) need verification`);
  add(subs * 4, "substitute-check", `${subs} substitute/partial line(s) to double-check`);
  if (supplier && !supplier.email && !supplier.phone) add(5, "no-contact", "no contact on file");

  const score = Math.min(100, factors.reduce((a, f) => a + f.points, 0));
  return { score, convenience: 100 - score, factors };
}

/* ---------------- per-option evaluation (the UI's row model) ---------------- */

export function evaluateOption(line, quote, supplier, material) {
  const conf = confidenceScore(line, quote, supplier);
  return {
    supplierId: quote.supplierId,
    supplierName: (supplier && supplier.name) || quote.supplierId,
    materialId: line.materialId,
    item: (material && material.item) || line.materialId,
    status: line.status || MATCH_STATUS.EXACT_CONFIRMED,
    unitPrice: line.unitPrice == null ? null : Number(line.unitPrice),
    priceConfidence: conf.priceConfidence,
    leadDays: line.leadDays == null ? null : Number(line.leadDays),
    fulfillment: quote.fulfillment,
    confidence: conf.score,
    confidenceDetail: { base: conf.base, deductions: conf.deductions },
    missingFields: conf.missingFields,
    nextAction: nextActionFor(line, quote, supplier),
    ...(line.matchNote ? { matchNote: line.matchNote } : {}),
  };
}
