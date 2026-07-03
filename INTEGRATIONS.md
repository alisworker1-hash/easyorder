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

## Local supplier discovery (planned adapter kind: "discovery")

Users want EasyOrder to find suppliers **near them** (local bolt houses, lumber yards,
specialty distributors), not just national chains. This becomes a `discovery` adapter:
given a category + location, return candidate local suppliers (name, address, distance,
phone, site, walk-in/will-call) sourced from legitimate search/maps APIs. Discovered
suppliers enter the directory as `price_unconfirmed` / `in_store_verification_needed`
candidates and are natural **RFQ targets** - the email workflow closes the loop where no
published pricing exists. No scraping; official search/places APIs only.

## Data provenance

Each supplier record and price carries its source kind so the UI can always show where a
number came from (`DEMO`, `via API`, `from affiliate feed`, `quoted by email`). Trust comes
from never blurring demo numbers with live ones.
