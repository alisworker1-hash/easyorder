# EasyOrder — Decision Engine (V1 sketch)

> The shift: EasyOrder today **reorders known essentials** (groceries, one price per SKU).
> The decision engine adds the ability to **make a hard purchase decision** for the shopper
> on a high-judgment, high-anxiety item — and explain *why*, with a confidence score and the
> reasons it rejected the alternatives. The human always taps "Pay with Apple Pay."

## Core principle: judgment is deterministic, the LLM only narrates

The existing assistant is trustworthy because its tools run **locally against real catalog
data** and the model never invents a price (`runTool`, `assistant.js`). The decision engine
applies the same discipline to *judgment*:

- **Scoring runs in the browser**, deterministically, on curated attributes.
- The LLM only (a) gathers the 1–3 constraints that change the answer and (b) narrates the
  result warmly in plain language.

A recommendation therefore can never be hallucinated — it is auditable arithmetic the model
is explaining. This neutralizes the hardest hurdles: fake reviews swaying the pick,
recommendation quality, and trust.

## Wedge category

Start with **Health & Mobility** (the category already exists). A 70-year-old buying a blood
pressure monitor, a walker, or a pulse oximeter is exactly the person for whom 45 minutes of
conflicting-review research is impossible, and where a wrong choice carries real stakes.
Maximum judgment, maximum anxiety, exact target segment. Ship **one** such category first.

## Data model delta

A *considered purchase* groups competing options under a need, with comparable attributes
and a scoring rubric. Add a `decisions` array to `data.json`:

```json
"decisions": [{
  "id": "bp-monitor",
  "need": "blood pressure monitor",
  "category": "health",
  "ask": [
    {"id":"budget",  "q":"Roughly what would you like to spend?", "type":"money"},
    {"id":"display", "q":"Is a large, easy-to-read screen important?", "type":"bool"},
    {"id":"cuff",    "q":"Do you need it to fit a larger arm?", "type":"bool"}
  ],
  "rubric": [
    {"attr":"reliability",       "weight":0.30, "dir":"high"},
    {"attr":"easeOfUse",         "weight":0.25, "dir":"high"},
    {"attr":"accuracyValidated", "weight":0.20, "dir":"high"},
    {"attr":"lifetimeCost",      "weight":0.15, "dir":"low"},
    {"attr":"price",             "weight":0.10, "dir":"low"}
  ],
  "candidates": [
    {"id":"bp-omron5", "name":"Omron 5 Series Upper Arm", "price":44.99,
     "rating":4.6, "reviewCount":12000,
     "attrs":{"reliability":9,"easeOfUse":8,"accuracyValidated":true,
              "display":"large","cuff":"standard","lifetimeCost":45,"warrantyYears":5}},
    {"id":"bp-beurer", "name":"Beurer BM47", "price":51.99, "rating":4.4, "reviewCount":3100,
     "attrs":{"reliability":8,"easeOfUse":8,"accuracyValidated":true,
              "display":"large","cuff":"small","lifetimeCost":58,"warrantyYears":5}},
    {"id":"bp-lotfancy","name":"LotFancy Monitor","price":23.99,"rating":4.0,"reviewCount":900,
     "attrs":{"reliability":6,"easeOfUse":7,"accuracyValidated":false,
              "display":"large","cuff":"standard","lifetimeCost":40,"warrantyYears":1}}
  ]
}]
```

The hand-curated, **honestly-attributed** candidate set is the actual moat (structured
product-quality/judgment data is expensive to fake; price-compare tools don't have it).
Curate ~6 models per category by hand to start.

## The flow (human always taps buy)

1. **Detect intent → ask only the 1–3 gating questions** (budget + the attributes that
   actually change the answer). Not a 20-question intake.
2. **Filter on hard constraints, then score deterministically in the browser.** Normalize
   each attribute to 0–1, apply rubric weights, sum → 0–100. Compute
   `lifetimeCost = price + consumables + replacementProbability * price` over the warranty
   horizon — this is what makes "the cheapest isn't the cheapest" real rather than rhetoric.
3. **Return finalists + pick + confidence + rejection reasons** from a local tool; the LLM
   narrates.
4. **Human taps Add → Pay with Apple Pay** — reuses the existing cart/checkout unchanged.

### Maps onto existing code

Add one local tool beside the existing four (`add_to_cart`, `search_catalog`, `view_cart`,
`open_cart`). The model calls it; the engine runs on real data exactly like `add_to_cart`:

```js
{ name: "recommend",
  description: "Score the options for a considered purchase and return finalists, a pick, a confidence score, and why each was rejected.",
  parameters: { need: "string", constraints: "object" } }
```

`runTool("recommend", …)`:
1. filter candidates by hard constraints (budget ceiling, cuff fit),
2. score the survivors with the rubric,
3. pick #1; for each other finalist derive its rejection reason = the weighted attribute
   where it lost the most ground to the pick,
4. compute confidence:

```
confidence = 0.50
  + 0.30 * gap(score1 - score2)        // is there a clear winner?
  + 0.10 * min(reviewCount/5000, 1)    // is the pick well-evidenced?
  + 0.10 * fractionOfConstraintsMet
clamp to [0.45, 0.97]                   // never 100%; a close call reads low
```

When #1 and #2 are within a hair, confidence drops and the assistant **says it's a close
call and lays out the tradeoff**. Honest uncertainty builds more trust than false certainty.

## Example (every clause traces to the JSON)

> **Shopper:** I need a blood pressure monitor.
> **Helper:** Happy to help — two quick questions. Do you want a large, easy-to-read screen,
> and about what would you like to spend?
> **Shopper:** Big screen, under $60.
> *[model calls `recommend("bp monitor", {display:"large", budget:60})`]*
> **Helper:** I looked at 6 and narrowed it to three:
> • **Omron 5 Series — $45 — my pick**
> • Beurer BM47 — $52 — just as accurate, but the cuff runs small
> • LotFancy — $24 — cheapest, but reviews disagree on accuracy
> I'd choose the **Omron**: clinically validated, the largest display of the three, a 5-year
> warranty — and once you count replacement cuffs it's the cheapest to *own*, not just to buy.
> **I'm 86% confident.** I set the LotFancy aside because its accuracy reviews conflict, and
> the Beurer because its cuff may be tight on a larger arm. Want me to add the Omron?

## Deliberately OUT of V1

Auto-buy, multi-retailer price scraping, buy-timing prediction, automated returns, the
multi-agent "CTO org chart." V1 is: **one category, decision support, human buys, existing
fulfillment.** Ship it, get one real person to trust it twice, then widen to a second category.

## The Category Factory — the operating system that makes this efficient

The product is a **thin deterministic engine (written once) wrapped around a content
pipeline (run per category).** The engine never changes; the only thing that grows is
curated, honest product data — and that's a pipeline, not hand-labor. The whole strategy is
to drive the **marginal cost of a new category toward zero.**

| Stage | What | Who runs it | Why |
|---|---|---|---|
| 0. Brief | Name the need, write the 1–3 gating questions, set rubric weights | **You, ~10 min** | The only irreducible human judgment |
| 1. Discover | "Current best N <item> under $X, 2026 models, with prices" | **Grok** (real-time web) | Prices/models change → freshness matters |
| 2. Extract | Spec sheets + review corpus → rubric attributes as JSON | **Gemini** (free, 1M ctx) | Bulk reading is its job |
| 3. Verify | Each attribute cites a source; a challenger model tries to *refute* each score; conflicts → lowered confidence, not hidden | **2nd free model + you review** | This adversarial pass **is the moat** — honest, sourced data |
| 4. Compile | Emit drop-in `decisions[]` JSON, schema-validated | script | Mechanical |
| 5. Engine | Deterministic `recommend` scorer + confidence | **Written once** | Reused across every category forever |

Stages 1–4 are ~90% free-worker labor (no API bill — Grok/Gemini/Codex), bounded by the
10-minute brief. Stage 5 amortizes across all categories. **Adding category #2 = write a
brief, run the pipeline, spot-check.** The moat (honest data) compounds while per-category
effort collapses.

## V1 status — SHIPPED to repo, verified in-app (2026-06-27)

- **Category:** home-office **printers** (low liability, high research-fatigue, bridges
  consumer → SMB). Six real 2025–26 models curated via the pipeline (Grok discover/extract +
  Claude verify), seeded into `data.json` (`decisions[0]` + `office` category products).
- **Engine:** `scoreDecision()` + `recommend` tool live in `assistant.js`; works in both live
  (LLM narrates) and demo (deterministic) modes.
- **Verified end-to-end in preview:** "wireless printer under $250" → 6 considered → 3
  finalists → pick **Epson EcoTank ET-2980** at **67% confidence** (correctly humble: the
  EcoTank 86 vs Brother laser 85 is a near-tie) → honest rejection reasons → tap **Add** →
  item lands in the existing cart. The HP ENVY 6555e (cheap printer, expensive ink) correctly
  scored last at 15.
- **Data tightened to production quality (2026-06-27):** re-verified every checkable fact
  (current price, real replacement-cartridge model + price + page yield, warranty) via
  real-time web, then Claude-reconciled. `runningCostPerPage` and `lifetimeCost3yr` are now
  **derived by arithmetic** (`price + cartridge$/yield × pages-needing-refill over 3yr`;
  ink-tanks model their large in-box ink supply) so every cost is auditable, not guessed.
  Corrections: the non-verifiable "HP M209d" → real **M209dw** (wireless+duplex); ENVY 6555e
  $170→$100 with its true ~9¢/page ink; several 2-yr warranties → 1-yr; ink-tank cost-to-own
  ≈ printer price (in-box ink covers >3yr).
- **Added a `color` gating question + attribute** — tightening flipped the generic pick to a
  mono laser, which would wrongly steer a color-wanting shopper to B&W-only. Now: *color
  needed* → Epson EcoTank wins at **95%** (clear winner, high band); *B&W fine* → Brother
  DCP-L2640DW at **72%** (close call, mid band). Confidence correctly tracks how decisive the
  data is. All-six-wireless made "wireless?" a non-discriminating question, so gating is now
  the two that matter: **budget + color**.
- Each product carries `_source` (cartridge + provenance), `_method` (how cost-to-own was
  derived), and the decision carries a `_dataNote` flagging that reliability/ease/quality are
  editorial-consensus estimates, not lab-measured.

## Proof: 2nd category (robot vacuums) — the marginal cost claim, demonstrated (2026-06-27)

Ran the full factory on a structurally *different* category (feature-driven, not running-cost)
to test the "~one brief" claim:

- **Stage 0 brief** (the only human-judgment step): need = robot vacuum; gating = budget +
  pets + self-empty; rubric weighted to reliability / cleaning / ease / navigation.
- **Stages 1–2** (Grok discover+extract): 6 real 2025–26 models, budget → premium.
- **Stage 3 verify caught two things** — exactly its job: (a) "Ecovacs Deebot T90 Pro Omni"
  uses non-existent numbering → corrected to the real **Deebot T30 Omni**; (b) all six were
  self-empty, so "self-empty?" discriminates nothing → dropped it, gating became **budget +
  pets** (the same lesson as printers' "wireless?").
- **Stage 4–5**: compiled into `data.json` as `decisions[1]`; products in the existing
  `household` category; `lifetimeCost3yr` derived from price + 3yr consumables.

**Result, verified live with ZERO scorer/UI changes:** "I need a robot vacuum, I have a dog"
→ detected pets → **Roborock Qrevo S5V at 93%** (clear winner, high band), Eufy auto-excluded
for weak pet-hair, same badged cards. Under $300 → Dreame D10 wins. The *only* code edit was a
one-time generalization of the demo-mode parser (it now reads each decision's own `ask` list),
so category #3 needs **no JS at all** — just a brief + a pipeline run + a verify pass.

Marginal cost of a category: one ~10-minute brief, one Grok run, one verify pass. Confirmed.

## Build order

1. Add the `decisions` array + one curated category (BP monitors, ~6 real models) to `data.json`.
2. Add the `recommend` tool + local scoring engine to `assistant.js` (mirrors `runTool`).
3. Extend the system prompt: when the shopper wants a considered item, ask the gating
   questions, then call `recommend` and narrate finalists / pick / confidence / rejections.
4. Render finalists as comparison cards (extend `productCardsHTML`) with the pick badged.
5. Keep checkout exactly as-is.
