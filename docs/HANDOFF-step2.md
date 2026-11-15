# Handoff — Step 2: W2-T6 `scripts/sim.ts` CLI runner

**Read first:** `AGENTS.md` (rules), `docs/SPEC.md` (spec, roadmap line `W2-T6`). Branch: `claude/relaxed-ride-52rr12`.
**State:** W1-T1 → W2-T5 plus the Step 1 engine-fix PR (`docs/HANDOFF-step1.md`) done. 101 tests green; typecheck/lint/build clean.

## What just landed (Step 1)
- `ActionResult.executed` (committed vs. rejected); AI turn loop breaks on `!executed`, so botched SEIZE no longer ends the turn.
- `executeAIAction`/`executeAITurn` no longer mutate input state on rejected actions (`appendTrace` helper in `ai.ts`).
- `src/engine/crew.ts` is the single source for attack/defense/payroll/crew count; `calculateProjectedRacketYield` lives in `reducer.ts`.
- `src/engine/constants.ts` holds action cost/heat constants.

## Next task: W2-T6
Build `/scripts/sim.ts` (`npm run sim`): headless Node runner, 1,000 games, printing archetype win rates, avg game length, elimination reasons, in `< 2s`.

Plan sketch (confirm in interactive review before editing):
1. Inspect `package.json` scripts, tsconfig includes (the script must typecheck and lint), and how to run TS in Node (e.g. `tsx` devDependency).
2. Game loop per seed: `createInitialGameState(seed)` → each week: AI phase via `executeAllAITurns`, plus the player syndicate driven by the same Utility AI (e.g. an archetype) → `advanceWeek` until `isGameOver` or week cap.
3. Aggregate: win rate by archetype/player seat, avg weeks, `eliminationReason` counts, winReason counts, insolvency rate.
4. Add a Vitest test for the aggregation/runner logic (engine-adjacent code must be tested); keep the runner free of `Math.random`/`Date.now` in engine paths (timing the CLI itself with `performance.now` in the script is fine).

## Known issues / watch-outs
- **Perf:** `cloneGameState` copies history/traces every action; the 1,000-game `< 2s` target may need clone optimisation. Measure first and report rather than silently changing semantics.
- Player seat has no archetype (`archetypeId` unset → default 1.0 weights); decide how to report it.

## Out of scope
Guards (`assignedGuards` never set), last-standing labelled `DOMINATION`, the +65 emergency bonus applying to all >60% jobs, early M3 coalition scoring, the CI workflow, `runWeek`, and balance changes (earlier 200-game sim: avg ≈6 weeks, ~41% insolvency — that is W3-T8).

## Done
`npm test`, `npm run typecheck`, `npm run lint`, `npm run build` clean → commit, push, update this note into `docs/HANDOFF-step3.md` for the following step.
