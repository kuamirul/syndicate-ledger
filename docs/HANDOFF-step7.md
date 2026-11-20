# Handoff — Step 7: after M2-T0 (pacing + plain-English greybox) → M2-T1 (shadcn/ui ledger)

**Read first:** `AGENTS.md`, `docs/SPEC.md` (§2.3 Pacing & 0-Crew Floor, §7 Milestone 2 gate), this note.
**Branch:** `m2-t0-pacing-ux`, on top of merged W3-T8b (PR #10).

## State
- `npm test`: 188 tests, all green. `npm run lint`, `npm run build` (`tsc -b` = real typecheck) clean; `npm run typecheck` clean.
- Bundle ≈ 103.2 KB gzipped (budget 250 KB).
- `npm run sim`: 5.1–5.5 s per 1,000 games run sequentially, 0.18–0.20 ms per game-week (budget `< 7.0 s`, sim warns over budget).
- **M2-T0 balance gate (SPEC §7): PASSED.**

### Final 4-seed telemetry (branch code, 1,000 games per seed, run sequentially)

| Seed | Warlord | Banker | Rat | Opportunist | Turtle | Domination | Avg length | Insolvent seats | RICO | Sim |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 32.8 | 26.1 | 17.0 | 26.9 | 22.3 | 4.9% | 27.6 wk | 0.7% | 4 | 5.5 s |
| 5001 | 29.9 | 28.4 | 19.0 | 26.6 | 21.1 | 3.5% | 27.8 wk | 0.8% | 1 | 5.1 s |
| 20001 | 30.3 | 24.6 | 20.6 | 28.9 | 20.6 | 3.6% | 27.7 wk | 0.8% | 2 | 5.1 s |
| 9999 | 27.9 | 27.6 | 22.1 | 28.5 | 18.9 | 4.4% | 27.7 wk | 0.6% | 5 | 5.5 s |
| **Aggregate (n = 3,200)** | **30.19** | **26.69** | **19.69** | **27.72** | **20.72** | 4.1% | | | | |

Identical to the scratch Variant A run. Variant B (`LAUNDER_MAX = $15,000`) was rejected: domination 2.6%, Opportunist 31.8% aggregate / 32.9% worst seed, Banker squeezed to 23.9%.
Domination fell from ~11% (52 wk) to ~4% because the median 52-week domination happened in week 33; the gate floor was lowered to 3.0% (approved).

## What landed in M2-T0
**Rules** (`constants.ts`, `reducer.ts`, `types.ts`; same for player and AI):
- `MAX_WEEKS 52 → 28`; Kingpin valuation at the end of week 28; last siege declarable in week 26.
- `MAX_LAUNDERS_PER_WEEK = 1` via new `SyndicateState.laundersThisWeek` (reset with AP/frames). `LAUNDER_MAX` stays `$10,000`.
- 0-Crew floor: with 0 crew only `ZERO_CREW_JOB_ID = 'shakedown'` is a legal `EXTORT`; every `SEIZE` is rejected (no AP/cash spent).
- A queued siege whose attacker has 0 crew at Start-of-Week is called off (no refund, no RNG) — event `called off (no crew left)`.

**AI** (`ai.ts`): no LAUNDER candidate once the weekly launder is used. The AI already offered no EXTORT/SEIZE at 0 crew; it keeps that (stricter than the rule: it never runs the legal 0-crew Shakedown). This kept the existing test "generates no EXTORT or SEIZE for a syndicate with 0 crew" untouched.

**Sim** (`scripts/`): budget 7,000 ms per 1,000 games; safety loop guard 40 weeks.

**UI (greybox, UI-only):**
- `src/ui/terms.ts`: plain-English `VERBS`, `TERMS`, `PREP_TERM`, `GOAL_TEXT`, `OUTCOME_LABELS`, `arrestStrikesLabel()`, `plainStatusMessage()` (display-time translation of the status line). Ready for M2-T1 tooltips.
- `src/ui/guidedIntro.ts`: `guidedPhase(week)`, `verbLock(verb, week, on)`, `VERB_UNLOCK_WEEK`, `verbForAction()`.
- `UiState.guidedIntro` (default ON, kept across New game) + `SET_GUIDED_INTRO`; top-bar `[Guided Intro: ON]` checkbox, phase banner, `[Unlocks Week 3/4]` badges with disabled buttons. Nothing in `/src/engine/` knows about it.
- `GreyboxApp.tsx` relabelled: Street/Safe Cash, Police Heat, Arrest Strikes, Net Worth, Size Tax, Businesses, Rival Raids, "What do these words mean?" glossary; Bank/Snitch buttons show "Already … this week"; 0-crew hints.
- Verified in headless Chromium: Phase 1 → 2 → 3 banners, 2× "Unlocks Week 3" + 3× "Unlocks Week 4" on week 1, bank once then "Already banked this week", toggle OFF unlocks all on week 1, **0 console errors**.

**Existing tests changed (all only for `MAX_WEEKS`):** `siege.test.ts` late-siege test now uses `MAX_WEEKS - 1`; `reducer.test.ts` Kingpin test uses `MAX_WEEKS`; `simCore.test.ts` length bound `<= MAX_WEEKS` (tighter). No assertion loosened; no multi-launder test existed.

**New tests:** `src/engine/pacing.test.ts` (12: constants, 0-crew shakedown allowed / other jobs + both SEIZE kinds rejected for player & AI, AI candidates legal at 0 crew, 0-crew siege cancellation without RNG, launder cap + reset + failed launder doesn't count, AI launder candidates, week-27 no end / week-28 valuation end / last siege week), `src/ui/guidedIntro.test.ts` (9), one `gameReducer` toggle test, one App SSR test.

## Next task: M2-T1 — shadcn/ui 4-tab Zinc ledger
Propose the W4 task list + file-by-file plan first and wait for approval. Reuse `terms.ts` for labels/tooltips and `guidedIntro.ts` for locks; Tailwind/shadcn allowed from here (AGENTS §3).

## Known issues / parked
- Engine event strings and rejection reasons are still engine-worded (e.g. "siege", "racket", "RICO indictment" in Last-week events); only the status line is translated (`plainStatusMessage`). Move event text to structured events + `terms.ts` in M2-T1.
- `gameReducer` status message keeps engine verbs (pinned by existing tests); the UI translates at display time.
- AGENTS.md still says "52-week Replay Scrubber" (AGENTS §2); SPEC now says 28. Left for the owner to edit.
- Warlord worst seed 32.8% (aggregate 30.2%); re-run the 4-seed gate after any AI/economy change.
- Carried over: `calculateSyndicateDefense` unused in combat (M3), no AI defend verb, `localeCompare` tie-breaks, `npm run typecheck` checks nothing (solution tsconfig), no CI.

## Out of scope for this step
shadcn/ui, Tailwind, Diplomacy, Lieutenants, Replay Scrubber, guards/defend verb, §4 risk-formula changes.
