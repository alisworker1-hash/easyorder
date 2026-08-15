# Architecture review — Codex (gpt-5.5, medium effort), 2026-08-15

> Invoked via `cdxr` at Ali direction. Live site is the static frontend (Pages); the
> FastAPI backend is Stage-1 scaffold, not wired — so nothing here breaks-now, but
> findings 7/8/10 gate any future backend go-live.

**Findings**

1. **Boundary drift between Home and Pro is real.** `ARCHITECTURE.md` says `core/` is shared and business logic is UI-independent, but Home still keeps duplicated helpers, cart math, storage, checkout, proactive recommendations, and preference state directly in [app.js](/Users/alisworker/easyorder/app.js:7) through [app.js](/Users/alisworker/easyorder/app.js:36). Pro imports `core/index.js` cleanly in [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:5). Result: two product surfaces use different architectural styles.

2. **Assistant is tightly coupled to Home globals.** [assistant.js](/Users/alisworker/easyorder/assistant.js:11) assumes `DATA`, `PRODUCTS`, `cartItems`, `cartTotal`, `addToCart`, `openCart`, `money`, `daysSince`, and `window.savePref` exist from `app.js`. Script order in [index.html](/Users/alisworker/easyorder/index.html:173) is therefore an implicit module boundary. This makes the assistant hard to test, reuse in Pro, or load independently.

3. **Recommendation engine is cohesive but too broad.** `core/recommend.js` owns classification, assignment algorithms, minimum-order gating, pickup ranking, supplier summaries, warning generation, UI-ready option rows, and named product strategy picks in one 583-line module. The pure boundary is good, but strategy orchestration and presentation-shaped DTOs are mixed around [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:319), [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:391), and [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:555).

4. **Pro UI still contains domain-specific product strategy logic.** `hardwareCards()` and `groceryCards()` encode procurement product behavior in the UI layer at [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:171) and [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:204). The engine computes picks, but the surface decides which picks matter by domain, card titles, and tradeoff framing. That weakens the “thin UI” claim in [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:1).

5. **Duplicated primitives and inconsistent storage patterns.** Home defines `esc`, `money`, and `LS` locally in [app.js](/Users/alisworker/easyorder/app.js:7), while Pro defines its own `esc` and imports `money`/`proStore` in [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:7). `core/storage.js` provides `homeStore` and `proStore` at [core/storage.js](/Users/alisworker/easyorder/core/storage.js:54), but Home does not use it. Namespacing is inconsistent: Home writes raw `eo.cart`, `eo.history`, `eo.orders`, etc. [app.js](/Users/alisworker/easyorder/app.js:30), while `core/storage.js` expects `eo.home.*`.

6. **Dead or orphaned assets/docs mismatch.** `ARCHITECTURE.md` explicitly flags `style.css` as orphaned at [ARCHITECTURE.md](/Users/alisworker/easyorder/ARCHITECTURE.md:67). `README.md` still lists `style.css` as active styling at [README.md](/Users/alisworker/easyorder/README.md:44), but [index.html](/Users/alisworker/easyorder/index.html:16) loads `store.css`. This is small, but it signals documentation drift.

7. **Payment route mismatch.** Home calls `fetch("/create-checkout-session")` in [app.js](/Users/alisworker/easyorder/app.js:517). The FastAPI backend exposes `/checkout/create-session` in [backend/app/checkout.py](/Users/alisworker/easyorder/backend/app/checkout.py:14). `STAGE1-BACKEND.md` notes the old frontend path at [STAGE1-BACKEND.md](/Users/alisworker/easyorder/STAGE1-BACKEND.md:61). This will fail when the backend is wired unless a proxy alias is added.

8. **Backend order and payment trust boundary is not production-safe.** `POST /orders` persists client-declared product IDs, names, prices, subtotal, and total verbatim in [backend/app/routes.py](/Users/alisworker/easyorder/backend/app/routes.py:78). The comments correctly flag this at [backend/app/routes.py](/Users/alisworker/easyorder/backend/app/routes.py:80). Stripe checkout has empty `line_items` and placeholder URLs in [backend/app/checkout.py](/Users/alisworker/easyorder/backend/app/checkout.py:27) and [backend/app/checkout.py](/Users/alisworker/easyorder/backend/app/checkout.py:34), with the synchronous SDK call inside an async route at [backend/app/checkout.py](/Users/alisworker/easyorder/backend/app/checkout.py:29).

9. **Backend lifecycle and migrations are scaffold-level.** Tables are auto-created only when `dev_auth_bypass` is true in [backend/app/main.py](/Users/alisworker/easyorder/backend/app/main.py:11). There is no Alembic setup in the file list. That is acceptable for the documented stage, but not for durable state.

10. **Auth has good JWT basics but weak operational guards.** JWKS caching, issuer/audience validation, and algorithm pinning are good in [backend/app/auth.py](/Users/alisworker/easyorder/backend/app/auth.py:23) and [backend/app/auth.py](/Users/alisworker/easyorder/backend/app/auth.py:63). Risk remains if `auth_issuer`, `auth_audience`, or `auth_jwks_url` are empty defaults from [backend/app/config.py](/Users/alisworker/easyorder/backend/app/config.py:11). Startup does not fail closed on missing production auth config.

11. **Privacy state is local-only and browser-readable.** Preferences, orders, budget, history, and cart are in `localStorage` in [app.js](/Users/alisworker/easyorder/app.js:30). `assistant.js` also sends remembered preferences and the full catalog context into the assistant prompt via [assistant.js](/Users/alisworker/easyorder/assistant.js:61). That is acceptable for demo/local state, but not enough for account-backed privacy, deletion/export, or sensitive preference handling.

12. **Proxy hardening is partial.** The Worker keeps API keys server-side and enforces an origin allowlist at [proxy/worker.js](/Users/alisworker/easyorder/proxy/worker.js:24) and [proxy/worker.js](/Users/alisworker/easyorder/proxy/worker.js:60). Rate limiting is an in-memory per-isolate `Map` at [proxy/worker.js](/Users/alisworker/easyorder/proxy/worker.js:34), so it resets on isolate changes and is not a durable abuse control. The code comments acknowledge this.

13. **Algorithmic scalability has a known cliff.** `assignFewestSuppliers()` brute-forces supplier subsets up to 14 suppliers in [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:173). Above that it switches to greedy at [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:185). This is probably fine for demo data, but it needs explicit performance tests and a bounded contract before live supplier discovery increases candidate counts.

14. **Discovery is heuristic/demo, not yet an integration layer.** `core/discovery.js` defines a provider contract, but the default provider is a curated directory wrapper at [core/discovery.js](/Users/alisworker/easyorder/core/discovery.js:146). Supplier classification relies on regexes over names/IDs in [core/discovery.js](/Users/alisworker/easyorder/core/discovery.js:91). There is no `/integrations` implementation despite the architecture diagram describing one.

15. **Frontend error handling is uneven.** Data load failures are surfaced in Home and Pro at [app.js](/Users/alisworker/easyorder/app.js:738) and [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:403). But many render paths assume required DOM nodes exist, for example [app.js](/Users/alisworker/easyorder/app.js:735), [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:84), and assistant `el(...).innerHTML` in [assistant.js](/Users/alisworker/easyorder/assistant.js:436). This is brittle under partial page reuse or component extraction.

16. **Testing is concentrated in backend scaffolding.** Backend tests cover route behavior and auth branches in [backend/tests/test_backend.py](/Users/alisworker/easyorder/backend/tests/test_backend.py:119). They use a fake DB, which is fast but does not validate SQLAlchemy mappings, migrations, transaction behavior, or async DB integration. I found no JS test runner or tests for `core/recommend.js`, `core/discovery.js`, `app.js`, `assistant.js`, or Pro DOM flows.

17. **Tests currently encode incomplete behavior.** `test_checkout_create_session_happy_path` asserts `line_items == []` in [backend/tests/test_backend.py](/Users/alisworker/easyorder/backend/tests/test_backend.py:315). That protects the scaffold but will need to be rewritten before payments become real.

**Prioritized Refactors**

High:
- Home owns duplicated state/business logic -> move cart math, local storage access, money formatting, preference/order DTOs, and checkout adapter behind shared `core`/service modules; make Home consume them.
- Assistant depends on Home globals -> inject a catalog/cart/preference adapter into `assistant.js`, then reuse the same adapter contract from Home and Pro.
- Client-declared order/payment data is persisted/trusted -> add server-side catalog lookup, recompute totals, reject mismatches, populate Stripe line items from trusted prices.
- Checkout path mismatch -> standardize on one API route or add an explicit compatibility proxy before wiring backend.
- No JS/core tests -> add unit tests for recommendation, discovery, shipping, storage fallback, assistant tool execution, and Pro material editing/recompute behavior.

Medium:
- `core/recommend.js` is too broad -> split into `quoteClassification`, `assignmentStrategies`, `supplierSummaries`, `strategyPicks`, and `warnings`.
- Product strategy logic lives in Pro UI -> have the engine return card-ready strategy descriptors or domain strategy configs; keep Pro rendering generic.
- Fake-DB backend tests only -> add integration tests against a real test database and future Alembic migrations.
- Worker rate limit is volatile -> move abuse controls to Cloudflare rate limiting/WAF or durable storage if public LLM access matters.
- Production auth can start with empty config -> fail startup when auth config is missing and `DEV_AUTH_BYPASS=0`.

Low:
- Orphaned `style.css` and README drift -> align docs and file references.
- Repeated `esc`, `$`, render helpers -> centralize only after module boundaries are settled.
- DOM null assumptions -> add lightweight mount guards as surfaces become reusable.
- Regex discovery/intent rules -> keep for demo, but isolate rule tables and add fixture coverage before expanding.

**Verdict**

Architecture health: promising but transitional. The cleanest part is the pure procurement core concept; the weakest part is that Home, assistant, Pro, backend, and proxy each use different boundary styles. Treat this as a solid prototype with a documented target architecture, not yet a production-ready layered system.
tokens used
**Findings**

1. **Boundary drift between Home and Pro is real.** `ARCHITECTURE.md` says `core/` is shared and business logic is UI-independent, but Home still keeps duplicated helpers, cart math, storage, checkout, proactive recommendations, and preference state directly in [app.js](/Users/alisworker/easyorder/app.js:7) through [app.js](/Users/alisworker/easyorder/app.js:36). Pro imports `core/index.js` cleanly in [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:5). Result: two product surfaces use different architectural styles.

2. **Assistant is tightly coupled to Home globals.** [assistant.js](/Users/alisworker/easyorder/assistant.js:11) assumes `DATA`, `PRODUCTS`, `cartItems`, `cartTotal`, `addToCart`, `openCart`, `money`, `daysSince`, and `window.savePref` exist from `app.js`. Script order in [index.html](/Users/alisworker/easyorder/index.html:173) is therefore an implicit module boundary. This makes the assistant hard to test, reuse in Pro, or load independently.

3. **Recommendation engine is cohesive but too broad.** `core/recommend.js` owns classification, assignment algorithms, minimum-order gating, pickup ranking, supplier summaries, warning generation, UI-ready option rows, and named product strategy picks in one 583-line module. The pure boundary is good, but strategy orchestration and presentation-shaped DTOs are mixed around [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:319), [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:391), and [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:555).

4. **Pro UI still contains domain-specific product strategy logic.** `hardwareCards()` and `groceryCards()` encode procurement product behavior in the UI layer at [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:171) and [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:204). The engine computes picks, but the surface decides which picks matter by domain, card titles, and tradeoff framing. That weakens the “thin UI” claim in [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:1).

5. **Duplicated primitives and inconsistent storage patterns.** Home defines `esc`, `money`, and `LS` locally in [app.js](/Users/alisworker/easyorder/app.js:7), while Pro defines its own `esc` and imports `money`/`proStore` in [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:7). `core/storage.js` provides `homeStore` and `proStore` at [core/storage.js](/Users/alisworker/easyorder/core/storage.js:54), but Home does not use it. Namespacing is inconsistent: Home writes raw `eo.cart`, `eo.history`, `eo.orders`, etc. [app.js](/Users/alisworker/easyorder/app.js:30), while `core/storage.js` expects `eo.home.*`.

6. **Dead or orphaned assets/docs mismatch.** `ARCHITECTURE.md` explicitly flags `style.css` as orphaned at [ARCHITECTURE.md](/Users/alisworker/easyorder/ARCHITECTURE.md:67). `README.md` still lists `style.css` as active styling at [README.md](/Users/alisworker/easyorder/README.md:44), but [index.html](/Users/alisworker/easyorder/index.html:16) loads `store.css`. This is small, but it signals documentation drift.

7. **Payment route mismatch.** Home calls `fetch("/create-checkout-session")` in [app.js](/Users/alisworker/easyorder/app.js:517). The FastAPI backend exposes `/checkout/create-session` in [backend/app/checkout.py](/Users/alisworker/easyorder/backend/app/checkout.py:14). `STAGE1-BACKEND.md` notes the old frontend path at [STAGE1-BACKEND.md](/Users/alisworker/easyorder/STAGE1-BACKEND.md:61). This will fail when the backend is wired unless a proxy alias is added.

8. **Backend order and payment trust boundary is not production-safe.** `POST /orders` persists client-declared product IDs, names, prices, subtotal, and total verbatim in [backend/app/routes.py](/Users/alisworker/easyorder/backend/app/routes.py:78). The comments correctly flag this at [backend/app/routes.py](/Users/alisworker/easyorder/backend/app/routes.py:80). Stripe checkout has empty `line_items` and placeholder URLs in [backend/app/checkout.py](/Users/alisworker/easyorder/backend/app/checkout.py:27) and [backend/app/checkout.py](/Users/alisworker/easyorder/backend/app/checkout.py:34), with the synchronous SDK call inside an async route at [backend/app/checkout.py](/Users/alisworker/easyorder/backend/app/checkout.py:29).

9. **Backend lifecycle and migrations are scaffold-level.** Tables are auto-created only when `dev_auth_bypass` is true in [backend/app/main.py](/Users/alisworker/easyorder/backend/app/main.py:11). There is no Alembic setup in the file list. That is acceptable for the documented stage, but not for durable state.

10. **Auth has good JWT basics but weak operational guards.** JWKS caching, issuer/audience validation, and algorithm pinning are good in [backend/app/auth.py](/Users/alisworker/easyorder/backend/app/auth.py:23) and [backend/app/auth.py](/Users/alisworker/easyorder/backend/app/auth.py:63). Risk remains if `auth_issuer`, `auth_audience`, or `auth_jwks_url` are empty defaults from [backend/app/config.py](/Users/alisworker/easyorder/backend/app/config.py:11). Startup does not fail closed on missing production auth config.

11. **Privacy state is local-only and browser-readable.** Preferences, orders, budget, history, and cart are in `localStorage` in [app.js](/Users/alisworker/easyorder/app.js:30). `assistant.js` also sends remembered preferences and the full catalog context into the assistant prompt via [assistant.js](/Users/alisworker/easyorder/assistant.js:61). That is acceptable for demo/local state, but not enough for account-backed privacy, deletion/export, or sensitive preference handling.

12. **Proxy hardening is partial.** The Worker keeps API keys server-side and enforces an origin allowlist at [proxy/worker.js](/Users/alisworker/easyorder/proxy/worker.js:24) and [proxy/worker.js](/Users/alisworker/easyorder/proxy/worker.js:60). Rate limiting is an in-memory per-isolate `Map` at [proxy/worker.js](/Users/alisworker/easyorder/proxy/worker.js:34), so it resets on isolate changes and is not a durable abuse control. The code comments acknowledge this.

13. **Algorithmic scalability has a known cliff.** `assignFewestSuppliers()` brute-forces supplier subsets up to 14 suppliers in [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:173). Above that it switches to greedy at [core/recommend.js](/Users/alisworker/easyorder/core/recommend.js:185). This is probably fine for demo data, but it needs explicit performance tests and a bounded contract before live supplier discovery increases candidate counts.

14. **Discovery is heuristic/demo, not yet an integration layer.** `core/discovery.js` defines a provider contract, but the default provider is a curated directory wrapper at [core/discovery.js](/Users/alisworker/easyorder/core/discovery.js:146). Supplier classification relies on regexes over names/IDs in [core/discovery.js](/Users/alisworker/easyorder/core/discovery.js:91). There is no `/integrations` implementation despite the architecture diagram describing one.

15. **Frontend error handling is uneven.** Data load failures are surfaced in Home and Pro at [app.js](/Users/alisworker/easyorder/app.js:738) and [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:403). But many render paths assume required DOM nodes exist, for example [app.js](/Users/alisworker/easyorder/app.js:735), [pro/pro.js](/Users/alisworker/easyorder/pro/pro.js:84), and assistant `el(...).innerHTML` in [assistant.js](/Users/alisworker/easyorder/assistant.js:436). This is brittle under partial page reuse or component extraction.

16. **Testing is concentrated in backend scaffolding.** Backend tests cover route behavior and auth branches in [backend/tests/test_backend.py](/Users/alisworker/easyorder/backend/tests/test_backend.py:119). They use a fake DB, which is fast but does not validate SQLAlchemy mappings, migrations, transaction behavior, or async DB integration. I found no JS test runner or tests for `core/recommend.js`, `core/discovery.js`, `app.js`, `assistant.js`, or Pro DOM flows.

17. **Tests currently encode incomplete behavior.** `test_checkout_create_session_happy_path` asserts `line_items == []` in [backend/tests/test_backend.py](/Users/alisworker/easyorder/backend/tests/test_backend.py:315). That protects the scaffold but will need to be rewritten before payments become real.

**Prioritized Refactors**

High:
- Home owns duplicated state/business logic -> move cart math, local storage access, money formatting, preference/order DTOs, and checkout adapter behind shared `core`/service modules; make Home consume them.
- Assistant depends on Home globals -> inject a catalog/cart/preference adapter into `assistant.js`, then reuse the same adapter contract from Home and Pro.
- Client-declared order/payment data is persisted/trusted -> add server-side catalog lookup, recompute totals, reject mismatches, populate Stripe line items from trusted prices.
- Checkout path mismatch -> standardize on one API route or add an explicit compatibility proxy before wiring backend.
- No JS/core tests -> add unit tests for recommendation, discovery, shipping, storage fallback, assistant tool execution, and Pro material editing/recompute behavior.

Medium:
- `core/recommend.js` is too broad -> split into `quoteClassification`, `assignmentStrategies`, `supplierSummaries`, `strategyPicks`, and `warnings`.
- Product strategy logic lives in Pro UI -> have the engine return card-ready strategy descriptors or domain strategy configs; keep Pro rendering generic.
- Fake-DB backend tests only -> add integration tests against a real test database and future Alembic migrations.
- Worker rate limit is volatile -> move abuse controls to Cloudflare rate limiting/WAF or durable storage if public LLM access matters.
- Production auth can start with empty config -> fail startup when auth config is missing and `DEV_AUTH_BYPASS=0`.

Low:
- Orphaned `style.css` and README drift -> align docs and file references.
- Repeated `esc`, `$`, render helpers -> centralize only after module boundaries are settled.
- DOM null assumptions -> add lightweight mount guards as surfaces become reusable.
- Regex discovery/intent rules -> keep for demo, but isolate rule tables and add fixture coverage before expanding.

**Verdict**


---

## Outcomes — 2026-08-15 (same day, Ali-directed)

- **#8 (client-declared prices persisted verbatim): FIXED.** `backend/app/catalog.py` is the trusted catalog (repo data.json, integer-cents math, frontend-identical delivery rule); `POST /orders` now recomputes every figure and 422s on unknown id / price / subtotal / total mismatch, persisting only server-computed values (catalog name wins over the client claim).
- **#10 (auth can start unconfigured): FIXED.** `validate_runtime_config()` runs at lifespan start — missing issuer/audience/JWKS without dev bypass is a refused boot naming the empty fields.
- Suite: 25 passed (6 new pins: fee-applied + free-delivery happy paths, unknown-id, tampered price, tampered total, fail-closed startup both ways).
- Still open as go-live gates: #7 checkout route mismatch, Stripe line_items population, and the rest as written above.
