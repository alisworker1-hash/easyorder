# START HERE - EasyOrder

> The first document to read - for developers, investors, and contributors. It explains what
> EasyOrder is, the principles that guide every decision, and how the system is built. Deeper
> docs: [PRODUCT_VISION.md](PRODUCT_VISION.md), [ARCHITECTURE.md](ARCHITECTURE.md),
> [DISCOVERY.md](DISCOVERY.md), [INTELLIGENCE.md](INTELLIGENCE.md), [INTEGRATIONS.md](INTEGRATIONS.md),
> [PROCUREMENT_MVP.md](PROCUREMENT_MVP.md), [PRO_UI_SPEC.md](PRO_UI_SPEC.md), [ROADMAP.md](ROADMAP.md).

## What EasyOrder Is

EasyOrder is an **AI-powered Procurement Discovery Platform**.

We are not building another Amazon. We are not trying to become another online retailer. We
do not try to own the transaction. Our mission is to help buyers **discover the best supplier
- not the biggest supplier - for every procurement need.**

## North Star

EasyOrder helps buyers answer one question:

> "What is the smartest way to procure this?"

That answer may involve one supplier or several, local businesses or national retailers,
distributors, manufacturers, service providers, recurring purchases, or bulk buying.
**EasyOrder discovers the possibilities first. Pricing comes afterward.**

## Product Philosophy (engineering guardrails)

Every feature must align with these. When a design decision is unclear, these break the tie.

1. **Discovery is the value.** Finding the right suppliers is the product, not listing prices.
2. **Users describe needs, not suppliers.** "I need a window screen", not "search Home Depot".
3. **Never fabricate information.** No invented prices, specs, or availability. Unknown is a
   first-class state, never a guess.
4. **Never hide uncertainty.** Show what is missing (confidence score + missing fields) and
   recommend the next action instead of dropping the option.
5. **Explain every recommendation.** Why the winner won, why the others lost. No black boxes.
6. **Optimize procurement strategies, not products.** Answer "best way to buy", not "cheapest item".
7. **Support local businesses whenever they are competitive.** They compete on service,
   expertise, responsiveness, and proximity - not ad budget. This is encoded in ranking.
8. **The engine recommends; the user decides.** EasyOrder never places an order on its own.

## High-Level Architecture

```
Need
  ↓  Intent Understanding        - what does the buyer actually need? (command bar)
  ↓  Supplier Discovery Engine   - WHO could serve this? (universe before pricing)
  ↓  Information Gathering        - prices, availability, lead, shipping (adapters + RFQ)
  ↓  Procurement Intelligence     - confidence, missing fields, effort, next actions
  ↓  Procurement Strategy Engine  - frame options as strategies (Best Overall, Local, ...)
  ↓  Recommendation Engine        - pick winners per strategy, explain why
  ↓  Order                        - turn an accepted quote into a tracked order
  ↓  Learning                     - supplier memory: who responds/prices/delivers best
```

**Each engine's responsibility**

- **Intent Understanding** - turn a plain-language need into a structured request and route
  it to the right workspace. Rule-based today (`core/intent.js`, to be built); LLM-assisted
  later via the existing key-safe proxy.
- **Supplier Discovery Engine** (`core/discovery.js`) - expand a need into candidate supplier
  *categories* ("solutions, not products"), then find and rank specific suppliers across
  national, regional, and local businesses. Assigns each a supplier-level confidence
  (category fit) and produces the supplier universe **before** pricing. Provider-agnostic:
  demo provider today; Places/Maps, directories, industry DBs, retailer APIs, and
  merchant-submitted profiles plug in behind one interface. No scraping, no auth bypass.
- **Information Gathering** (`/integrations` adapters + `core/rfq.js` + `core/shipping.js`) -
  collect price, availability, lead time, and shipping. Where there is no published pricing,
  the RFQ email workflow is a first-class path. Shipping is estimated with a confidence label,
  never obtained by entering a checkout.
- **Procurement Intelligence** (`core/intelligence.js`) - per-option confidence (0-100,
  explainable), missing-field tracking, procurement effort/convenience, and the single best
  next action for each option.
- **Procurement Strategy Engine** (`core/recommend.js` today; strategy layer expanding) -
  frame the gathered information as procurement strategies rather than a raw grid.
- **Recommendation Engine** (`core/recommend.js`) - deterministic picks (landed cost, lead,
  supplier count, minimum-order gates, pickup vs delivery) with warnings and reasons. No AI.
- **Order** (`Order` model) - a chosen path becomes a tracked order.
- **Learning** (supplier `memory` seam) - accumulates response times, pricing history,
  reliability, and outcomes so future recommendations improve.

## Product Structure - two experiences, one engine

### EasyOrder Home (consumer, free)
Shopping lists and simple purchasing. "Find me the best place to buy this."

### EasyOrder Workspace (business, subscription)
Projects, RFQs, quotes, orders, suppliers, and full procurement management. Launch focus;
first pilot is a general contractor.

Both share the same `/core` engines. A Home shopping list and a Workspace project list are
the same primitive at different altitudes.

## Recommendation Philosophy

**EasyOrder does not present a giant comparison table first.** The default experience is a
set of **procurement strategies**, for example:

- Best Overall
- Best Price Today
- Need It Today
- Best Exact Specification
- Best Local Supplier
- Best Bulk Value *(future)*
- Best Subscription *(future)*

Each strategy has a **See Breakdown** action. The breakdown explains: vendors compared, why
the winner won, why the others lost, landed cost, confidence, shipping (with confidence),
minimum-order gates, and next actions.

**Users receive answers first, evidence second.**

This is not theoretical: a real yellow-zinc fastener order was run across 15+ suppliers. The
engine surfaced that the "3rd cheapest" vendor could not be used (a $100 order minimum), that
a $16 parts order became $28 landed after shipping, and that a local bolt house 5 minutes away
was worth a call. That test drove the current design.

## Long-Term Vision (direction, not commitments)

Documented as vision, not promises:

- **Buyer Intelligence** - learn a buyer's priorities and defaults.
- **Supplier Profiles** - rich, structured profiles (opt-in merchant-submitted).
- **Procurement Memory** - remember what was bought, from whom, at what price.
- **Frequency-aware purchasing** - one-time vs recurring changes the recommendation.
- **Bulk optimization** - quantity-break pricing and buy-ahead math.
- **Subscription optimization** - best terms for repeating orders.
- **Lifetime procurement cost** - total cost over repeated buys, not just today's price.
- **Inventory awareness** - reorder before running out.
- **Supplier reputation** and **response history** - who is reliable, who answers fast.

## Repository map

- `core/` - the engines (DOM-free, ES modules, testable): models, money, storage, suppliers,
  discovery, rfq, recommend, intelligence, shipping. `intent.js` is the one piece still to build.
- `data/` - demo supplier directory and real test scenarios (shed build, yellow-zinc fasteners).
- `pro/` - the EasyOrder Workspace UI (to be built; see PRO_UI_SPEC.md).
- `index.html`, `app.js`, `store.css`, `data.json`, `assistant.js` - the original storefront,
  **preserved untouched** as EasyOrder Home v1.
- `proxy/` - provider-agnostic, key-safe LLM gateway (reused for intent + quote parsing later).

Static site, no build step. Run any static server from the repo root and open the port.

## Working agreement

- Additive only; never rewrite the storefront baseline.
- Engine-first: business logic stays in `/core`, independent of UI, and is verified before
  UI is built on it.
- Research and agents must not enter checkout flows or pages with saved payment methods
  (see [INTEGRATIONS.md](INTEGRATIONS.md), "Shipping research boundary").
