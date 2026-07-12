/* EasyOrder core - canonical data models.
   DOM-independent, no dependencies. Shared by EasyOrder Home and Pro.
   Every model is a plain object so it serializes cleanly to localStorage / JSON.

   Model overview:
     Project       container: shopping lists, RFQs, orders, suppliers, notes, files
     ShoppingList  a set of MaterialLines (standalone or inside a Project)
     MaterialLine  one thing to buy: item, qty, size, spec, needed-by, fulfillment
     Supplier      a place to buy from (big-box / local / specialty / service)
     RFQ           a material list addressed to one supplier (draft → sent → responded)
     Quote         a supplier's response: per-line price, availability, lead time
     Order         a chosen purchasing path derived from accepted quotes
     Recommendation computed picks across the optimization axes (see recommend.js)
*/

export const FULFILLMENT   = { DELIVERY: "delivery", PICKUP: "pickup" };
export const RFQ_STATUS     = { DRAFT: "draft", SENT: "sent", RESPONDED: "responded", CLOSED: "closed" };
export const ORDER_STATUS   = { PLANNED: "planned", PLACED: "placed", RECEIVED: "received" };
export const SUPPLIER_TYPE  = { BIG_BOX: "big-box", LOCAL: "local", SPECIALTY: "specialty", SERVICE: "service" };

/* Confidence status of a quote line. A procurement view must NOT discard convenient
   options just because a field is unconfirmed - it labels them instead.
     exact_confirmed              spec + price + availability all confirmed
     substitute_confirmed         price/availability confirmed, but spec deviates (say how in matchNote)
     partial_confirmed            usable price, but some field is shaky (pack minimum, grade unstated, ...)
     price_unconfirmed            item exists, price could not be confirmed
     availability_unconfirmed     price seen, stock/pack-count not confirmed
     in_store_verification_needed likely available locally, but must be checked at the counter
     not_recommended              carried, but a poor fit (say why in matchNote)
   The first three ("confirmed" tier) enter recommendation math; the rest surface as
   labeled CANDIDATES with a reason, never as zero-cost or silently dropped. */
export const MATCH_STATUS = {
  EXACT_CONFIRMED: "exact_confirmed",
  SUBSTITUTE_CONFIRMED: "substitute_confirmed",
  PARTIAL_CONFIRMED: "partial_confirmed",
  PRICE_UNCONFIRMED: "price_unconfirmed",
  AVAILABILITY_UNCONFIRMED: "availability_unconfirmed",
  IN_STORE_VERIFICATION_NEEDED: "in_store_verification_needed",
  NOT_RECOMMENDED: "not_recommended",
};
export const CONFIRMED_STATUSES = new Set([
  MATCH_STATUS.EXACT_CONFIRMED, MATCH_STATUS.SUBSTITUTE_CONFIRMED, MATCH_STATUS.PARTIAL_CONFIRMED,
]);

/* Legacy quotes have no status: derive one so old data keeps working. */
export function deriveLineStatus(li) {
  if (li.status) return li.status;
  if (li.unitPrice == null) return MATCH_STATUS.PRICE_UNCONFIRMED;
  if (li.available === false) return MATCH_STATUS.AVAILABILITY_UNCONFIRMED;
  return MATCH_STATUS.EXACT_CONFIRMED;
}

/* Price confidence is ORTHOGONAL to match status: a line can be an exact product match
   whose PRICE is only a snippet/demo figure. Distinguishes how much to trust the number.
     price_confirmed  seen on the vendor's own product page
     price_estimated  derived/averaged (a tracker, a pack-to-unit computation)
     price_demo       snippet / ad recap / manually entered placeholder
     price_unknown    no number at all (never treated as $0) */
export const PRICE_CONFIDENCE = {
  CONFIRMED: "price_confirmed", ESTIMATED: "price_estimated",
  DEMO: "price_demo", UNKNOWN: "price_unknown",
};
export const PRICE_CONFIDENCE_RANK = {
  price_confirmed: 3, price_estimated: 2, price_demo: 1, price_unknown: 0,
};
/* Read a line's price confidence; default keeps legacy priced lines "confirmed". */
export function derivePriceConfidence(li) {
  if (li && li.priceConfidence && PRICE_CONFIDENCE_RANK[li.priceConfidence] != null) return li.priceConfidence;
  return (li && li.unitPrice != null) ? PRICE_CONFIDENCE.CONFIRMED : PRICE_CONFIDENCE.UNKNOWN;
}

/* ---- ids & time (kept tiny so models stay dependency-free) ---- */
let _seq = 0;
export function uid(prefix = "id") {
  const rnd = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : (Date.now().toString(36) + (_seq++).toString(36));
  return `${prefix}_${rnd}`;
}
function nowISO() { return new Date().toISOString(); }

/* ---- factories ---- */

export function createProject({ name, client = null, notes = "", neededBy = null } = {}) {
  return {
    id: uid("prj"), type: "project",
    name: name || "Untitled project", client, notes, neededBy,
    shoppingListIds: [], rfqIds: [], orderIds: [], supplierIds: [], files: [],
    createdAt: nowISO(),
  };
}

export function createShoppingList({ name, projectId = null } = {}) {
  return {
    id: uid("list"), type: "shoppingList",
    name: name || "Shopping list", projectId,
    materials: [], createdAt: nowISO(),
  };
}

export function createMaterialLine({
  item, qty = 1, unit = "each", size = "", spec = "", category = "",
  neededBy = null, fulfillment = FULFILLMENT.DELIVERY, notes = "",
} = {}) {
  return {
    id: uid("mat"),
    item: item || "", qty: Math.max(0, Number(qty) || 0), unit,
    size, spec, category, neededBy,
    fulfillment: fulfillment === FULFILLMENT.PICKUP ? FULFILLMENT.PICKUP : FULFILLMENT.DELIVERY,
    notes,
  };
}

/* Supplier memory - the seam for future supplier intelligence (not a CRM yet).
   The engine only reads/writes these fields; no workflow is built on them. */
export function createSupplierMemory() {
  return {
    previousQuoteIds: [],      // quote ids received from this supplier
    avgResponseDays: null,     // how fast they answer RFQs
    preferredContact: null,    // "phone" | "email" | "counter"
    reliabilityNotes: "",      // free text: "always accurate", "slow in summer", ...
    pricingHistory: [],        // [{ date, materialKey, unitPrice }]
    successfulPurchases: 0,    // completed orders
    userNotes: "",             // anything the buyer wants to remember
  };
}

/* Shipping policy - how a supplier charges for delivery, used to ESTIMATE landed cost
   before checkout (see core/shipping.js). kind:
     "free"       always free
     "free_over"  free at/over freeOverThreshold; flatRate/estimate applies under it
     "flat"       flatRate for a small order
     "estimate"   a researched estimate figure (estimate)
     "calculated" shown only in cart (no pre-checkout number) -> unknown
     "quote_needed" / "unknown"
   source: "confirmed" | "research" | "policy-page". */
export function createShippingPolicy({ kind = "unknown", flatRate = null, freeOverThreshold = null,
  estimate = null, minOrderValue = null, source = "policy-page", note = "" } = {}) {
  return { kind, flatRate, freeOverThreshold, estimate, minOrderValue, source, note };
}

export function createSupplier({
  name, type = SUPPLIER_TYPE.LOCAL, categories = [], email = "", phone = "",
  location = "", distanceMiles = null, deliveryAvailable = true, leadTimeNote = "", logo = "🏪",
  shippingPolicy = null, memory = null,
} = {}) {
  return {
    id: uid("sup"), type, name: name || "", categories,
    email, phone, location,
    distanceMiles: distanceMiles == null ? null : Number(distanceMiles),
    deliveryAvailable, leadTimeNote, logo,
    shippingPolicy: shippingPolicy || null,
    memory: memory || createSupplierMemory(),
  };
}

export function createRFQ({
  projectId = null, shoppingListId = null, supplierId, materialIds = [], neededBy = null,
} = {}) {
  return {
    id: uid("rfq"), type: "rfq",
    projectId, shoppingListId, supplierId, materialIds,
    status: RFQ_STATUS.DRAFT, createdAt: nowISO(), neededBy,
  };
}

/* A Quote line: { materialId, unitPrice, available, leadDays, status?, matchNote?, missingFields? }
   Quote-level: shippingKnown marks whether the delivery cost is a real number
   (deliveryFee 0 on a delivery quote otherwise means UNKNOWN, not free). */
export function createQuote({
  rfqId = null, supplierId, lineItems = [], deliveryFee = 0,
  fulfillment = FULFILLMENT.DELIVERY, receivedAt = null, notes = "", shippingKnown = null,
} = {}) {
  return {
    id: uid("quote"), type: "quote",
    rfqId, supplierId,
    lineItems: lineItems.map((li) => {
      const line = {
        materialId: li.materialId,
        unitPrice: li.unitPrice == null ? null : Number(li.unitPrice),
        available: li.available !== false,
        leadDays: li.leadDays == null ? null : Number(li.leadDays),
      };
      line.status = li.status && Object.values(MATCH_STATUS).includes(li.status)
        ? li.status : deriveLineStatus(line);
      line.priceConfidence = derivePriceConfidence(li);
      if (li.matchNote) line.matchNote = String(li.matchNote);
      if (Array.isArray(li.missingFields) && li.missingFields.length) line.missingFields = li.missingFields;
      return line;
    }),
    deliveryFee: Number(deliveryFee) || 0,
    fulfillment, receivedAt: receivedAt || nowISO(), notes,
    ...(shippingKnown == null ? {} : { shippingKnown: !!shippingKnown }),
  };
}

export function createOrder({
  projectId = null, supplierId, lineItems = [], total = 0,
  fulfillment = FULFILLMENT.DELIVERY, status = ORDER_STATUS.PLANNED,
} = {}) {
  return {
    id: uid("ord"), type: "order",
    projectId, supplierId, lineItems, total: Number(total) || 0,
    fulfillment, status, createdAt: nowISO(),
  };
}
