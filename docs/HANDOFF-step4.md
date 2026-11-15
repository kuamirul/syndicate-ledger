# Handoff — Step 4: W3-T8 Balance pass + 2-turn AI Siege telegraph

**Read first:** `AGENTS.md`, `docs/SPEC.md` (roadmap `W3-T8`, M1 Exit Gate). Branch: new branch off `main`.
**State:** W1-T1 → W2-T7 done. 117 tests; `npm run typecheck`, `lint`, `build` clean; bundle ≈ 98 KB gzipped (budget 250 KB); `npm run sim` ≈ 1.1 s / 1,000 games.

## What just landed (W2-T7)
- `src/ui/GreyboxApp.tsx` (raw semantic HTML): dashboard for all four syndicates, rackets table with per-row seize odds + prep select, action forms (extort/recruit/launder/bribe/frame/wiretap/pass) with live roll % for EXTORT, End Week, new game with seed input, last-week events, DecisionTrace table (latest 60).
- `src/ui/viewModel.ts` (pure: `rollPreview`, racket rows, trace rows), `src/ui/gameReducer.ts` (`useReducer` wrapper: ACTION / END_WEEK / NEW_GAME; END_WEEK = `executeAllAITurns` then `advanceWeek`). No zustand, no new deps.
- `src/App.tsx` renders `GreyboxApp`; tests: viewModel, gameReducer, SSR render check. Verified in Chromium: extort/seize/launder/end-week work, no console errors.

## Next task: W3-T8 (10h, the big one)
1. Balance pass until the **M1 Exit Gate**: `< 5%` AI insolvency rate and every archetype `12%–32%` win rate in 4-way sims (`npm run sim`).
2. 2-turn AI Siege telegraph state (`GameState.activeSieges` is currently `unknown[]`; define a typed `Siege` — attacker, target racket, telegraphed week, resolve week — announced one turn ahead so the player can react; all through `applyAction`/weekly functions, zero-cheat symmetry).
Output a file-by-file plan first and wait for approval. Never loosen existing tests; if a balance change breaks an assertion, surface it. Engine stays pure/deterministic/integer.

## Baseline sim (seed 1, 1,000 games, from W2-T6)
Avg length 3.1 wks; seats insolvent 36.1% (83.6% of games); eliminations RICO 18 / INSOLVENT 1445 / WIPED_OUT 1510; 967 DOMINATION vs 21 VALUATION; win rates warlord 26.1, banker 25.5, rat 22.5, opportunist 25.5, turtle 23.9.
Likely root cause to check first: payroll ($250/thug × 4 = $1,000/wk) against a $6,000 start with early AI spending on prep/assaults; the AI burns cash on SEIZE/recruit and cannot cover Sunday payroll, then liquidates/insolvents within ~3 weeks. Use `DecisionTrace` + the greybox UI to watch one seed.

## Known issues
- Last-standing winner is labelled `DOMINATION`; guards (`assignedGuards`) never set; +65 emergency bonus applies to every >60% job instead of the best only; early M3 coalition scoring; no CI workflow; `runWeek` not built.
- `npm run typecheck` is `tsc --noEmit` on a solution-style root tsconfig (checks nothing); `npm run build` (`tsc -b`) is the real typecheck.
- Greybox UI: no per-seat "last action" feedback beyond DecisionTrace; EXTORT preview only for the selected job; no component-level (DOM) tests — only logic + SSR render.

## Out of scope
Styling/shadcn (M2+), Diplomacy, Lieutenants, Replay Scrubber, `?seed=` URL param (M5).
