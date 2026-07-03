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
