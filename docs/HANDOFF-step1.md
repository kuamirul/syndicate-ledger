# Handoff — Step 1: Engine Fix PR (pre-W2-T6)

**Read first:** `AGENTS.md` (rules), `docs/SPEC.md` (spec). Branch: `claude/relaxed-ride-52rr12`.
**State:** W1-T1 → W2-T5 merged. 94 tests green; typecheck/lint/build clean. Next roadmap task after this is W2-T6 (`scripts/sim.ts`).
**Plan status:** approved, using the `executed` flag design below. No code written yet.

## Fixes (no balance changes — all values stay identical)

1. **Botched SEIZE ends AI turn early.** `ai.ts` `executeAITurn` breaks on `!result.success`, but a botched SEIZE returns `success:false` after spending AP/cash/crew.
   - Add `executed: boolean` to `ActionResult` in `reducer.ts`: `true` when state was committed, `false` on validation rejection (which returns `prevState` unchanged). Keep `success` semantics as-is.
   - Loop breaks on `!result.executed` instead.
2. **Input-state mutation.** `executeAIAction`/`executeAITurn` do `nextState.decisionTraces.push(trace)`; on rejection `nextState === prevState`, so the caller's state is mutated. Add a helper: push onto the fresh clone if executed, else return `{ ...state, decisionTraces: [...state.decisionTraces, trace] }`. Still log rejected traces.
3. **Single source for crew stats.** New `src/engine/crew.ts`: `calculateSyndicateAttack`, `calculateSyndicateDefense`, `calculateSyndicatePayroll`, `calculateTotalCrewCount`, all derived from `CREW_TIERS`/`CREW_BY_ID`. Remove hardcoded versions from `risk.ts` (attack/def), `reducer.ts` (payroll in `advanceWeek`, crew count), `ai.ts` (payroll).
   - Move `calculateProjectedRacketYield` from `ai.ts` → `reducer.ts`; `advanceWeek` step 1 uses it (removes duplicated yield math). Watch for import cycles: `ai` → `reducer` only.
4. **Constants.** New `src/engine/constants.ts`: `ASSAULT_BASE_COST=1500`, `BRIBE_CLEAN_COST=3000`, `BRIBE_DIRTY_COST=4500`, `BRIBE_SELF_HEAT=22`, `BRIBE_FRAME_HEAT=12`, `LAUNDER_MAX=10000`, `LAUNDER_FEE_PCT=25`, `WIRETAP_COST=1000`, `WIRETAP_WEEKS=3`. Replace literals in `reducer.ts` + `ai.ts`.

## Tests (never loosen existing assertions; only update import paths)

- `reducer.test.ts`:
  - botched SEIZE → `executed:true, success:false`, AP −1, cost + prep deducted, crew lost;
  - rejections → `executed:false` and the same state reference returned.
- `ai.test.ts`:
  - **turn continues after a botched roll:** scan a fixed seed range for a turn whose first action is a botched SEIZE, assert that seed exists, then assert the AI kept acting;
  - **no input mutation:** an AI with 0 AP picks PASS, which is rejected; `executeAIAction` must leave the input untouched (deep-equal vs `structuredClone`).
- New `crew.test.ts`: helpers match `CREW_TIERS` sums; 4 thugs → atk 12 / payroll $1,000 (SPEC §3.1).

## Out of scope

Guards (`assignedGuards` is never set), last-standing labelled `DOMINATION`, the +65 emergency bonus applying to all >60% jobs (should be the best job only), early M3 coalition scoring, clone perf for the 1,000-game/<2s sim target, the CI workflow, `runWeek`, balance (a 200-game sim showed avg game length ≈6 weeks and ~41% insolvency — that's for W3-T8).

## Done

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all clean → one commit on `claude/relaxed-ride-52rr12`, pushed. No PR unless asked.
