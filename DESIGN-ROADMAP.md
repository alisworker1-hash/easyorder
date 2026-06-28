# EasyOrder — design roadmap (what to improve next)

Written after an AI design sweep (Codex implemented, Gemini reviewed/generated, Claude verified
each round). Six commits shipped on the `ai-design-pass` branch. This is the prioritized
backlog of what those reviews surfaced that is **not yet done**, plus deeper directions.

## Already shipped in this sweep (for reference)
WCAG contrast (darker greens, faint text), larger fine print, rebuilt mobile top bar,
calmer 560px modals, scannable stacked recommendation cards + full keyboard focus rings,
friendlier "Strong match · 95%" confidence label (kept the honest %), calmer proactive/budget
cards, polished cart/checkout (prominent green Total, tabular prices, real Remove target),
accessible budget modal (replaced `window.prompt`), plainer demo copy, clearer links/chips.

---

## Tier 1 — Quick remaining polish (minutes each)
1. **Tablet-width top bar (600–900px) wraps awkwardly** — Preferences lands on row 1, My
   orders + Cart on row 2. Apply the same clean 2-row grid used on phones, or collapse to a
   "Menu" button earlier. (store.css topbar media queries)
2. **"See photos" opens a new browser tab** — disorienting for older users. Decide: keep
   (it's labelled) vs open same-tab with an in-app Back, vs a small in-app image preview.
   (assistant.js `productCardsHTML` / `decisionCardsHTML`) — flagged by both reviewers.
3. **Greeting tone** — optional "Hi" → "Hello" in the concierge welcome (index.html).

## Tier 2 — Bigger UX / accessibility wins (need real layout work)
4. **Mobile nav is emoji-only (highest-impact item).** On phones, Preferences (🧠) and My
   orders (🗂️) show no text — fine for screen readers (aria-labels exist) but unclear for a
   sighted 70-year-old. Redesign so labels are visible: e.g. a bottom tab bar, or a labelled
   "Menu" sheet listing Preferences / My orders / Cart in words. Needs a nav-pattern decision.
5. **Loading & skeleton states.** The shop grid is blank while `data.json` loads; add skeleton
   cards so it never looks broken. Same for the chat's first paint.
6. **Richer empty states.** Empty cart / no-search-results should suggest a next action
   ("Try 'milk and bread'" / "Ask the helper"), not just a line of text.
7. **Dark mode.** Currently light-only. Many older users run dark mode system-wide; add a
   `prefers-color-scheme: dark` palette (the design already uses CSS variables, so this is
   mostly a second `:root` block).
8. **Recommendation "compare" view.** The cards are good; a true side-by-side table for the 3
   finalists (price · cost-to-own · reliability · the one tradeoff) would make the judgement
   even more scannable — without losing the honest confidence/why-not.

## Tier 3 — Strategic / product-level design
9. **First-run onboarding.** The product's value is *delegation + memory*; a gentle one-time
   intro ("Tell me a brand you avoid and I'll remember it") would teach Preferences and build
   trust on day one.
10. **A consistent "trust chip" system.** Confidence, "early estimates", warranty disclaimers,
    and avoided-brand notes are each styled ad hoc. Unify them into one calm, recognizable
    visual language so honesty *looks* like a feature.
11. **Voice input for the helper.** Older users often prefer speaking; a mic button (Web Speech
    API) on the composer would lower the barrier significantly.
12. **Real product imagery.** Emoji + a Google "see photos" link is a known compromise; a
    curated image source (even a few per category) would lift perceived quality and trust.
13. **Comfort presets.** Beyond A/A+/A++, a single "Comfort mode" that bumps type, spacing, and
    contrast together — one decision instead of three.

## Process note
The Codex-implements / Gemini-reviews / Claude-verifies loop worked well and is repeatable as a
periodic "design sweep" (each round: delegate → review diff → verify in preview → commit).
Keep design experiments on a branch and verify every round — a free model rewriting CSS can
silently break interactive components (it didn't here because each round was scoped + verified).
