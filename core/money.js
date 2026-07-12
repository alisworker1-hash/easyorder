/* EasyOrder core - money & formatting.
   Prices are ALWAYS exact to the cent (a headline EasyOrder principle).
   Internal math is done in integer cents to avoid floating-point drift. */

export function toCents(n)   { return Math.round(Number(n || 0) * 100); }
export function fromCents(c) { return (Number(c) || 0) / 100; }

/* "$3.79" - never rounded or abbreviated. */
export function money(n)        { return "$" + Number(n || 0).toFixed(2); }
export function moneyCents(c)   { return money(fromCents(c)); }

export function lineTotalCents(unitPrice, qty) {
  return toCents(unitPrice) * Math.max(0, Math.floor(Number(qty) || 0));
}
export function lineTotal(unitPrice, qty) { return fromCents(lineTotalCents(unitPrice, qty)); }

export function sumCents(centsList) { return centsList.reduce((a, c) => a + (Number(c) || 0), 0); }

/* round a dollar amount to a clean 2-decimal number (for stored totals) */
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/* THE total-display rule for all UI surfaces: every total shows its cost, and when
   shipping is not confirmed it reads "$16.32 + Shipping" instead of implying free.
   Pass shippingKnown=true for pickup totals and fee-inclusive totals. */
export function displayTotal(n, shippingKnown = true) {
  return money(n) + (shippingKnown ? "" : " + Shipping");
}

/* Landed-cost display for the comparison table: parts + shipping when shipping is known,
   else "parts + Shipping". `ship` is the object from estimateShipping() in shipping.js.
   Confirmed shipping shows a clean total; estimated shipping is tagged "(est.)". */
export function displayLanded(partsSubtotal, ship) {
  if (ship && ship.cost != null) {
    const total = round2(Number(partsSubtotal || 0) + Number(ship.cost));
    if (ship.cost === 0) return money(total) + " (free ship)";
    return money(total) + (ship.confidence === "confirmed" ? " (incl. ship)" : " (est. ship)");
  }
  return money(partsSubtotal) + " + Shipping";
}
