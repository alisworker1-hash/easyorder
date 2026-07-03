# EasyOrder - Architecture

> How the platform is structured so EasyOrder Home and EasyOrder Pro share **two shared
> engines** (Supplier Discovery + Procurement Intelligence), business logic stays
> independent of UI, and integrations stay swappable. Aligns to
> [PRODUCT_VISION.md](PRODUCT_VISION.md).

## The platform is a Procurement Discovery Platform

EasyOrder helps buyers **discover the best supplier for a need**, then recommends the best
path. Two engines, in order:

1. **Supplier Discovery Engine** (`core/discovery.js`, see [DISCOVERY.md](DISCOVERY.md)) -
   decides WHO should be considered. Produces the supplier universe *before* pricing, from
   national retailers to local family-owned businesses.
2. **Procurement Intelligence / Recommendation** (`core/recommend.js` +
   `core/intelligence.js`, see [INTELLIGENCE.md](INTELLIGENCE.md)) - decides who WINS, once
   information is gathered.

```
Need -> Understand -> DISCOVER suppliers -> Gather info -> Procurement Intelligence
     -> Recommendation -> Order -> Learn (supplier memory)
```

Discovery comes before pricing. That ordering drives the layering below.

## Guiding constraints

- **Static-site friendly.** No build step, no framework, no npm. Plain HTML/CSS/JS served
  directly (GitHub Pages today). The one server-side piece is the optional LLM proxy.
- **Additive only.** New capabilities live in new files/folders. The existing storefront is
  never rewritten in place.
- **Business logic has zero DOM dependencies.** The engine is pure functions over data
  models, importable by any UI (Home, Pro, future surfaces) and testable on its own.

## Layered model

```
┌─────────────────────────────────────────────────────────────┐
│  SURFACES (UI)                                               │
│  • Home v1 storefront (existing index.html/app.js)          │
│  • Pro workspace shell (/pro) - Dashboard, Projects, Lists, │
│    RFQs, Suppliers, Orders, Assistant                       │
│  • Universal Command Bar (intent → workspace)               │
├─────────────────────────────────────────────────────────────┤
│  CORE - shared engines (/core, no DOM)                     │
│  DISCOVERY: discovery (universe first, before pricing)     │
│  INTELLIGENCE: recommend · intelligence (who wins)         │
│  SHARED: models·storage·money·suppliers·rfq·intent         │
├─────────────────────────────────────────────────────────────┤
│  INTEGRATIONS (/integrations) - adapters behind one         │
│  interface. Demo adapters now; official APIs later.         │
├─────────────────────────────────────────────────────────────┤
│  PROXY (/proxy) - provider-agnostic LLM gateway (key-safe)  │
└─────────────────────────────────────────────────────────────┘
```

## What stays, what it becomes

| Existing asset | Verdict | Role going forward |
|---|---|---|
| `index.html` + `app.js` + `store.css` + `data.json` (storefront) | **Keep, untouched** | EasyOrder **Home v1** prototype; later becomes one surface under the platform |
| `assistant.js` (grounded tool-calling chat) | **Keep, extract pattern** | Blueprint for the Command Bar's intent→tool→UI orchestration |
| `proxy/worker.js` (provider-agnostic, key-safe) | **Keep, reuse** | The LLM gateway for command-bar intent + later quote parsing |
| `data.json` runtime-fetch pattern | **Keep, generalize** | Same pattern for supplier catalogs and demo data |
| `money()`, `LS` storage, `$`/`esc`/event-delegation idioms | **Promote to `/core`** | Shared primitives both products use |
| `style.css` (orphaned, unreferenced) | **Leave as-is** | Not deleted; flagged only |

## Proposed folder layout (additive)

```
easyorder/
├── index.html, app.js, assistant.js, store.css, data.json   # Home v1 - UNCHANGED
├── proxy/                          # UNCHANGED (reused)
├── core/                           # NEW - procurement engine, no DOM, ES modules
│   ├── models.js                   # canonical data models (JSDoc typedefs)
│   ├── storage.js                  # namespaced localStorage (eo.pro.*, eo.home.*)
│   ├── money.js                    # exact-cent formatting + displayTotal ("+ Shipping")
│   ├── suppliers.js                # load + filter the supplier directory
│   ├── discovery.js                # SUPPLIER DISCOVERY ENGINE - universe before pricing (see DISCOVERY.md)
│   ├── rfq.js                      # build RFQs from a material list
│   ├── recommend.js                # recommendation algorithms (pure)
│   ├── intelligence.js             # confidence, missing fields, next actions, effort (see INTELLIGENCE.md)
│   └── intent.js                   # command-bar intent routing (rule-based now)
├── integrations/                   # NEW - adapter interfaces + demo adapters
│   ├── discovery/                  # discovery providers (places/directory/... ); demo now
│   └── demo/                       # mock pricing/availability, clearly labeled DEMO
├── data/                           # NEW - shared demo data
│   ├── suppliers.json
│   └── sample-project.json         # "build a shed" seed for instant demo
└── pro/                            # NEW - EasyOrder Pro workspace shell
    ├── index.html                  # command bar + primary nav + workspaces
    ├── pro.css                     # reuses EasyOrder CSS-var palette
    └── pro.js                      # wires UI to /core (imports, no logic duplication)
```

`core/` uses ES modules (`<script type="module">`); the existing `app.js` stays a classic
script. Modules require http (already satisfied by the dev server / Pages), never `file://`.

## Canonical data models (defined once in `core/models.js`)

- **Project** - container: shopping lists, RFQs, orders, notes, suppliers, files.
- **ShoppingList** - standalone or inside a Project; holds MaterialLines.
- **MaterialLine** - item, qty, unit, size/dimensions, spec/quality, neededBy,
  fulfillment (delivery|pickup), notes.
- **Supplier** - id, name, type (big-box|local|specialty|service), categories, contact,
  delivery capability, lead-time note.
- **RFQ** - a material list sent to a set of suppliers; status (draft|sent|responded).
- **Quote** - a supplier's response: per-line unit price, availability, lead days,
  delivery fee, fulfillment, notes.
- **Order** - a chosen purchasing path derived from accepted quotes.
- **Recommendation** - computed picks across the optimization axes.

Both products read/write these same shapes, so a Home shopping list and a Pro project list
are the same primitive at different altitudes.

## The Command Bar as orchestrator

A thin **intent router**, not a chat that holds the user:

1. User types intent ("Build an 8x12 shed", "Show outstanding quotes").
2. `core/intent.js` resolves intent → workspace + action (rule-based now; LLM-assisted
   later via the existing proxy, reusing the `assistant.js` tool-loop pattern).
3. The matching **workspace UI** opens, pre-filled. The user continues in rich UI.

This keeps "AI orchestrates the platform; it does not replace the interface" literally true
in the architecture.

## Why this is the right foundation

- **One engine, two products** - `core/` is the shared procurement engine; Home and Pro are
  just surfaces over it.
- **UI-independent logic** - recommendation/RFQ/intent are pure and testable.
- **Swappable integrations** - demo today, official APIs later, same interface; demo data
  never tangles with live logic.
- **Zero baseline risk** - everything new is in new folders; deleting `core/`, `pro/`,
  `integrations/`, `data/` restores the exact current app.
