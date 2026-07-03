# EasyOrder - Roadmap

> Phased plan from today's prototype to the full procurement platform. Each phase is
> additive and leaves earlier phases working. Aligns to [PRODUCT_VISION.md](PRODUCT_VISION.md).

## Phase 0 - Baseline (done, preserved)
The existing senior-friendly storefront + grounded AI assistant + LLM proxy. This is
**EasyOrder Home v1**, our first working prototype. Kept untouched as a working baseline.

## Phase 1 - Foundation + Pro procurement MVP (current)
Build the shared engine and the contractor-first procurement thread.

- Stand up `/core` (models, storage, money, suppliers, discovery, rfq, recommend,
  intelligence, intent) - UI-free.
- **Supplier Discovery Engine** with the demo provider + solution-category expansion +
  supplier-level confidence (see [DISCOVERY.md](DISCOVERY.md)). Interface ready for live
  providers; no live discovery yet.
- Stand up `/data` demo supplier directory + "build a shed" and fastener sample scenarios.
- Stand up `/pro` workspace shell with the primary nav and the MVP workflow
  (see [PROCUREMENT_MVP.md](PROCUREMENT_MVP.md)).
- Universal command bar with **rule-based** intent routing.
- Recommendation across all five axes + procurement intelligence (deterministic, no AI spend).
- Everything additive; storefront and proxy untouched.

**Exit:** a contractor can run material list → suppliers → RFQs → quote entry → comparison →
recommendation end-to-end on demo data.

## Phase 2 - AI assist (cost-bounded)
Layer the LLM in where it earns its cost, through the existing proxy.

- Command-bar intent upgraded from rules to **LLM intent detection** (reusing the
  `assistant.js` tool-loop pattern).
- **Quote parsing**: paste a raw supplier email/PDF text → structured Quote.
- **RFQ drafting**: polish per-supplier RFQ copy.
- Still no AI-generated BOM (deferred); usage stays bounded by the proxy budget cap.

## Phase 3 - Real integrations + Pro subscription
- **Live discovery providers** behind the `DiscoveryProvider` interface: Places/Maps,
  supplier directories, industry databases, retailer APIs, merchant-submitted profiles,
  regional catalogs (see [DISCOVERY.md](DISCOVERY.md) and [INTEGRATIONS.md](INTEGRATIONS.md)).
- `/integrations` gains official-API / affiliate / partner **supplier adapters** for
  price/stock behind the existing interface.
- Supplier catalogs from supported feeds replace demo data where available.
- Orders workspace: turn an accepted quote into a tracked order.
- Subscription/billing for EasyOrder Pro; team workflows (multi-user projects).

## Phase 4 - Consumer track (EasyOrder Home, on the shared engine)
- Re-home the storefront as a Home surface over `/core`.
- Consumer procurement use cases: window-screen replacement, auto parts, furniture,
  electronics, marketplace comparisons - same engine, consumer-tuned UI.
- Distance/local-service optimization for service-type needs.

## Later - AI-generated BOM
Once AI economics are comfortable, add "describe the project, get a starting material list."
Explicitly postponed until usage costs are justified.

## Non-goals (standing)
No scraping, no auth bypass, no account linking until official methods exist, no fragile
dependencies on unauthorized access.
