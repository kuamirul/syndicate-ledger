# Handoff — Step 9: after M2-T2 (Operations tab + RiskPrepDialog) → M2-T3 (Businesses & Raids, Rivals & Spying)

**Read first:** `AGENTS.md`, `docs/SPEC.md` (§2.1 sieges, §2.3, §3.2, §4), `docs/HANDOFF-step8.md`, this note.

## State
- `npm test`: 255 tests green (+47: 46 in `operationsModel.test.ts`, 1 App SSR). `npm run lint`, `npm run typecheck`, `npm run build` clean.
- Bundle: 159 KB gzipped JS (+ ~5 KB CSS), budget 250 KB.
- 1280x720 headless Chromium: Week 1 (Guided Intro locks), RiskPrepDialog open on a job, Week 4 (all unlocked): 0 console errors, no horizontal scroll. Screenshots in `docs/screenshots/m2-t2-*.png`.
- `/src/engine/` untouched; no existing assertion changed.

## What landed
- `src/ui/operationsModel.ts` (pure): `evaluateSpendSafety`, `splitRecruitCost` (Street first, Safe overflow, as in `reducer.ts`), `canAct`, generic `buildPrepTierOptions(state, id, baseStreetCost, oddsFor)`, `buildJobRows`, `jobConsequences`, `buildCrewOptions`, `buildLaunderOption`, `buildPayCopsOptions`, `buildSpyOption`, `buildSnitchOptions`, `sectionLocks`. Every `disabledReason === null` is tested against `applyAction` (`executed`).
- `RiskPrepDialog` (generic, reusable for M2-T3): 3 prep tiers with odds bars, +/- deltas, per-tier spend line, per-outcome consequences. Selected tier resets on every open.
- `SpendLine`: `Cost $X → Leaves $Y` + `[Sunday Shortfall Risk]` (rose = this spend causes it, amber = already short before spending).
- `OperationsTab`: Run Cash Job table (Run $0 + Boost Odds…), Hire Crew (1x/2x/3x), Protect Profits (Bank Safe Cash presets, Pay Off Cops with explicit Safe/Street payment), Covert Ops (Spy, Snitch, rival selector, shortcut to Rivals tab). Protect/Covert are locked cards in weeks 1-2 / 1-3 while Guided Intro is ON.
- `terms.ts`: `SPEND_TERMS`, `RISK_OUTCOME_LABELS`, `OPS_SECTIONS` (additive).
- New dependency: `@radix-ui/react-dialog` (stock shadcn Dialog, no animation).

## Rules worth knowing
- `BRIBE` has no payment priority: `useClean` picks Safe ($3,000) or Street ($4,500); UI shows both buttons.
- Job cost is prep only; payout is not guaranteed, so "Leaves $Y" is cash after prep.
- Bank Safe Cash shows Net Worth change `2 x floor(0.75 x amount) - amount` (+$5,000 at $10,000).
- 0 crew: only Corner Shakedown unlocked (10% Clean / 65% Botched at attack 0).

## Next: M2-T3
Businesses & Raids tab (Claim Empty Business via `RiskPrepDialog` with `baseStreetCost = 1500`, Stage Rival Raid with the 2-week siege rows from `buildSiegeRows`) and Rivals & Spying (Wiretap Inspector, `devOmniscient`). Propose a plan first.

## Known issues / parked
- Spy/Snitch are 1-click; no confirmation dialog.
- Jobs run through `Run ($0)` show the result only in the status toast + wallet delta (no outcome modal).
- Sunday projection still excludes the random Heat >= 70 Police Raid.
- `devOmniscient` still unused. Engine event text still translated at display time only.
- Carried over: no AI defend verb, no CI, `npm run typecheck` checks nothing (`build` is the real check).

## Out of scope for this step
Claim/Raid UI, Wiretap drawer, Replay Scrubber, engine changes, Diplomacy, Lieutenants.
