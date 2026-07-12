# SHIP — easyorder
*The master gate checklist. `shipyard gate` reads the boxes under the current
phase; tick a box only when it's TRUE. ⛔ = Ali-only step (models prepare,
never perform). Playbook: `~/shipyard/PLAYBOOK.md`.*

## 0 · Intake
- [x] SPEC.md §Intake answered in plain words (who / pain / payer / existing / smallest)  ✧ own pre-template SPEC.md: senior/less-tech shoppers, reorder-essentials pain, smallest=static site
- [x] The payer is credible (or "deliberate free/marketing" is written with what it markets)  ✧ deliberate free demo — recorded in SPEC.md 2026-07-11

## 1 · Kill-test
- [x] KILL-TEST.md defines the cheapest experiment that could kill this  ✧ skip recorded retroactively 2026-07-11 (KILL-TEST.md)
- [x] ⛔ The test actually ran against reality (real prospects / real signup / real usage)  ✧ skipped by decision — portfolio demo (DECISIONS.md)
- [x] VERDICT recorded: build | pivot | kill (kill = archive with pride)  ✧ build-as-demo, retro-recorded

## 2 · Spec
- [ ] User + top-3 jobs written; everything else in NON-GOALS
- [ ] Definition of DONE copied verbatim from the playbook (deployed·monitored·documented·used-by-a-stranger·dollar-path-live)
- [ ] 5–15 golden cases written (input → expected output)

## 3 · Decide
- [ ] DECISIONS.md: stack row chosen from the table (or deviation reason written)
- [ ] Data + payments + auth rows decided
- [ ] Every external dependency has a fallback or a loud skip, named
- [ ] Secrets plan written (where each key lives, how it rotates) BEFORE the first key exists

## 4 · Build
- [ ] Tests exist and pass; golden cases are the acceptance suite
- [ ] Every delegate (cdx/gem) diff was reviewed before accepting
- [ ] Security pass done: inputs validated · rate-limits on public endpoints · CORS locked · no secrets client-side · errors don't leak · user/document content treated as DATA never instructions
- [ ] README lets a stranger run it cold

## 5 · Verify
- [ ] Full suite green on a fresh run
- [ ] Real-device pass done (the actual user's kind of device)
- [ ] Golden-case eval green; client-facing UI got the 10-min accessibility pass
- [ ] ⛔ Ali used it cold, no coaching; stumbles became work items and were fixed

## 6 · Launch
- [ ] RUNBOOK.md complete: keys+rotation · deploy · monitoring · ROLLBACK command
- [ ] Real URL live; favicon/OG set; repo pushed to remote
- [ ] Registry updated: `shipyard set easyorder status=live url=… expect_status=…`
- [ ] `shipyard probe easyorder` returns OK against the live URL
- [ ] ⛔ Deploy/DNS/keys on any client-owned property done by Ali

## 7 · Operate
- [ ] Product shows in the weekly `shipyard probe --all` sweep
- [ ] First week of real usage reviewed; breakage → POSTMORTEM.md → playbook updated
- [ ] Zombie rule acknowledged: 2 weeks failing probe ⇒ fix, pause, or kill (in registry)

## 8 · Sell & collect
- [ ] ⛔ Client gate honored BEFORE work: estimate + signed contract (vault SOP)
- [ ] Price is value-anchored and written in plain words (no AI-fluff copy)
- [ ] Handoff package delivered (access, RUNBOOK, walkthrough, support terms)
- [ ] ⛔ Invoice sent the day of delivery; referral/testimonial asked
- [ ] Reusable residue captured (playbook/template fed to workflow-compiler)
