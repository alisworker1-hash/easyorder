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
