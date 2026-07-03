# EasyOrder - Supplier Discovery Engine

> Discovery is the value. EasyOrder helps buyers find the BEST supplier for a need - which
> may be a national retailer, a regional distributor, or a local family-owned business -
> not the biggest supplier. Implemented in `core/discovery.js`. Aligns to the North Star in
> [PRODUCT_VISION.md](PRODUCT_VISION.md).

## Why discovery is a first-class engine

EasyOrder is a **Procurement Discovery Platform**. Two engines:

- **Supplier Discovery Engine** (`core/discovery.js`) - decides WHO should even be
  considered. Produces the supplier universe *before* pricing.
- **Procurement Intelligence / Recommendation** (`core/recommend.js`, `core/intelligence.js`)
  - decides who should WIN, once information is gathered.

The pipeline:

```
Need
  -> Understand the procurement problem
  -> DISCOVER suppliers            (discovery.js: universe before pricing)
  -> Gather information            (adapters + RFQ workflow: price, stock, lead, shipping)
  -> Procurement Intelligence      (confidence, missing fields, effort)
  -> Recommendation                (best confirmed / pickup / convenience / exact-spec / cost)
  -> Order
  -> Learn                         (supplier memory)
```

Supplier Discovery comes **before** pricing. That is the architectural change.

## Search for solutions, not products

A traditional site searches the literal product. EasyOrder expands a need into the KINDS of
businesses that could solve it - including ones the buyer would never think to search.

`expandSolutionCategories(need)` maps a need to candidate **supplier categories**:

- "yellow-zinc Grade 8 hardware" -> fastener distributor, industrial distributor, hardware
  store, big-box retailer, auto parts store, local bolt house, wholesale distributor, farm
  & ranch supply, machine shop
- "replacement window screen" -> screen-repair service, glass company, window company,
  hardware store, home improvement, handyman, specialty manufacturer

Rule-based today; an LLM can enrich the same function later (Phase 2) without changing its
signature or callers.

## Supplier-level confidence (distinct from price confidence)

Discovery scores how confident we are a supplier **serves the need's category** - separate
from the per-line price confidence in [INTELLIGENCE.md](INTELLIGENCE.md):

| Score | Meaning |
|---|---|
| 95 | high confidence this supplier carries this category |
| 80 | likely supplier, needs confirmation |
| 60 | possible supplier, confirm category |
| 40 | possible supplier worth calling |

`supplierRelevance(supplier, need, solutionCategories)` returns `{ supplierCategory,
supplierConfidence, relevanceScore, inSolution, carriesProduct, distanceMiles }`.
`relevanceScore` adds a small proximity boost so nearby locals rank fairly. This flows
into `recommend()` output as `supplierSummaries[].supplierConfidence`.

## Never hide a supplier

If one field is missing, EasyOrder displays the supplier, explains what is missing, and
recommends the next best action (Verify Dimensions, Call Supplier, Check In Store, Request
Quote). The hardware test proved the point: AutoZone was nearly excluded over one
unavailable online spec - that is not how buyers think. Discovery surfaces the option;
intelligence labels the uncertainty; the buyer decides.

## Local businesses are part of the mission

EasyOrder actively helps users find local suppliers they would otherwise never encounter -
independent hardware stores, industrial suppliers, lumber yards, specialty distributors,
repair and fabrication shops, family-owned businesses. The orchestrator **expands the
search radius automatically** if too few local candidates surface, and gives proximity a
ranking boost, so a local supplier competes on service, expertise, responsiveness, and
proximity - not advertising budget. This is a core company value, encoded in the ranking.

## Provider-agnostic adapters (interfaces only; no live discovery yet)

Every discovery source implements one contract:

```
DiscoveryProvider
  id, kind, displayName
  discover(need, opts) -> Promise<SupplierCandidate[]>

kind: "demo" | "places" | "directory" | "industry-db"
    | "retailer-api" | "merchant-profile" | "regional-catalog"

SupplierCandidate = Supplier + { discoverySource, supplierCategory,
  supplierConfidence, relevanceScore, distanceMiles, why }
```

Planned real providers (Phase 3), all behind this interface:

| Provider kind | Source | Discovers |
|---|---|---|
| `places` | Google Business / Maps places APIs | local businesses by category + location |
| `directory` | supplier directories | listed distributors and vendors |
| `industry-db` | industry databases | specialty manufacturers, wholesalers |
| `retailer-api` | official retailer APIs | national/regional retail coverage |
| `merchant-profile` | merchant-submitted profiles | businesses that opt in to EasyOrder |
| `regional-catalog` | maintained regional catalogs | curated local/regional supply |

**Today only the `demo` provider exists** (`demoDiscoveryProvider(directory)`), reading the
curated `data/suppliers.json`. It proves the interface end-to-end with zero live calls. The
engine never calls a provider by name; it iterates whatever providers are registered, so
adding a live provider later is registration, not a rewrite. No scraping, no auth bypass -
official APIs and opt-in profiles only (see [INTEGRATIONS.md](INTEGRATIONS.md)).

## Orchestrator output (`discoverSuppliers`)

`discoverSuppliers(need, { directory | providers, location, radiusMiles, minCandidates })`
returns:

- `solutionCategories` - the expanded supplier categories searched
- `candidates` - ranked SupplierCandidates (relevance desc, then distance)
- `byCategory` - candidates grouped by supplier category
- `providersUsed`, `radiusMiles` - provenance of the search
- `counts` - total / local / high-confidence
- `note` - the local-business fairness statement

This universe feeds the gather + recommendation steps: quotes attach to discovered
candidates, then `recommend(materials, quotes, { suppliers: candidates })` runs as today.

## Supplier memory (grows from discovery + outcomes)

Memory (seam in `core/models.js`) will eventually answer: who responds fastest, who prices
best, who specializes in this category, who won similar purchases before, who this
user/company prefers, and which local suppliers consistently beat national chains. Discovery
feeds memory (new candidates), and memory feeds discovery (past winners rank higher).
