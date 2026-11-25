# Handoff — Step 10: after M2-T3 (Businesses & Raids, Rivals & Spying, AI Decision Sheet) → next M2 task

**Read first:** `AGENTS.md`, `docs/SPEC.md` (§2.1 sieges, §2.3, §3.2, §5.1), `docs/HANDOFF-step9.md`, this note.

## State
- `npm test`: 290 tests green (+35: 17 `turfModel`, 6 `siegeModel`, 12 `rivalsModel`). `npm run lint`, `npm run typecheck`, `npm run build` clean.
- Bundle: 167.6 KB gzipped JS (+ 5.7 KB CSS), budget 250 KB.
- 1280x720 headless Chromium: Tab [2] with an incoming raid, Tab [2] with `RiskPrepDialog` open on a rival business (queued-raid wording), Tab [3] with one spied and two redacted rivals, Tab [3] with `AiDecisionSheet` open. 0 console errors, no horizontal scroll. Screenshots: `docs/screenshots/m2-t3-*.png`.
- `/src/engine/` untouched (no edits, no UI/store imports); no existing assertion changed.

## What landed
- `src/ui/turfModel.ts` (pure): `selectDistrictCards`, `marginalImpact` (uses the engine's `calculateProjectedRacketYield`, `turfUpkeep` and Empire Heat step, so it cannot drift from `advanceWeek`), `turfDisabledReason`, `turfConsequences`. Every enabled action is tested against `applyAction`.
- `src/ui/siegeModel.ts` (pure): `selectVisibleSieges` with fog of war (incoming and own raids always visible; rival-vs-rival only with a Spy on the attacker or defender, or DEV) plus structured attacker odds and the `X / 2` slot count.
- `src/ui/rivalsModel.ts` (pure): `selectRivalIntel`. Private stats are `null` unless Spied or DEV, so the UI cannot leak them. Also `buildDecisionRow`, `plainActionLabel`.
- UI: `TurfTab`, `RivalsTab`, `AiDecisionSheet` (stock shadcn `Sheet`, new `Table`; no slide animation). `RiskPrepDialog` gained optional `confirmLabel` and `hideHeat` (existing callers unchanged).
- `terms.ts` additions only: `DISTRICT_NAMES`, `TURF_TERMS`, `RIVAL_TERMS`, `ARCHETYPE_TAGS`, `SCORE_COMPONENTS`.
- `npm run typecheck` now checks `tsconfig.app.json` and `tsconfig.node.json`. It previously ran `tsc --noEmit` against a root config with `files: []` and checked nothing.

## Rules worth knowing
- State field is `activeSieges` (not `pendingSieges`); the landing week is `resolveWeek`.
- **Crew does not defend a business.** Defense is `baseDefense + owner.assignedGuards`, and no player or AI verb sets `assignedGuards`. The Active Raids card therefore has no "Hire Crew to Defend" shortcut; it offers Spy / Snitch on the attacker instead.
- Stored `DecisionTrace` keeps only the chosen action. The Decision Sheet shows last turn's chosen actions from the log and a live "next-turn top 3" from the engine's `evaluateCandidateActions` (labelled "if the week ended now"). Last turn's rejected alternatives are not recoverable without an engine change.
- Score terms in a trace are raw; `TotalScore = round(EV×greed + Turf×aggression − HeatRisk×caution + Grudge×revenge + Emergency + Coalition)`. A `−999` Emergency is the liquidity clamp and forces the total to −999.
- Marginal impact assumes a Clean claim at full income; a Messy claim is damaged (half income) for one week.
- Guided Intro: claims open from Week 1; raids, Spy and Snitch unlock Week 4 (UI only).

## Known issues / parked
- `src/data/archetypes.json` still says "Week-52" in the Banker description (stale since M2-T0); it is outside this task.
- Spy and Snitch are one-click with no confirmation; jobs and claims show results only in the toast and wallet delta.
- Sunday projection still excludes the random Heat >= 70 Police Raid.
- No AI or player "defend" verb exists (see above); a defend verb would be an engine task.
- Carried over: no CI.

## Out of scope for this step
Replay Scrubber, Diplomacy, Lieutenants, guard assignment, any engine change, persistence (`localStorage`), Recharts.
