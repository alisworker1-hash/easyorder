/* EasyOrder core - Supplier Discovery Engine.
   Discovery runs BEFORE pricing. Given a NEED, produce the SUPPLIER UNIVERSE - who should
   even be considered - spanning national retailers, regional distributors, and local
   family-owned businesses. EasyOrder discovers SOLUTIONS, not just products: a need maps to
   candidate supplier CATEGORIES first, then to specific suppliers.

   Provider-agnostic. Real providers (Places/Maps, supplier directories, industry
   databases, official retailer APIs, merchant-submitted profiles, regional catalogs) plug
   in behind one interface. This module ships the INTERFACE + a DEMO provider backed by the
   curated directory. NO live discovery yet.

   Pipeline position:
     Need -> [DISCOVERY: discover + categorize + rank] -> Gather info ->
     Procurement Intelligence -> Recommendation -> Order -> Learn
*/

/* ---------------- supplier category taxonomy ---------------- */
export const SUPPLIER_CATEGORY = {
  BIG_BOX_RETAILER: "big-box-retailer",
  HARDWARE_STORE: "hardware-store",
  HOME_IMPROVEMENT: "home-improvement",
  INDUSTRIAL_DISTRIBUTOR: "industrial-distributor",
  FASTENER_DISTRIBUTOR: "fastener-distributor",
  LOCAL_BOLT_HOUSE: "local-bolt-house",
  AUTO_PARTS_STORE: "auto-parts-store",
  LUMBER_YARD: "lumber-yard",
  MACHINE_SHOP: "machine-shop",
  WHOLESALE_DISTRIBUTOR: "wholesale-distributor",
  SPECIALTY_MANUFACTURER: "specialty-manufacturer",
  FARM_RANCH_SUPPLY: "farm-ranch-supply",
  SERVICE_PROVIDER: "service-provider",
  GLASS_COMPANY: "glass-company",
  SCREEN_REPAIR: "screen-repair-service",
  WINDOW_COMPANY: "window-company",
  HANDYMAN: "handyman-service",
};

export function labelFor(cat) {
  return String(cat || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------------- solution -> supplier-category expansion ---------------- */
/* "Search for solutions, not products." A need expands to the KINDS of businesses that
   could serve it - including ones the buyer would never think to search. Rule-based demo;
   an LLM can enrich this later (Phase 2) behind the same function signature. */
const C = SUPPLIER_CATEGORY;
const SOLUTION_MAP = [
  { match: /(fastener|bolt|nut|washer|screw|threaded|grade\s*8|zinc|hex)/i,
    categories: [C.FASTENER_DISTRIBUTOR, C.INDUSTRIAL_DISTRIBUTOR, C.HARDWARE_STORE,
      C.BIG_BOX_RETAILER, C.AUTO_PARTS_STORE, C.LOCAL_BOLT_HOUSE, C.WHOLESALE_DISTRIBUTOR,
      C.FARM_RANCH_SUPPLY, C.MACHINE_SHOP] },
  { match: /(window screen|screen repair|screen|mesh)/i,
    categories: [C.SCREEN_REPAIR, C.GLASS_COMPANY, C.WINDOW_COMPANY, C.HARDWARE_STORE,
      C.HOME_IMPROVEMENT, C.HANDYMAN, C.SPECIALTY_MANUFACTURER] },
  { match: /(lumber|plywood|framing|2x4|osb|sheathing|stud)/i,
    categories: [C.LUMBER_YARD, C.HOME_IMPROVEMENT, C.BIG_BOX_RETAILER, C.WHOLESALE_DISTRIBUTOR] },
  { match: /(concrete|cement|rebar|masonry)/i,
    categories: [C.HOME_IMPROVEMENT, C.BIG_BOX_RETAILER, C.WHOLESALE_DISTRIBUTOR, C.LUMBER_YARD] },
  { match: /(flooring|tile|laminate|hardwood floor)/i,
    categories: [C.SPECIALTY_MANUFACTURER, C.HOME_IMPROVEMENT, C.BIG_BOX_RETAILER] },
];
const GENERIC_FALLBACK = [C.BIG_BOX_RETAILER, C.HARDWARE_STORE, C.HOME_IMPROVEMENT, C.WHOLESALE_DISTRIBUTOR];

export function expandSolutionCategories(need) {
  const text = typeof need === "string" ? need
    : [need.query, need.productCategory, need.spec, ...(need.keywords || [])].filter(Boolean).join(" ");
  const cats = new Set();
  for (const rule of SOLUTION_MAP) if (rule.match.test(text)) rule.categories.forEach((c) => cats.add(c));
  if (!cats.size) GENERIC_FALLBACK.forEach((c) => cats.add(c));
  return [...cats];
}

/* ---------------- supplier-level confidence ---------------- */
/* Confidence that a SUPPLIER serves the need's category - distinct from per-line price
   confidence (see intelligence.js). Bands:
     95 high confidence this supplier carries this category
     80 likely supplier, needs confirmation
     60 possible supplier, confirm category
     40 possible supplier worth calling */
export const SUPPLIER_CONFIDENCE = { HIGH: 95, LIKELY: 80, POSSIBLE: 60, WORTH_CALL: 40 };

/* Infer a supplier-category for a directory entry (demo heuristic; real providers supply
   this directly). Uses name + type + product categories. */
export function classifySupplier(s) {
  const n = (s.name || "").toLowerCase();
  const id = (s.id || "").toLowerCase();
  if (/autozone|o'?reilly|auto parts|napa/.test(n) || /autozone|oreilly/.test(id)) return C.AUTO_PARTS_STORE;
  if (/lumber/.test(n)) return C.LUMBER_YARD;
  if (/grainger/.test(n)) return C.INDUSTRIAL_DISTRIBUTOR;
  if (/fastenal|fastener|bolt|fmw/.test(n)) return s.type === "local" ? C.LOCAL_BOLT_HOUSE : C.FASTENER_DISTRIBUTOR;
  if (/tractor supply|farm|ranch/.test(n)) return C.FARM_RANCH_SUPPLY;
  if (/machine|fabricat/.test(n)) return C.MACHINE_SHOP;
  if (/glass/.test(n)) return C.GLASS_COMPANY;
  if (/screen/.test(n)) return C.SCREEN_REPAIR;
  if (/ace|hardware/.test(n)) return C.HARDWARE_STORE;
  if (/home depot|lowe|walmart|amazon|target/.test(n)) return C.BIG_BOX_RETAILER;
  if (s.type === "service") return C.SERVICE_PROVIDER;
  if (s.type === "specialty") return C.SPECIALTY_MANUFACTURER;
  if (s.type === "local") return C.LOCAL_BOLT_HOUSE;
  return C.BIG_BOX_RETAILER;
}

export function supplierRelevance(supplier, need, solutionCategories) {
  const cat = classifySupplier(supplier);
  const inSolution = solutionCategories.includes(cat);
  const productCat = (typeof need === "object" && need.productCategory) || null;
  const carriesProduct = productCat
    ? (supplier.categories || []).includes(productCat)
    : (supplier.categories || []).length > 0;

  let supplierConfidence;
  if (inSolution && carriesProduct) supplierConfidence = SUPPLIER_CONFIDENCE.HIGH;
  else if (inSolution || carriesProduct) supplierConfidence = SUPPLIER_CONFIDENCE.LIKELY;
  else if ((supplier.categories || []).length) supplierConfidence = SUPPLIER_CONFIDENCE.POSSIBLE;
  else supplierConfidence = SUPPLIER_CONFIDENCE.WORTH_CALL;

  const d = Number.isFinite(supplier.distanceMiles) ? supplier.distanceMiles : null;
  const proximityBoost = d == null ? 0 : d <= 10 ? 6 : d <= 25 ? 2 : 0;
  const relevanceScore = Math.max(0, Math.min(100, supplierConfidence + proximityBoost));
  return { supplierCategory: cat, supplierConfidence, relevanceScore, inSolution, carriesProduct, distanceMiles: d };
}

/* ---------------- discovery providers ---------------- */
/* DiscoveryProvider contract (what every provider implements):
     { id, kind, displayName, discover(need, opts) -> Promise<SupplierCandidate[]> }
   kind: "demo" | "places" | "directory" | "industry-db" | "retailer-api"
       | "merchant-profile" | "regional-catalog"
   SupplierCandidate = a Supplier + discovery metadata:
     { ...supplier, discoverySource, supplierCategory, supplierConfidence,
       relevanceScore, distanceMiles, why }
   Real providers are registered later; the engine never calls a provider directly by name. */

export function demoDiscoveryProvider(directory) {
  return {
    id: "demo-directory", kind: "demo", displayName: "Curated demo directory",
    async discover(need, opts = {}) {
      const solutionCategories = opts.solutionCategories || expandSolutionCategories(need);
      const radius = opts.radiusMiles == null ? Infinity : opts.radiusMiles;
      return (directory || [])
        .filter((s) => s.distanceMiles == null || s.distanceMiles <= radius) // online (no distance) always included
        .map((s) => {
          const r = supplierRelevance(s, need, solutionCategories);
          const why = r.inSolution
            ? `${labelFor(r.supplierCategory)} likely to serve this need`
            : r.carriesProduct ? "lists this product category" : "possible source; confirm category";
          return { ...s, discoverySource: "demo", why, ...r };
        })
        // Relevance floor: a candidate must be the RIGHT KIND of business or actually carry
        // the product. This is not "hiding options" (that rule is about missing FIELDS on a
        // relevant supplier) - it's not proposing a flooring store for a bolt order.
        .filter((c) => c.inSolution || c.carriesProduct);
    },
  };
}

/* ---------------- orchestrator ---------------- */
/* Produce the ranked supplier universe. Expands the search radius automatically if too few
   local candidates surface, so local businesses get a fair chance before falling back to
   national/online options. */
export async function discoverSuppliers(need, opts = {}) {
  const providers = (opts.providers && opts.providers.length)
    ? opts.providers
    : (opts.directory ? [demoDiscoveryProvider(opts.directory)] : []);
  const solutionCategories = opts.solutionCategories || expandSolutionCategories(need);
  const minCandidates = opts.minCandidates ?? 5;
  const maxRadius = opts.maxRadiusMiles ?? 100;
  let radius = opts.radiusMiles ?? (opts.location ? 25 : Infinity);

  const gather = async (r) => {
    const seen = new Set();
    const out = [];
    for (const p of providers) {
      const list = await p.discover(need, { ...opts, solutionCategories, radiusMiles: r });
      for (const c of list) {
        const key = c.id || (c.name + "|" + (c.location || ""));
        if (seen.has(key)) continue;
        seen.add(key); out.push(c);
      }
    }
    return out;
  };

  let candidates = await gather(radius);
  while (candidates.length < minCandidates && Number.isFinite(radius) && radius < maxRadius) {
    radius = Math.min(maxRadius, radius * 2);
    candidates = await gather(radius);
  }

  candidates.sort((a, b) =>
    b.relevanceScore - a.relevanceScore ||
    (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999));

  const byCategory = {};
  for (const c of candidates) (byCategory[c.supplierCategory] ||= []).push(c.id || c.name);

  return {
    need: typeof need === "string" ? { query: need } : need,
    solutionCategories,
    radiusMiles: radius,
    candidates,
    byCategory,
    providersUsed: providers.map((p) => ({ id: p.id, kind: p.kind })),
    counts: {
      total: candidates.length,
      local: candidates.filter((c) => c.type === "local").length,
      highConfidence: candidates.filter((c) => c.supplierConfidence >= SUPPLIER_CONFIDENCE.HIGH).length,
    },
    note: "Supplier universe produced BEFORE pricing. Confidence here is category-fit, not " +
      "price. Local businesses are included so they compete on proximity, service, and " +
      "responsiveness - not advertising budget.",
  };
}
