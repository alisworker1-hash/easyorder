# EasyOrder Pro - UI Specification (/pro)

> Design contract for the Pro workspace. Every UI section maps to specific engine fields;
> the UI layer stays thin because the engine already computed everything. Static site,
> no framework, ES modules importing `/core`. Nothing here touches the storefront.

## Global display rules

1. **Every total shows its cost.** Use `displayTotal(n, shippingKnown)` from
   `core/money.js`: confirmed-shipping and pickup totals render `$16.32`; anything with
   unconfirmed shipping renders `$16.32 + Shipping`. Never imply free shipping.
   For multi-supplier baskets, `shippingKnown` is true only if EVERY member supplier's
   shipping is known.
2. **Prices are exact to the cent.** `money()` everywhere, never rounded.
3. **Uncertainty is visible, not hidden.** Confidence badge + missing-field chips on every
   option; a labeled candidate is a row, not a footnote (see INTELLIGENCE.md).
4. **DEMO/provenance labeling.** Data provenance (`_provenance`, researched vs demo) shows
   as a small badge per supplier.

## Page shell (all pages)

```
┌──────────────────────────────────────────────────────────────────┐
│  [EasyOrder Pro logo]   [🔍 What do you need today?          ]   │  ← Command Bar
├───────────┬──────────────────────────────────────────────────────┤
│ Dashboard │                                                      │
│ Projects  │                 <active workspace>                   │
│ Lists     │                                                      │
│ RFQs      │                                                      │
│ Suppliers │                                                      │
│ Orders    │                                                      │
│ Assistant │                                                      │
└───────────┴──────────────────────────────────────────────────────┘
```

### Command Bar (global, focused on load)
| Displays | Engine source |
|---|---|
| Input "What do you need today?" | `core/intent.js` → **NOT BUILT YET** (the one missing engine piece; see Build order) |
| Intent result chips ("Open project…", "New list…", "Show quotes…") | `intent.resolve(text)` → `{ workspace, action, args }` |
| Fallback | no match → new Shopping List pre-named with the typed text |

Rule-based v1 (regex/keyword → route). The AI Assistant nav item hosts the LLM version
later (Phase 2), reusing the storefront's proxy pattern.

## 1. Dashboard

Purpose: "where do I stand, what should I do next."

| Section | Engine source |
|---|---|
| Active projects cards (name, client, neededBy, counts) | `Project` records from `proStore` |
| Open RFQs strip (draft / sent / responded counts) | `RFQ.status` across store |
| **Next Actions preview** (top 3-5) | `recommend().nextActions` of the active project |
| Headline pick teaser ("Best plan: Albany County $15.76 + Shipping") | `recommend().bestConfirmed` + `displayTotal` |
| Warnings count badge | `recommend().warnings.length` |

## 2. Projects (list + detail)

Detail page is the procurement cockpit; it embeds sections 3, 7, 8, 9.

| Element | Engine source |
|---|---|
| Header: name, client, neededBy, notes | `Project` |
| Tabs/sections: Materials, Suppliers, RFQs, Quotes, Recommendation, Orders | `project.shoppingListIds / rfqIds / orderIds` |
| Progress strip: materials → RFQs sent → quotes in → recommendation | derived counts |

## 3. Shopping Lists (Material List Builder)

| Element | Engine source |
|---|---|
| Editable table: item, qty, unit, size, spec, needed-by, delivery/pickup, notes | `MaterialLine` via `createMaterialLine()` |
| Add / edit / remove rows; persist | `proStore.set('materials:'+listId, …)` |
| "Load sample" (shed / fastener scenarios) | `data/sample-project.json`, `data/sample-hardware.json` |
| Coverage indicator per line ("3 confirmed options, 2 candidates") | `recommend().options` filtered by materialId |

## 4. RFQs

| Element | Engine source |
|---|---|
| RFQ list with status pills (draft/sent/responded/closed) | `RFQ.status` |
| Per-supplier email preview (subject, body, mailto/copy buttons) | `rfqEmail()` |
| **Mass mode**: one click prepares all selected suppliers | `bulkRfqEmails()` / `buildBulkRFQs()` |
| Quote Response Entry form: per-line unitPrice, availability, leadDays, **status picker** (7 statuses), matchNote, missingFields checkboxes, deliveryFee, shippingKnown toggle | `createQuote()` + `MATCH_STATUS` + `MISSING_FIELD` |
| Suppliers with no published pricing pre-marked as RFQ targets | supplier `_provenance` / `price_unconfirmed` options |

## 4b. Supplier Discovery (new step, before comparison)

Runs after a need/list exists, before pricing. Answers "who should we even consider?"

| Element | Engine source |
|---|---|
| "Discovering suppliers for: <need>" header | `discoverSuppliers().need` |
| Solution-category chips ("Fastener Distributor", "Auto Parts", "Local Bolt House"...) | `discoverSuppliers().solutionCategories` via `labelFor()` |
| Discovered supplier cards grouped by category | `candidates` + `byCategory` |
| **Supplier-confidence badge** per card (95/80/60/40) with `why` | `candidate.supplierConfidence`, `candidate.why` |
| Distance + local badge; "found N suppliers (M local)" | `candidate.distanceMiles`, `counts` |
| Search-radius control ("within 25 mi" - expandable) | `radiusMiles`, orchestrator radius expansion |
| Provider provenance ("demo directory"; later "Maps", "directory") | `providersUsed` |
| Select candidates -> become RFQ targets / enter comparison | candidates feed `recommend({suppliers})` |

## 5. Suppliers

| Element | Engine source |
|---|---|
| Directory cards: logo, name, type, categories, location, **distance**, lead note | `Supplier` incl. `distanceMiles` |
| **Supplier-confidence + category** (once discovered) | `supplierSummaries[].supplierConfidence / supplierCategory` |
| Contact row: phone (tel: link), email (mailto), or "no contact on file" chip | `supplier.phone/email` |
| **Memory panel** (collapsed): previous quotes, avg response, preferred contact, reliability notes, pricing history, purchases, user notes | `supplier.memory` (empty-state: "No history yet - it builds as you work") |
| Provenance badge (researched / demo / verified local) | `_provenance` |
| Filter by category/type/query; multi-select as RFQ targets | `filterSuppliers()`, `suppliersForMaterials()` |

## 6. Orders

| Element | Engine source |
|---|---|
| Order list: supplier, line items, total, status (planned/placed/received) | `Order` + `ORDER_STATUS` |
| "Order this basket" from any recommendation card → creates planned Order | `createOrder()` from pick rows |
| Totals | `displayTotal(order.total, shippingKnown)` |

## 7. Recommendation Cards (project detail, top of Quotes tab)

Five cards side by side (wrap on mobile). Every card: total via `displayTotal`,
one-line reason, inline warnings, CTA from the pick's nature.

| Card | Engine source | Total display example |
|---|---|---|
| ⭐ Best Confirmed | `bestConfirmed` (basis, total, ranked) + `axes[basis].rows` | `$15.76 + Shipping` |
| 🏬 Best Pickup | `bestPickupCandidate` (supplierName, confirmedPartsTotal, sameDayCapable, verificationFlags) | `$32.92` + "Same-day" chip |
| 🛋️ Best Convenience | `bestConvenience` (supplierName, effort, convenience, confirmedPartsTotal, effortFactors) | `$49.98` + "Convenience 89/100" |
| 🎯 Best Exact-Spec | `bestExactSpec` (supplierName, confirmedPartsTotal, shippingKnown) | `$16.32 + Shipping` |
| 💰 Lowest Cost | `bestLowestCost` (total, supplierCount, rows, reason) | `$11.66 + Shipping` + split warning |

Card anatomy:
```
┌─────────────────────────────┐
│ 🎯 BEST EXACT-SPEC          │
│ Bolt Depot                  │
│ $16.32 + Shipping           │   ← displayTotal(16.32, false)
│ All 4 lines exact-confirmed │   ← reason
│ ⚠ shipping cost unknown     │   ← warnings filtered to this pick
│ [Confirm Shipping]          │   ← CTA = the pick's dominant nextAction
└─────────────────────────────┘
```
Warnings routing: `recommend().warnings` matched to the card whose supplier/rows they
reference; unmatched warnings show above the card row.

## 8. Comparison Table (Quotes tab)

Rows = materials; columns = suppliers ranked by `supplierSummaries` order.
Default: top 6 supplier columns + "show all" (64 options on the fastener case; lazy-render).

| Element | Engine source |
|---|---|
| Column header: supplier, coverage "4/4", `displayTotal(confirmedPartsTotal, shippingKnown)`, effort/convenience mini-bar, ALL-EXACT star | `supplierSummaries` |
| Cell: unitPrice + lineTotal, status color, **confidence badge**, missing-field chips, next-action icon | `options` (find by supplierId+materialId) |
| Cell tooltip: confidence breakdown + matchNote | `option.confidenceDetail`, `option.matchNote` |
| Excluded cells: grayed with reason on hover | `excluded` |
| Footer row: per-supplier totals | `supplierSummaries.confirmedPartsTotal` via `displayTotal` |

## 9. Next-Action Panel (right rail of project detail; also Dashboard preview)

The buyer's critical path. Grouped list from `recommend().nextActions`:

| Action | Rendered as | Button behavior |
|---|---|---|
| `call_supplier` | "📞 Call Ababa Bolt - 4 items" | `tel:` link from `supplier.phone` |
| `request_quote` | "✉️ Request quote - Amazon (2 items)" | opens RFQ Generator prefilled |
| `check_in_store` | "🏬 Check in store - Tractor Supply (4 items)" | shows `location` + `distanceMiles` |
| `confirm_shipping` | "🚚 Confirm shipping - Bolt Depot (4 items)" | opens shipping-question RFQ email |
| `verify_dimensions` | "📏 Verify dims - O'Reilly washer" | shows missing spec fields |
| `wait_for_restock` | "⏳ Waiting - <item>" | informational |
Each row shows its `reason` as secondary text. Completing an action → user updates the
quote line (status/price), engine re-runs, panel shrinks. That loop IS the product.

## 10. Badges (shared components)

| Component | Engine source | Rendering |
|---|---|---|
| Confidence badge | `option.confidence` | banded colors: 100 green / 95 green-light / 80 teal / 60-65 amber / 40-55 orange / 0 gray-red; number always visible |
| Confidence tooltip | `option.confidenceDetail` | "Base 100 - 5 shipping - 5 supplier contact = 90" |
| Status pill | `option.status` | 7 fixed colors matching confidence bands |
| Missing-field chips | `option.missingFields` | "price?" "finish?" "pack qty?" - amber chips |
| Same-day chip | `pickupOption.sameDayCapable` | green "Same-day" |
| Provenance badge | supplier `_provenance` | "researched", "DEMO", "verified local" |

## File plan (all new, additive)

```
pro/
├── index.html        # shell: command bar, nav, workspace containers
├── pro.css           # EasyOrder palette via CSS vars; badge/card/table components
├── pro.js            # boot: load data, restore state, route workspaces
├── views/
│   ├── dashboard.js  ├── projects.js  ├── lists.js  ├── rfqs.js
│   ├── suppliers.js  ├── orders.js    └── compare.js   # sections 1-9
└── components.js     # badges, chips, cards, displayTotal wiring (section 10)
core/intent.js        # NEW: rule-based command-bar router (the one engine gap)
```

## Build order (proposed)

1. `core/intent.js` + tests (engine gap; everything else exists)
2. Shell + nav + command bar (`pro/index.html`, `pro.js`)
3. Comparison table + badges (sections 8, 10) - highest-value, hardest; data already proven
4. Recommendation cards + next-action panel (7, 9)
5. Lists/RFQ/quote-entry loop (3, 4) - closes the update cycle
6. Dashboard, Suppliers, Orders (1, 5, 6)

Each step demo-able with the fastener + shed scenarios before the next begins.
