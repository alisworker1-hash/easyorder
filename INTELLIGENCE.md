# EasyOrder - Procurement Intelligence

> How EasyOrder guides a buyer through uncertainty. Implemented in
> `core/intelligence.js` and composed into `core/recommend.js`. Proven on the real
> yellow-zinc fastener test case (`data/sample-hardware.json`).

## The principle

**EasyOrder never stops because data is missing.** If a price, dimension, availability,
or supplier detail is unknown, EasyOrder makes the uncertainty visible (confidence score +
missing fields) and recommends the **next best action**. An option with a gap is a
candidate to advance, not a row to delete. Unconfirmed is never treated as $0 and never
treated as unavailable.

## Two kinds of confidence

- **Supplier-level confidence** (category-fit): how confident we are a supplier serves the
  need's category. Produced by the Supplier Discovery Engine, before pricing (see
  [DISCOVERY.md](DISCOVERY.md)). Flows through as `supplierSummaries[].supplierConfidence`.
- **Per-line confidence** (price/spec-fit): the score below, per supplier/item option, after
  a quote exists.

## Per-line confidence score (0-100)

Every supplier/item option gets a score, anchored to bands:

| Score | Meaning | Typical status |
|---|---|---|
| 100 | exact confirmed match with price and availability | `exact_confirmed` |
| 95 | likely exact, one minor field missing | `partial_confirmed`, or exact with unknown shipping |
| 80 | likely usable substitute | `substitute_confirmed` |
| 60-65 | promising but needs supplier confirmation | `price_unconfirmed`, `in_store_verification_needed`, `availability_unconfirmed` |
| 40 | weak candidate (floor for anything still shown) | many missing fields |
| 0 | not recommended | `not_recommended` |

Mechanics: status sets the base; each missing field beyond what the status already implies
deducts 5 points; clamp to [40, 100] for live options. The result is **explainable**: the
engine returns `confidenceDetail.base` and `confidenceDetail.deductions` per option, so
the UI can show *why* a score is what it is.

## Missing fields

Tracked per option, merged from two sources: researcher/user-declared
(`line.missingFields`) and derived (no `unitPrice` → `price`; delivery quote without a
real fee or `shippingKnown: true` → `shipping`; supplier with no email/phone →
`supplier_contact`). Vocabulary: `price`, `availability`, `dimensions`, `finish`,
`grade`, `pack_quantity`, `shipping`, `pickup_status`, `supplier_contact`.

## Next best action

Every option produces exactly one action with a reason:

| Action | When |
|---|---|
| `buy_now` | confirmed, pickup, ready |
| `add_to_cart` | confirmed online, or price-seen-verify-in-cart |
| `call_supplier` | no published price and the supplier has a phone |
| `request_quote` | no published price; email/RFQ is the path |
| `verify_dimensions` | spec fields (dimensions/finish/grade) unconfirmed |
| `check_in_store` | likely stocked locally; counter check needed |
| `confirm_shipping` | parts confirmed, shipping cost unknown |
| `wait_for_restock` | priced but out of stock |
| `do_not_buy` | not recommended (reason attached) |

`recommend()` also aggregates these into `nextActions` - the buyer's de-duplicated to-do
list for shrinking uncertainty ("Call Ababa Bolt: all 4 items", "Check in store at
Tractor Supply: ...").

## Procurement effort (0-100, lower = easier)

`convenience = 100 - effort`. Explainable factors, each returned with points and a note:

- **Pickup**: driving distance (`supplier.distanceMiles`, capped), unknown distance
- **Delivery**: base shipping wait, unknown shipping cost
- **Lead time**: points per day of max lead
- **Verification work**: points per line needing verification, fewer per substitute/partial to double-check
- **Contact**: no phone/email on file

Strategy-level effort emerges from supplier count (each extra supplier = another trip or
shipping charge); the warnings list calls this out on split-buy picks.

## Supplier memory (seam only - not a CRM yet)

`createSupplier()` now attaches a `memory` object: `previousQuoteIds`, `avgResponseDays`,
`preferredContact`, `reliabilityNotes`, `pricingHistory`, `successfulPurchases`,
`userNotes`. The engine carries these fields so a future UI/workflow can populate and
display them; no logic depends on them yet.

## Recommendation output (what `recommend()` returns)

- `bestConfirmed` - weighted best of the confirmed math (price/lead/supplier-count)
- `bestPickupCandidate` + `pickupOptions` - convenience ranking, verification flags included
- `bestConvenience` - lowest-effort full-coverage supplier
- `bestLowestCost` - cheapest confirmed per-material split, with its honesty warning
- `bestExactSpec` - cheapest single supplier where every line is `exact_confirmed`
- `options` - every supplier/item option scored (confidence, missing fields, next action)
- `supplierSummaries` - per-supplier coverage, confirmed totals, effort/convenience
- `nextActions` - aggregated to-do list
- `warnings` - substitutes inside headline picks, unknown shipping, split-buy trip costs, uncovered materials
- `candidates` / `excluded` - labeled non-math options and rejections, each with reasons
- `mathNote` - one sentence explaining what entered the math
- per `supplierSummaries` row: `landedTotal`, `shipping` (with confidence),
  `meetsMinimum` / `minOrderValue` / `minOrderShortfall`, `recommendedAction`

## Strategy cards (the results view)

Buyers think in strategies, not vendor grids. The results view leads with named strategy
cards (see PRO_UI_SPEC.md), each pointing at an engine pick, with a **See Breakdown** that
opens the full comparison. Current mapping:

| Strategy | Engine pick | Status |
|---|---|---|
| Best Overall | `bestConfirmed` | live |
| Best Price Today | cheapest buyable landed (`supplierSummaries` where `meetsMinimum`) | live (needs a landed-sort helper) |
| Need It Today | `bestPickupCandidate` (`sameDayCapable`) | live |
| Best Exact Spec | `bestExactSpec` | live |
| Best Bulk Value | quantity-break pricing | future |
| Best Subscription / Recurring | recurring-purchase pricing | future |
| Best Local Supplier | best `supplierSummaries` with local supplier type/category | live (needs a local-pick helper) |

### Why won / why lost

Every strategy must explain itself. The engine already carries the evidence: a winner's
`recommendedAction` + winning-row fields, and each rival's losing reason derivable from its
`supplierSummaries` row - higher `landedTotal`, `shipping.confidence === "unknown"`, a
non-`allExactConfirmed` line, `!meetsMinimum` (with `minOrderShortfall`), or longer lead.
The breakdown renders these as "why the winner won / why the others lost" rather than a bare
table. A future `explainPick()` helper can package this per strategy.

### Frequency-aware purchasing (future engine capability)

A list carries a purchase cadence ("Do you buy this frequently?": one-time / occasional /
regular). Cadence unlocks recommendation modes the engine does not compute yet:

- **exact-quantity** (default): buy just what's needed now.
- **bulk value**: compare unit cost at pack/quantity breaks; a 25-pack that costs less per
  piece can win for a regular buyer even with upfront overage.
- **subscription / recurring**: prefer suppliers/terms priced for a repeating order.

This requires new inputs (quantity-break price tables, subscription terms) and a
`frequency` parameter on `recommend()`. Documented as future work in ROADMAP.md; until then
the cadence is captured on the list and the Bulk/Subscription cards show a "coming soon"
state - never a fabricated number.

## Supplier reliability from receiving outcomes (future)

Today's supplier-level confidence is *category fit* (will they carry this?). A second,
earned signal comes from **what actually happened** after purchase. The Receiving Engine
(see ARCHITECTURE.md) records per-order outcomes; those roll up into objective supplier
reliability metrics stored in the supplier `memory` seam:

- order accuracy, missing-item rate, wrong-item rate, damaged-item rate
- average delivery accuracy, average resolution time
- would-buy-again, issue frequency by category

**Not a generic star rating** - objective procurement-outcome data collected as a byproduct
of the receiving workflow. Over time these feed two places: discovery ranking (a local
supplier that consistently delivers accurately should rank up) and recommendation warnings
(flag a supplier with a high damage rate in this category). A future `reliabilityScore()`
packages these, always explainable from the underlying counts. Until the Receiving Engine
exists, the metrics are absent and nothing fabricates them - reliability is simply "no
history yet", exactly like the memory panel's empty state.

## How the UI should surface uncertainty

1. **Confidence badge on every option** (color-banded: 100/95/80/60/40/0) with a hover/tap
   breakdown from `confidenceDetail`.
2. **Missing fields as chips**, not footnotes ("price?", "finish?", "pack qty?").
3. **One next-action button per option** - the UI's primary CTA comes straight from
   `nextAction.action` (Call, Request Quote, Check In Store, Confirm Shipping, Buy Now).
4. **Headline picks as cards** (best confirmed / best pickup / best convenience / best
   exact-spec / lowest cost) each showing total, effort, and its warnings inline.
5. **Warnings inline on the pick they affect** - never a separate page.
6. **Excluded options visible but collapsed**, with the explanation ("wrong size per
   catalog cross-reference", "pack minimums force ~$94 for a ~$16 need").
7. **The to-do list (`nextActions`) as a first-class panel** - procurement is a process,
   and this is its critical path.
