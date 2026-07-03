/* EasyOrder core - supplier directory helpers. Pure functions over plain arrays. */

export function filterSuppliers(suppliers, { category = null, type = null, query = null } = {}) {
  let list = (suppliers || []).slice();
  if (category) list = list.filter((s) => (s.categories || []).includes(category));
  if (type)     list = list.filter((s) => s.type === type);
  if (query) {
    const q = String(query).toLowerCase();
    list = list.filter((s) => (s.name + " " + (s.categories || []).join(" ")).toLowerCase().includes(q));
  }
  return list;
}

/* Suppliers that can plausibly serve a material list, by category overlap.
   If the materials carry no category, returns all suppliers (no basis to narrow). */
export function suppliersForMaterials(suppliers, materials) {
  const cats = new Set((materials || []).map((m) => m.category).filter(Boolean));
  if (!cats.size) return (suppliers || []).slice();
  return (suppliers || []).filter((s) => (s.categories || []).some((c) => cats.has(c)));
}

/* Optional convenience loader (browser fetch / Node 18+ fetch). Keeps the engine usable
   without it - callers may pass already-loaded arrays everywhere else. */
export async function fetchSuppliers(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
