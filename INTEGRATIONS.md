# EasyOrder - Integrations

> How EasyOrder connects to suppliers - now (demo) and later (live) - without scraping,
> auth bypass, or account linking. Aligns to [ARCHITECTURE.md](ARCHITECTURE.md).

## Principles

- **No scraping.** Never pull data from supplier sites by automated page reads.
- **No bypassing authentication.** Never circumvent logins or protections.
- **No account linking yet.** A user's Google/EasyOrder login does **not** connect Home
  Depot, Lowe's, Amazon, etc. Don't imply it does.
- **Official methods only**, when they exist: official APIs, partner programs, affiliate
  feeds, supported email/EDI workflows, or manually maintained catalogs.
- **Demo and live never tangle.** All supplier data flows through one adapter interface;
  demo adapters and live adapters are interchangeable and clearly separated.

## The adapter seam

Every supplier source implements the same small interface so the UI and engine never care
whether data is mock or live:

```
SupplierAdapter
  • id, displayName, kind: "demo" | "api" | "affiliate" | "email" | "catalog"
  • getCatalog(query)        → items + (optional) indicative pricing
  • getQuote(materialLine[]) → pricing/availability/lead, OR null if quote-by-email only
  • supportsLivePricing      → boolean (drives the DEMO badge in the UI)
```

- **Phase 1 (now):** only `kind: "demo"` adapters exist, reading `/data/*.json`. The UI
  labels all pricing **DEMO**.
- **Phase 3 (later):** add `api` / `affiliate` / `catalog` adapters behind the same
  interface. No UI or engine rewrite - just register the adapter.

```
easyorder/
└── integrations/
    ├── adapter.js        # the interface + a registry
    └── demo/             # mock adapters reading /data (Phase 1)
        └── *.js
    # api/, affiliate/, catalog/ added in Phase 3
```

## Supplier landscape we design for

Big-box: Home Depot, Lowe's, Floor & Decor, Wayfair, Amazon, Target, Walmart.
Local: lumber yards, hardware stores, specialty vendors, service providers.

For suppliers with **no live pricing path**, EasyOrder falls back to the **email RFQ
workflow** - generate quote requests, send/prepare them in bulk, and let the user paste
responses back. This is a first-class path, not a degraded one: it works for every local
supplier on day one without any integration.

## Two adapter families

EasyOrder has **two** provider seams, one per engine, each provider-agnostic:

1. **Discovery providers** (`DiscoveryProvider`, see [DISCOVERY.md](DISCOVERY.md)) - find
   WHO exists for a need. `discover(need, opts) -> SupplierCandidate[]`. Runs before pricing.
2. **Supplier adapters** (`SupplierAdapter`, above) - gather price/stock/lead for suppliers
   already discovered.

### Discovery provider kinds (interfaces only; no live discovery yet)

| kind | Source | Discovers |
|---|---|---|
| `demo` | curated `data/suppliers.json` | the only one built today; proves the interface |
| `places` | Google Business / Maps places APIs | local businesses by category + location |
| `directory` | supplier directories | listed distributors and vendors |
| `industry-db` | industry databases | specialty manufacturers, wholesalers |
| `retailer-api` | official retailer APIs | national/regional retail coverage |
| `merchant-profile` | merchant-submitted profiles | businesses that opt in to EasyOrder |
| `regional-catalog` | maintained regional catalogs | curated local/regional supply |

The engine iterates whatever providers are registered - it never names one - so adding a
live provider is registration, not a rewrite. Discovered suppliers with no published pricing
enter as `price_unconfirmed` / `in_store_verification_needed` candidates and are natural
**RFQ targets**; the email workflow closes the loop. No scraping; official APIs, opt-in
merchant profiles, and licensed directories only.

## Shipping research boundary (hard rule)

Shipping is gathered as an ESTIMATE with confidence (see `core/shipping.js`), never by
completing a purchase. Automated research (including subagents) MUST NOT enter checkout
flows, cart flows with a saved payment method, or any page where a saved address or payment
method is active. Prefer these sources, in order:

1. Published shipping policy pages
2. Public product pages
3. Supplier quote / RFQ email
4. Manual user-entered shipping quote
5. User-authorized checkout lookup - only with explicit, case-by-case approval

Rationale: during the yellow-zinc test case, a shipping agent reached a vendor's Shop Pay
checkout where the buyer's saved address and card auto-populated. It stopped before paying,
but that is closer to a live transaction than research should ever get. A cell staying
`estimated` (from a policy page) is always preferable to a `confirmed` number obtained from
a checkout-adjacent flow. FMW's $10.00 and Bolt Depot's $12.10 in the test data were
observed before this rule and are retained as confirmed; future numbers follow the ladder
above.

## Data provenance

Each supplier record and price carries its source kind so the UI can always show where a
number came from (`DEMO`, `via API`, `from affiliate feed`, `quoted by email`). Trust comes
from never blurring demo numbers with live ones.
