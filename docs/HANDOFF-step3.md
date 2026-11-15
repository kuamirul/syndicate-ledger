# Handoff — Step 3: W2-T7 Greybox UI (`src/ui/GreyboxApp.tsx`)

**Read first:** `AGENTS.md`, `docs/SPEC.md` (roadmap `W2-T7`). Branch: new branch off `main` (W2-T6 PR merged once approved).
**State:** W1-T1 → W2-T6 done. Tests, `npm run typecheck`, `npm run lint`, `npm run build` all clean; `npm run sim` runs 1,000 games in ~1.1 s.

## What just landed (W2-T6)
- `scripts/simCore.ts`: pure runner (`playGame`, `runSimulation`, `formatReport`); `scripts/sim.ts`: CLI (`npm run sim [-- --games N --seed S]`, uses `tsx`). `scripts/simCore.test.ts` covers it.
- All four seats (incl. `player`) are driven by the same Utility AI through `applyAction`; archetypes rotate across seats (5 archetypes, 4 seats, each seat/archetype combination balanced per 5 games). The sim sets `archetypeId` on the initial state; the engine is not modified for it.
- Perf: profiling showed AI scoring (not cloning) was the hotspot — `findCityLeader`/`calculateProjectedRacketYield` ran per candidate. `evaluateCandidateActions` now computes them once via an optional `ScoringContext` (semantics identical; test added). 2.0–2.6 s → ~1.1 s.
- `tsconfig.node.json` now includes `scripts` (types: node, resolveJsonModule).

## Baseline sim numbers (seed 1, 1,000 games) — input for W3-T8
- Avg game length **3.1 weeks** (target: games should run far longer); 83.6% of games see an insolvency, 36.1% of seats insolvent; eliminations RICO 18 / INSOLVENT 1445 / WIPED_OUT 1510; 967 DOMINATION wins vs 21 VALUATION.
- Archetype win rates: warlord 26.1%, banker 25.5%, rat 22.5%, opportunist 25.5%, turtle 23.9%.
- The M1 Exit Gate (`< 5%` insolvency, 12–32% win rates) fails on insolvency by a wide margin. Games end almost entirely by last-standing (`DOMINATION`) after early eliminations.

## Next task: W2-T7
Unstyled semantic-HTML greybox in `src/ui/GreyboxApp.tsx`: player dashboard, rackets table, live roll % preview (use `calculateRiskProbabilities`), End Week, raw AI DecisionTrace viewer. Weeks 1–3 rule: raw tables/buttons only, no Tailwind/shadcn/custom CSS. State lives in React (zustand is allowed in UI, never in `/src/engine/`). End Week = AI phase (`executeAllAITurns`, which skips the player) then `advanceWeek`. Output a file-by-file plan first; add tests for any logic added (UI test via existing `App.test.tsx` setup).

## Known issues
- Balance: see baseline above (W3-T8).
- `npm run typecheck` is `tsc --noEmit` against the solution-style root tsconfig (`files: []`), so it checks nothing itself; `npm run build` (`tsc -b`) is the real typecheck. Consider pointing `typecheck` at `tsc -b` (not done here, out of scope).

## Out of scope
Guards (`assignedGuards` never set), last-standing labelled `DOMINATION`, +65 emergency bonus applying to all >60% jobs, early M3 coalition scoring, CI workflow, `runWeek`, balance changes.
