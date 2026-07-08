# EasyOrder - Procurement MVP (Pro, contractor-first)

> The smallest impressive end-to-end procurement workflow, built on `/core` (see
> [ARCHITECTURE.md](ARCHITECTURE.md)). First pilot: a general contractor.

## Scope

**In:** manual material entry → supplier selection → RFQ generation → mass send-prep →
response tracking → comparison → recommendation. Mock/demo pricing where live pricing isn't
available. A universal command bar as the entry point.

**Intentionally out (for now):** AI-generated bills of materials (postponed for AI-cost
reasons - assume the user already knows what they need), account linking, scraping, real
payments, team/multi-user workflows.

## MVP workflow

1. Create a **Project** or **Shopping List**.
2. Enter materials manually.
3. Select suppliers.
4. Compare available pricing (mock/demo where necessary).
5. Generate RFQs.
6. Send many RFQs at once.
7. Track responses.
8. Compare responses.
9. Recommend the best purchasing strategy.

## Workspaces in the MVP slice

The Pro shell (`/pro`) hosts the primary nav. The MVP lights up this thread end-to-end:

- **Command Bar** - "What do you need today?" routes intent to the right workspace
  (rule-based intent in `core/intent.js`; e.g. "Build a shed" → new Project + shed sample).
- **Projects / Shopping Lists** - create a project; add a material list (standalone lists
  also supported).
- **Material List Builder** - per line: item, qty, unit, size/dimensions, spec/quality,
  needed-by date, delivery vs pickup, notes. Persisted via `core/storage.js` (`eo.pro.*`).
- **Suppliers** - directory from `data/suppliers.json`; filter by category; multi-select as
  RFQ targets.
- **RFQs** - `core/rfq.js` generates a clean quote-request email per selected supplier from
  the material list; copy-to-clipboard + `mailto:`; **mass mode** prepares all targets at
  once.
- **Quote Response Entry** - paste/enter each supplier's reply manually (per-line unit
  price, availability, lead days, delivery fee, fulfillment).
- **Quote Comparison** - matrix: rows = materials, columns = suppliers; cell = unit price ×
  qty + availability/lead flags; per-supplier basket totals.
- **Recommendation Card** - computed picks (below).

## Data shapes (see `core/models.js` for the canonical definitions)

**MaterialLine**
```json
{ "id": "m1", "item": "2x4x8 PT Lumber", "qty": 40, "unit": "each",
  "size": "2in x 4in x 8ft", "spec": "PT #2 SYP", "neededBy": "2026-07-15",
  "fulfillment": "delivery", "notes": "Ground-contact rated" }
```

**Supplier** (`data/suppliers.json`)
```json
{ "id": "home-depot", "name": "The Home Depot", "type": "big-box",
  "categories": ["lumber","fasteners","concrete"], "email": "quotes@example.com",
  "deliveryAvailable": true, "leadTimeNote": "2-4 days", "logo": "🟧" }
```

**Quote** (`eo.pro.quotes`)
```json
{ "supplierId": "home-depot", "rfqId": "rfq-001", "receivedAt": "2026-06-29",
  "lineItems": [{ "materialId": "m1", "unitPrice": 5.48, "available": true, "leadDays": 3,
                  "status": "exact_confirmed", "matchNote": "" }],
  "deliveryFee": 79.00, "fulfillment": "delivery", "notes": "" }
```

**Line confidence statuses** (`MATCH_STATUS` in `core/models.js`): `exact_confirmed`,
`substitute_confirmed`, `partial_confirmed`, `price_unconfirmed`,
`availability_unconfirmed`, `in_store_verification_needed`, `not_recommended`.
The first three enter recommendation math; the rest surface as labeled **candidates** with
a reason. A convenient option is never discarded for a missing field, and an unconfirmed
price is never treated as $0 or as unavailable. `recommend()` returns both a **best
confirmed option** and a **best convenient pickup candidate**, plus the candidate and
exclusion lists with human-readable reasons.

On top of statuses sits the **procurement intelligence layer** (see
[INTELLIGENCE.md](INTELLIGENCE.md)): per-option confidence scores (0-100, explainable),
missing-field tracking, a next-best-action per option, procurement effort/convenience
scoring, supplier memory seams, and headline picks (`bestConvenience`, `bestExactSpec`,
`bestLowestCost`) with warnings. The engine never stops on missing data; it surfaces the
gap and recommends the action that closes it.

State is namespaced `eo.pro.*` so it never collides with the storefront's `eo.*` keys.

## Recommendation logic (`core/recommend.js`, pure, no AI required)

Computed from entered quotes only:

- **Lowest price** - cheapest line-item totals; cheapest single-supplier basket.
- **Fastest availability** - minimize max lead time across the basket.
- **Fewest suppliers** - smallest supplier set that covers all materials.
- **Delivery vs pickup** - total each way, including delivery fees.
- **Best overall value** - explainable weighted score (price + lead + supplier count +
  fulfillment fit); weights visible and tweakable, not a black box.

Keeping this deterministic makes the "AI-assisted procurement" story credible without
burning AI budget. A later phase adds an LLM layer for parsing pasted quotes and drafting
RFQ copy, plugging into the existing proxy.

## Demo vs live

All pricing/availability in the MVP is **mock and labeled DEMO** in the UI. Live pricing
attaches later through the adapter interface in `/integrations` - demo data and live logic
never tangle (see [INTEGRATIONS.md](INTEGRATIONS.md)).

## Definition of done (MVP)

A contractor can: open the command bar → "Build a shed" → land in a pre-seeded Project →
review/edit the material list → pick suppliers → generate and mass-prepare RFQ emails →
paste back a few quotes → see the comparison matrix → get a recommendation across all five
axes. No scraping, no account linking, baseline storefront untouched.
