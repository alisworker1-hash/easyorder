# EasyOrder - Demo Guide

> A 3-minute walkthrough of the working `/pro` (EasyOrder Workspace) demo. For the vision and
> architecture, start with [START_HERE.md](START_HERE.md).

## How to run it

No build step. Serve the repo root with any static server and open the Workspace:

```bash
cd easyorder
python3 -m http.server 8091
```

- **Workspace (business, the new work):** http://localhost:8091/pro/
- **Storefront (original consumer prototype):** http://localhost:8091/

They link to each other: "For Business" in the storefront header, "EasyOrder Home" in the
Workspace header.

## What to type in the command bar

In `/pro`, the command bar is the entry point. Type (or click the chip):

> **1/2-13 yellow zinc hardware**

That is the seeded scenario for this slice. Other phrases still route correctly through the
intent engine (try "Build an 8x12 shed" or "show outstanding quotes"), but only the fastener
data set is wired up, so those show a friendly "seeded for fasteners" note.

## What is clickable today

1. **Command bar → intent.** Your words are parsed by `core/intent.js`. The "Understood"
   line shows how it routed (need → list + discover).
2. **Discovery runs before pricing.** The "Discovered" line shows the supplier universe
   (23 suppliers, 7 local, across 9 categories) found before any price is compared.
3. **Editable material list.** Change item / qty / unit / size / spec / needed-by /
   fulfillment / notes. Add, remove, or Reset to sample. The recommendations **re-run live**
   and your list is saved on the device (localStorage).
4. **Strategy cards (the default view).** Best Overall, Best Price Today, Need It Today,
   Best Exact Spec, Best Local Supplier, Lowest Cost - each with landed cost, a one-line
   reason, a confidence/warning badge, and a next-action button. Best Bulk Value and Best
   Subscription show as "coming soon" (not faked).
5. **See Breakdown.** Any card opens a drawer explaining **why the winner won**, **why each
   rival lost**, and a full comparison of all vendors (parts, shipping, landed, minimum-order
   gate, next action).

Try this to see the intelligence work: remove the **Hex Nut** row, or raise a bolt quantity,
and watch the cards and landed totals change.

## What the demo proves

- EasyOrder is a **procurement discovery** tool, not a vendor table. You describe a need; it
  finds who could supply it, then recommends the smartest path.
- **Answers first, evidence second:** strategy cards up front, the full comparison only on
  See Breakdown.
- **Uncertainty is made visible, never hidden.** Unknown shipping shows as "+ Shipping";
  a substitute part is labeled; a vendor with a $100 order minimum is shown but flagged
  not-buyable (Fasteners Direct in this data), and excluded from the recommended math.
- **Landed cost, not sticker price.** The winner (Bolt Depot, $28.42 incl. confirmed
  shipping) beats a lower parts-only price whose shipping is unknown - the point of the tool.
- **Local businesses compete.** A local bolt house 5 minutes away surfaces with a "call for
  a quote" action instead of being buried.
- All of it runs on a **deterministic engine over researched real data** - no AI spend, no
  scraping.

## Known limitations (demo scope)

- **Demo data only.** Suppliers and prices are illustrative / researched samples, not live
  pricing. A visible "Demo data" banner sits at the top of `/pro`.
- **One seeded scenario** (the yellow-zinc fastener order). Other command-bar phrases route
  correctly but have no data behind them yet.
- **Read-only outcome.** Card CTAs (e.g. "Order online") open the breakdown; there is **no
  checkout, account, payment, or live supplier API** in this slice, by design.
- **Not yet built:** quote-response entry, RFQ sending, Orders, and the post-purchase
  Receiving / Resolution flow (documented as future work in
  [ROADMAP.md](ROADMAP.md) and [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Local testing note:** after editing engine files, hard-refresh (browsers cache ES
  modules by URL). A normal reload may serve a cached module.

## Where the code is

- `pro/` - the Workspace UI (index.html, pro.css, pro.js). Thin; it renders engine output.
- `core/` - the engines (discovery, recommend, intelligence, shipping, intent, ...), all
  DOM-free and independently tested.
- `data/` - the demo supplier directory and the fastener test scenario.
- The original storefront (`index.html`, `app.js`, `store.css`, `data.json`) is preserved
  untouched as EasyOrder Home v1.
