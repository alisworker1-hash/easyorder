# EasyOrder — scaling & compliance plan

From a multi-lens analysis (architecture · scaling · compliance · cost/reliability), grounded
in the actual code, with the compliance claims independently fact-checked.

> **This is general guidance, not legal advice.** Confirm anything compliance-related with a
> qualified privacy/healthcare attorney before you rely on it.

## The headline: AI is *not* your downfall — and a Python rewrite would solve the wrong problem

EasyOrder already does **not** run on AI for anything that matters. Every money decision —
scoring, prices, cost-to-own, confidence, cart, checkout — is deterministic JavaScript
(`scoreDecision()`, `runTool()`), and **demo mode proves the whole app works with the AI
unplugged**. The only AI is a thin, optional, swappable LLM (behind the Cloudflare Worker) that
does *language understanding + warm phrasing* and never picks or prices anything.

A Python rewrite would rebuild a backend you don't need yet **and** wouldn't touch the one place
AI is actually used (language). **Keep the architecture.** The right model: a deterministic core
with the LLM as a bounded, cacheable, removable sliver at the edge. Python earns its place later
as (a) a thin backend for accounts/orders and (b) the offline Category-Factory content pipeline —
never in the request path.

## Do this now (free, ~40–60% per-conversation token cut) — Stage 0

The urgent issue is a cost leak, not architecture. Verified in code:
- `assistant.js:421` puts the full ~32KB / 62-product catalog in the system prompt…
- …and `assistant.js:245` re-sends it on **every** turn (`messages: A.convo`).
- `worker.js:53` keeps `slice(-24)` — which, past 24 messages, would silently drop the system
  prompt (and the whole catalog) mid-chat.

Fixes (all free):
1. **Trim the prompt** — send only the ~6 candidate products per decision + items under
   discussion in full; render the rest of the catalog as terse `id | name | price` lines.
2. **Always keep the system message; cap only history** — e.g. `[system, ...rest.slice(-12)]`
   so grounding never gets sliced away, and 24→12 halves the history portion.
3. **Enable OpenRouter prompt caching** on the static catalog/decisions block (identical every
   turn for every user) so you stop paying to re-read it.
4. **Hard prepaid spend cap** + a per-user rate limit so a spike or one abuser can't surprise you.
5. **Deterministic parser first** — run `demoTurn()`'s rule-based intent parser on every message;
   only fall through to the LLM on a confident miss. The common 80% ("reorder my usuals", "what's
   on sale", known decision categories) then costs **$0 in tokens**.

## Scaling ladder — move by trigger, not by calendar

| Stage | Trigger to move | Do | Tech | ~Cost/mo |
|---|---|---|---|---|
| **0. Harden static + cap AI** | You're here now | The 5 fixes above. No backend. | Pages + Worker + OpenRouter (cached, capped) | $0–20 |
| **1. Thin backend** | "Why isn't my cart on my phone?" / first real Stripe payment / accounts | Move *state + payments* server-side; managed auth (Clerk/Auth0/Supabase — never roll your own); ship privacy policy + delete/export. Keep `scoreDecision()` in the browser. | FastAPI **or** Node + managed Postgres | $20–50 |
| **2. Cache the LLM** | Real LLM spend from genuine traffic | Parser is default, LLM is fallback; normalized response cache (bp monitor = "bp cuff" → one cached narration). AI cost scales with *novel phrasings*, not users. | Redis/Upstash or a Postgres key table | $0–10 |
| **3. Harden + scale catalog** | 1000s of daily users / 5+ categories / latency / 429s | CDN-cache + version `data.json`; `/catalog` API; Worker observability; provider failover; productionize the Category Factory as Python in CI. | CDN + API + multi-provider LLM | $50–200 |
| **4. Multi-tenant / enterprise** | A B2B buyer (senior-living, clinic, employer) wants it deployed | Multi-tenancy (`tenant_id`), SSO/SAML, RBAC, audit logs, DSAR. **SOC 2 Type II.** The engine *still* doesn't change. | FastAPI/Django + Postgres + queue + SSO | contract-driven |

## Compliance map (fact-checked)

| Regime | Applies when | What to do |
|---|---|---|
| **HIPAA** | **Almost certainly NOT now.** Binds only covered entities (health plans/clearinghouses/providers doing standard e-transactions) + their business associates. Selling an OTC BP monitor is retail, not PHI. Only flips if you later bill insurance, run a pharmacy/telehealth, or become a business associate (a Stage-4 deal). | **Nothing now.** There is **no official "HIPAA certification"** — don't market it (the FTC polices deceptive health/privacy claims regardless of HIPAA). If a covered-entity deal appears: healthcare counsel + a BAA + the Security Rule. |
| **PCI DSS** | When you take real cards (Stage 1) | Use Stripe Checkout / Apple Pay hosted+tokenized so card numbers never touch you → lightest tier (typically **SAQ-A**). Still complete the SAQ; keep `sk_live` only in the serverless function. |
| **Privacy (CCPA/CPRA, GDPR)** | Attaches to **data**, the moment you store names/emails/orders server-side (Stage 1) | Privacy policy + lawful basis + security + delete/export (DSAR) — even while tiny. Storing identity-linked *health-purchase* history may trigger heightened-sensitivity rules → see a privacy lawyer before doing that. |
| **ADA / WCAG** | **Now**, and it's core to an elder product | Target WCAG 2.1/2.2 **AA**; bake an a11y check into releases. The design sweep already moved this forward. |
| **SOC 2 Type II** | Stage 4, when B2B buyers ask | Pursue **before** any HIPAA posture — it's what enterprise buyers actually request. |

## The guardrails that keep AI from ever becoming the downfall
1. AI never decides money or picks products — deterministic JS does. (The load-bearing rule.)
2. **Demo mode is a permanent contract** — the app must always run with the AI unplugged (make it a CI check).
3. Deterministic parser first, LLM only on a confident miss.
4. Hard spend cap + per-user rate limit, always.
5. Cache aggressively — never pay for the catalog twice.
6. LLM stays behind the Worker boundary (key server-side, provider swappable).
7. Health judgment stays in auditable code, never an opaque model — a trust *and* compliance asset.
8. LLM degrades gracefully — if it's down, the deterministic path still lets users shop + check out.
9. No personal/proprietary data goes to the LLM — only the minimal catalog slice + message.
