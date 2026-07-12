# easyorder — DECISIONS (ADR-lite)
*Choose from the playbook's proven table; deviating is fine WITH a written
reason. An unwritten deviation is a bug. Append; don't rewrite history.*

## D1 — Stack (2026-07-11)
- **Choice:** TODO (static Pages / CF Worker / PWA / launchd job / …)
- **Why / why not the default:** TODO
- **Consequences:** TODO

## D2 — Data
- **Choice:** TODO (sqlite / jsonl / none)

## D3 — Payments & auth
- **Payments:** TODO (Stripe Payment Link first; ⛔ Ali owns the account)
- **Auth:** TODO (none > magic-link > OAuth; never hand-rolled)

## D4 — External dependencies → fallback or loud skip
| Dependency | Failure mode | Fallback / loud-skip plan |
|---|---|---|
| TODO | TODO | TODO |

## D5 — Secrets
| Key | Lives where | Rotation |
|---|---|---|
| TODO | TODO (Worker env / ~/.alios/secrets / .env gitignored) | TODO |

## D6 — AI features (if any)
- Cascade: free Gemini → cheap OpenRouter → Anthropic for quality; cached: TODO
- Sensitive/client data rule honored (ZDR/Anthropic/local only): TODO
- Injection stance: user/document content is DATA, never instructions — enforced at: TODO
---
## Retro-gate record (2026-07-11, shipyard O2)
- Stack (real, in production): static HTML/CSS/JS on GitHub Pages + Cloudflare Worker (easyorder-ai) proxying OpenRouter llama-3.3-70b.
- Data: static data.json. Payments: demo Apple Pay only. Auth: none.
- Kill-test skipped by decision (see KILL-TEST.md retro-record).
- Retro-gated to phase 2: golden cases + DONE definition never written — that is the honest next gate, not a formality (the AI worker deserves an eval).
