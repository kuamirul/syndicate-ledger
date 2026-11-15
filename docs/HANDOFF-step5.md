# Handoff — Step 5: W3-T8b 2-turn AI Siege telegraph

**Read first:** `AGENTS.md`, `docs/SPEC.md` (§2 turn order, roadmap `W3-T8`), this note.
**Branch:** stacked branch `claude/cool-rubin-nygntd-t8b` off `claude/cool-rubin-nygntd` (W3-T8a PR). Rebase onto `main` once T8a merges.

## State after W3-T8a
- `npm test`: 135 tests, all green. `npm run typecheck`, `npm run lint`, `npm run build` clean.
- Bundle ≈ 98.5 KB gzipped (budget 250 KB).
- `npm run sim`: ≈ 2.7 s / 1,000 games. Budget relaxed from 2 s to **5 s** (approved), because games now run ~16 weeks instead of ~3.
- **M1 Exit Gate: PASSED** (strict reading, approved: < 5% insolvency of seats *and* of games; every archetype 12–32% wins).

### Before / after (1,000 games each)

| Metric | Baseline (seed 1) | After, seed 1 | After, seed 5001 | After, seed 20001 |
|---|---|---|---|---|
| Avg game length | 3.1 wk | 16.1 wk | 16.4 wk | 16.0 wk |
| Insolvent seats / games | 36.1% / 83.6% | **0.4% / 1.4%** | 0.3% / 1.1% | 0.3% / 1.0% |
| Wiped-out seats | 37.8% | 2.8% | 2.9% | 3.0% |
| RICO eliminations | 18 | 0 | 2 | 2 |
| Warlord win % | 26.1 | 29.4 | 27.9 | 30.9 |
| Banker win % | 25.5 | 18.8 | 22.9 | 19.8 |
| Rat win % | 22.5 | 23.4 | 24.0 | 22.4 |
| Opportunist win % | 25.5 | 26.3 | 25.9 | 26.9 |
| Turtle win % | 23.9 | 27.3 | 24.4 | 25.1 |
| Win reasons | 967 DOM*, 21 VAL | 818 DOM, 182 VAL, 0 LAST | 813 / 187 / 0 | 818 / 182 / 0 |

\* Baseline "DOMINATION" was almost entirely last-standing, now labelled `LAST_STANDING`.

## What landed in W3-T8a (all AI scoring; no game rule or economy number changed)
Diagnosis (DecisionTraces + aggregate stats over 1,000 games):
1. Every AI opened with SEIZE prep 2 + SEIZE prep 0 on Uptown. 90% of eliminations came at the end of week 1, and crews dropped from 4 to 1.4.
2. Spending ignored liquidity (the payroll check used pre-action cash). RECRUIT almost never outscored PASS, so crews were never rebuilt (3,112 lost vs 556 hired).
3. Linear heat risk made a bleeding seat PASS into insolvency even at Heat 5.
4. A successful Warlord died of RICO: at Heat 100 it RECRUITed (score 203) instead of bribing (~97).
5. The §4 risk floors (clean ≥ 10%, botched ≤ 65%) make attack nearly irrelevant against hard targets. See known issues.

Changes in `src/engine/ai.ts`:
- **Liquidity guard.** Any spend is clamped to −999 if `cash − cost < payroll (incl. new hires) + AI_CASH_RESERVE`. Yield isn't counted. A self-BRIBE in a heat/RICO emergency only needs to cover payroll.
- **Decay-aware heat risk.** The linear EXTORT heat term is 0 while `heat + E[Δheat] ≤ AI_SAFE_HEAT`. The ≥70/≥90 penalties are unchanged.
- **No empty-crew jobs.** No EXTORT/SEIZE candidates are generated at 0 crew. The player rule is unchanged (approved: leave the exploit).
- **RICO override.** If `projectSundayHeat() ≥ 100`, self-BRIBE gets `AI_RICO_EMERGENCY` (+999), so it always ranks first.
- **RECRUIT lookahead.** `evScore = (bestJobEV(new atk) − bestJobEV(atk)) × 3 AP × 4 wk − hire − 4 wk payroll`. `bestJobEV` counts only *safe* (≥ 60% win) and *repeatable* (E[heat] ≤ 5 = weekly decay) jobs.
- **+65 fix.** The bonus now goes to the single highest-EV ≥ 60% job only (known issue closed).
- **Speed.** `buildScoringContext` caches per-state values. `selectBestAIAction` uses a linear max-scan with the same comparator (identical pick, verified by test).

Other files:
- `reducer.ts`: `projectSundayHeat()` is extracted and shared with `advanceWeek`. Last survivor → `LAST_STANDING`.
- `types.ts`: `WinReason` gains `LAST_STANDING`.
- `scripts/`: LAST_STANDING count, wiped-out seat rate, any-bankruptcy games line, 5 s budget.

**Balance-number call-out.** No values in `src/data/*.json` changed, and no existing constants changed. New AI-only constants in `constants.ts`: `AI_CASH_RESERVE = 1000`, `AI_SAFE_HEAT = 30`, `AI_RICO_EMERGENCY = 999`, `AI_LOOKAHEAD_WEEKS = 4`, `ACTION_POINTS_PER_WEEK = 3`. In `ai.ts`: `SAFE_JOB_WIN_PCT = 60`, `SUSTAINABLE_JOB_HEAT = 5`.

**Test call-out.** One existing assertion was extended rather than loosened: `simCore.test.ts` win-reason sum now includes `LAST_STANDING`.

Tried and rejected, with numbers in the PR: ruin-aversion penalty (insolvency rose to 35%), counting Sunday yield in the guard (rival seizes it first), an earlier payroll trigger (no effect), earning-power casualty pricing (Opportunist 53% / Turtle 2.9%).

## Next task: W3-T8b — 2-turn AI Siege telegraph (separate PR)
SPEC §2: "tick active 2-turn Siege Telegraphs" at the start of the week; player actions are "queued if 2-turn Siege". `GameState.activeSieges` is `unknown[]`.

Plan (inspect first, then post a file-by-file plan and wait for approval):
1. `types.ts`: `interface Siege { id: string; attackerId: string; racketId: string; prepTier: PrepTier; telegraphedWeek: number; resolveWeek: number }`. Replace `unknown[]` and add an id counter or deterministic id (`${week}-${attackerId}-${racketId}`; no `randomUUID`).
2. `types.ts` `Action`: add `{ type: 'DECLARE_SIEGE'; racketId; prepTier }`. It's legal for any syndicate (zero-cheat symmetry: the player can declare too), costs 1 AP, and pays `ASSAULT_BASE_COST + prep` up front so the liquidity guard sees it.
3. `reducer.ts`: `applyAction` validates (rival-owned racket only, so neutral rackets stay instant SEIZE; no duplicate siege on the same racket by the same attacker) and pushes the Siege. Add `tickSieges(state)` at the start of the week, called from `advanceWeek` after `week += 1` (or a new `startWeek`; decide and document). It resolves sieges whose `resolveWeek === week` through the same risk roll and ownership/casualty/grudge code as SEIZE (extract a shared `resolveAssault()` so there's no duplicated combat logic).
4. **Cancellation:** attacker eliminated, attacker has 0 crew at resolve, or the racket is already owned by the attacker (or changed hands to a third party: decide). The cost is not refunded (document it). RNG is consumed only at resolve.
5. **Defender window:** guards (`assignedGuards`) are still never set. Keep scope minimal, with no new defender verb. Just document that the telegraph gives the defender a week to counter-attack, bribe, or move cash.
6. `ai.ts`: generate DECLARE_SIEGE candidates for rival rackets and score them like SEIZE. Apply the same guard. Optionally a small turf bonus for a telegraphed siege vs instant SEIZE: decide from sim numbers.
7. `GreyboxApp.tsx`: an "Active sieges" table (attacker, racket, prep, resolves week N) plus a declare form. Raw HTML only.
8. Tests: telegraph → tick → resolve, cancellations, determinism (same seed ⇒ identical state), AI symmetry, player can declare. Re-run the sim on seeds 1 / 5001 / 20001: the gate must still hold. Record before/after.

## Known issues / design notes
- **§4 risk floors (design hole, needs a SPEC decision).** Clean is floored at 10% and botched capped at 65%, so at low R attack doesn't matter. 0, 1 or 4 thugs all get 51% vs Uptown with prep 2, and at attack 0 the best job is the Midnight Vault at $2,375 EV/AP. The AI now avoids this. **A human player can still run 0-crew vault jobs** (left by decision). Fix candidates for a future task: scale the floors by R, require ≥ 1 crew, or make prep bonuses scale with attack.
- **Turtle wipe-outs:** ~75 per 1,000 games (vs ~3–28 for the others). A thin 3-thug Turtle at low heat takes long-shot jobs and loses its crew. This isn't a gate metric, and it fell out of scope after the casualty-pricing attempt broke balance.
- **Warlord headroom:** 30.9% on seed 20001 is 1.1 pp under the 32% ceiling. Watch it after T8b.
- **Domination-heavy endings:** ~82% of games end by domination (~week 16) rather than week-52 valuation. Revisit with Diplomacy/coalitions (M3).
- **Cross-platform determinism:** tie-breaks use `String.localeCompare` (pre-existing), whose ordering can depend on the ICU build. Consider a code-unit comparison in a later engine-hygiene task; it will change some tie outcomes.
- **Still open from earlier steps:** guards never set; `npm run typecheck` (`tsc --noEmit` on a solution tsconfig) checks nothing, so `npm run build` is the real typecheck; no CI workflow; `runWeek` not built.

## Out of scope
Styling/shadcn (M2+), Diplomacy, Lieutenants, Replay Scrubber, `?seed=` URL (M5), §4 formula changes, the 0-crew player exploit.
