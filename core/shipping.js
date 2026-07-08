/* EasyOrder core - shipping estimation.
   Live per-cart shipping is not available without automating each vendor's checkout, which
   EasyOrder does NOT do. Instead shipping is MODELED and shown with a confidence label:
     confirmed  a real number (pickup = $0, an entered fee, or a calculator quote to the ZIP)
     estimated  derived from a published policy / rate (free-over threshold, flat rate)
     unknown    no basis yet -> shown as "+ Shipping", never faked as free
   This is the "gather shipping information" step of the procurement pipeline. Pure functions. */

import { round2 } from "./money.js";

export const SHIPPING_CONFIDENCE = { CONFIRMED: "confirmed", ESTIMATED: "estimated", UNKNOWN: "unknown" };

/* Estimate shipping for one supplier's quote given the parts subtotal covered.
   Precedence: pickup -> explicit quote.shipping -> confirmed deliveryFee -> supplier policy. */
export function estimateShipping(quote, supplier, partsSubtotal) {
  if (quote && quote.fulfillment === "pickup")
    return ship(0, SHIPPING_CONFIDENCE.CONFIRMED, "pickup", "in-store pickup, no shipping");

  // an explicit per-order shipping figure on the quote (researched or user-entered) wins
  if (quote && quote.shipping && quote.shipping.cost != null)
    return ship(quote.shipping.cost, quote.shipping.confidence || SHIPPING_CONFIDENCE.ESTIMATED,
      quote.shipping.source || "quote", quote.shipping.note || "");

  if (quote && Number(quote.deliveryFee) > 0)
    return ship(Number(quote.deliveryFee), SHIPPING_CONFIDENCE.CONFIRMED, "quote", "");

  const p = supplier && supplier.shippingPolicy;
  if (p) {
    if (p.kind === "free")
      return ship(0, SHIPPING_CONFIDENCE.CONFIRMED, "policy", p.note || "free shipping");

    if (p.kind === "free_over" && p.freeOverThreshold != null) {
      if (partsSubtotal != null && partsSubtotal >= p.freeOverThreshold)
        return ship(0, SHIPPING_CONFIDENCE.ESTIMATED, "policy", `free over $${p.freeOverThreshold}`);
      const under = p.flatRate ?? p.estimate;
      if (under != null)
        return ship(under, SHIPPING_CONFIDENCE.ESTIMATED, "policy",
          p.note || `under the $${p.freeOverThreshold} free-ship threshold`);
      return ship(null, SHIPPING_CONFIDENCE.UNKNOWN, "policy",
        `free over $${p.freeOverThreshold}; under-threshold rate not published`);
    }

    if (p.kind === "flat" && p.flatRate != null)
      return ship(p.flatRate, p.source === "confirmed" ? SHIPPING_CONFIDENCE.CONFIRMED : SHIPPING_CONFIDENCE.ESTIMATED,
        "policy", p.note || "flat rate");

    if (p.kind === "estimate" && p.estimate != null)
      return ship(p.estimate, SHIPPING_CONFIDENCE.ESTIMATED, p.source || "research", p.note || "");

    // calculated (cart-only) / quote_needed / unknown
    return ship(null, SHIPPING_CONFIDENCE.UNKNOWN, "policy", p.note || "shipping shown only at checkout");
  }

  return ship(null, SHIPPING_CONFIDENCE.UNKNOWN, "none", "no shipping data yet");
}

function ship(cost, confidence, source, note) {
  return { cost: cost == null ? null : round2(cost), confidence, source, note };
}

/* Minimum-order gate: some vendors won't fulfill below a dollar floor (e.g. Fasteners
   Direct's $100 minimum). A below-minimum order is not buyable as-is - surface it, don't
   hide the supplier. Returns { ok, minOrderValue, shortfall }. */
export function meetsMinimum(supplier, partsSubtotal) {
  const min = supplier && supplier.shippingPolicy && supplier.shippingPolicy.minOrderValue;
  if (min == null) return { ok: true, minOrderValue: null, shortfall: 0 };
  const ok = Number(partsSubtotal || 0) >= min;
  return { ok, minOrderValue: min, shortfall: ok ? 0 : round2(min - Number(partsSubtotal || 0)) };
}

/* Parts + shipping when known; parts alone (flagged) when not. */
export function landedTotal(partsSubtotal, shipEstimate) {
  const known = shipEstimate && shipEstimate.cost != null;
  return {
    partsSubtotal: round2(partsSubtotal),
    shipping: shipEstimate,
    shippingKnown: !!known,
    total: round2(Number(partsSubtotal || 0) + (known ? shipEstimate.cost : 0)),
  };
}
