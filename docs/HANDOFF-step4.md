# Handoff — Step 4: W3-T8 Balance pass + 2-turn AI Siege telegraph

**Read first:** `AGENTS.md`, `docs/SPEC.md` (roadmap `W3-T8`, M1 Exit Gate). Branch: new branch off `main`.
**State:** W1-T1 → W2-T7 done and merged (PRs #1–#7). 117 tests; `npm run typecheck`, `lint`, `build` clean; bundle ≈ 98 KB gzipped (budget 250 KB); `npm run sim` ≈ 1.1 s / 1,000 games.

## What just landed (W2-T7)
- `src/ui/GreyboxApp.tsx` (raw semantic HTML): dashboard for all four syndicates, rackets table with per-row seize odds + prep select, action forms (extort/recruit/launder/bribe/frame/wiretap/pass) with live roll % for EXTORT, End Week, new game with seed input, last-week events, DecisionTrace table (latest 60).
- `src/ui/viewModel.ts` (pure: `rollPreview`, racket rows, trace rows), `src/ui/gameReducer.ts` (`useReducer` wrapper: ACTION / END_WEEK / NEW_GAME; END_WEEK = `executeAllAITurns` then `advanceWeek`). No zustand, no new deps.
- `src/App.tsx` renders `GreyboxApp`; tests: viewModel, gameReducer, SSR render check. Verified in Chromium: extort/seize/launder/end-week work, no console errors.

## Next task: W3-T8 (10h, the big one) — recommended split
Do it as two reviewable PRs, output a file-by-file plan first and wait for approval.

### W3-T8a — Balance pass (do first)
Goal = **M1 Exit Gate**: `< 5%` AI insolvency rate and every archetype `12%–32%` win rate in 4-way sims (`npm run sim`, 1,000 games, seeds 1+).
1. **Diagnose before tuning.** Replay one seed in the greybox UI (or a throwaway script) and read the `DecisionTrace`s for weeks 1–3 to see where the $6,000 goes. Hypothesis: AI spends cash on SEIZE/prep/recruit, cannot cover Sunday payroll ($1,000/wk for 4 thugs), then liquidates → insolvent in ~3 weeks. Confirm with numbers (cash at each week end, payroll shortfalls) rather than guessing.
2. **Candidate knobs, least invasive first** (SPEC §1–3 fixes the formulas; changing numbers in `src/data/*.json` or `constants.ts` is a balance change and must be called out): AI affordability guard (keep a payroll reserve — a scoring/legality change in `ai.ts`, symmetric with the player), the `+65`/`-999` emergency modifiers (SPEC §5.1; also fix the known "+65 applies to every >60% job, should be best job only" issue), EV weighting of RECRUIT/SEIZE, job payouts, starting cash. Prefer AI-logic fixes over changing player-visible economy numbers.
3. Also settle the **win-reason labelling**: last-standing currently reports `DOMINATION`; add a distinct `WinReason` (e.g. `LAST_STANDING`) only if it is cheap and tests are updated — otherwise leave and note.
4. Extend `scripts/simCore.ts` as needed (e.g. print per-week insolvency, avg cash) but keep sim output stable. Record before/after tables in the PR and in the next handoff.
5. Tests: new engine/AI tests for any rule changed; never loosen existing assertions — if one encodes an old balance number, surface it and ask.

### W3-T8b — 2-turn AI Siege telegraph (after the gate passes)
SPEC §2: "tick active 2-turn Siege Telegraphs" at start of week; player actions "queued if 2-turn Siege". `GameState.activeSieges` is currently `unknown[]`.
- Define a typed `Siege` (attackerId, racketId, prepTier, telegraphedWeek, resolveWeek) in `types.ts`; replace `unknown[]`.
- AI announces a SEIZE as a siege one week ahead (visible to the player/defender), resolves it at start of the resolve week through the same `applyAction`-path rules (zero-cheat symmetry: the player must be able to declare sieges too, or document why only AI telegraphs in M1).
- Decide and document: what the defender can do in between (e.g. guards are not implemented — `assignedGuards` never set — so keep scope minimal: telegraph + resolve + UI line in greybox), cancellation if attacker is eliminated / loses AP / cash, determinism (rng consumed only at resolve).
- Engine-only plus a small greybox "Active sieges" table. Tests: telegraph → tick → resolve, cancellation, determinism for same seed.
- Re-run the sim after T8b: the gate must still hold.

## Baseline sim (seed 1, 1,000 games, from W2-T6)
Avg length 3.1 wks; seats insolvent 36.1% (83.6% of games); eliminations RICO 18 / INSOLVENT 1445 / WIPED_OUT 1510; 967 DOMINATION vs 21 VALUATION; win rates warlord 26.1, banker 25.5, rat 22.5, opportunist 25.5, turtle 23.9.
Likely root cause to check first: payroll ($250/thug × 4 = $1,000/wk) against a $6,000 start with early AI spending on prep/assaults; the AI burns cash on SEIZE/recruit and cannot cover Sunday payroll, then liquidates/insolvents within ~3 weeks. Use `DecisionTrace` + the greybox UI to watch one seed.

## Known issues
- Last-standing winner is labelled `DOMINATION`; guards (`assignedGuards`) never set; +65 emergency bonus applies to every >60% job instead of the best only; early M3 coalition scoring; no CI workflow; `runWeek` not built.
- `npm run typecheck` is `tsc --noEmit` on a solution-style root tsconfig (checks nothing); `npm run build` (`tsc -b`) is the real typecheck.
- Greybox UI: no per-seat "last action" feedback beyond DecisionTrace; EXTORT preview only for the selected job; no component-level (DOM) tests — only logic + SSR render.

## Out of scope
Styling/shadcn (M2+), Diplomacy, Lieutenants, Replay Scrubber, `?seed=` URL param (M5).
