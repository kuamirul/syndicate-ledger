# Handoff — Step 6: after W3-T8b (M1 Exit Gate closed) → Milestone 2

**Read first:** `AGENTS.md`, `docs/SPEC.md` (§2.1 Siege/caps/grudge, §2.2 Empire Overhead, §5.2 weights, §7 M1 gate), this note.
**Branch:** `claude/cool-rubin-nygntd-t8b` (W3-T8b), on top of merged W3-T8a (PR #9).

## State
- `npm test`: 166 tests, all green. `npm run lint`, `npm run typecheck` and `npm run build` are clean (`tsc -b` inside `build` is the real typecheck).
- Bundle ≈ 100.6 KB gzipped (budget 250 KB).
- `npm run sim`: ≈ 9.1–10.1 s per 1,000 games, 0.18–0.20 ms per game-week. Budget: ≤ 12.0 s and ≤ 0.25 ms per game-week (sim prints both; warns over budget).
- **M1 Exit Gate: PASSED** (rule in SPEC §7).

### Final 4-seed telemetry (1,000 games per seed block)

| Seed | Warlord | Banker | Rat | Opportunist | Turtle | Domination share | Avg length | Insolvent seats | Wiped seats | RICO | Sim |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 32.6 | 25.8 | 17.0 | 25.3 | 24.4 | 11.2% | 49.8 wk | 0.8% | 1.1% | 8 | 9.1 s |
| 5001 | 32.3 | 26.9 | 19.4 | 27.1 | 19.4 | 10.9% | 49.8 wk | 1.0% | 1.0% | 7 | 10.1 s |
| 20001 | 31.3 | 27.0 | 17.6 | 27.3 | 21.9 | 9.3% | 50.1 wk | 1.1% | 1.1% | 4 | 9.3 s |
| 9999 | 30.5 | 27.9 | 21.6 | 25.3 | 19.8 | 9.9% | 50.0 wk | 0.8% | 0.9% | 8 | 9.4 s |
| **Aggregate (n = 3,200)** | **31.66** | **26.88** | **18.91** | **26.22** | **21.34** | 10.3% | | | | | |

Gate rule used (approved): aggregate within 12.0–32.0% and every single seed ≤ 33.0% (n = 800 per seed, 1σ ≈ 1.6%). The Warlord's single-seed 32.6% and 32.3% are inside that noise allowance. The strict per-seed 32.0% ceiling was missed by every candidate tried (1B-a, 1B-b, 1B-c), so the fallback rule applied. 1B-a was picked over 1B-c for its healthier domination share (10.3% vs 9.7%) and tighter spread around 25% (RMS 4.47 vs 4.59).

For comparison, the T8a baseline (seed 1) had 16-week games with 82% domination; T8b's first engine-only siege build had RICO ~500 and the Warlord at 46–48%.

## What landed in W3-T8b

**Rules** (`reducer.ts`, `constants.ts`; same for player and AI):
- `SEIZE` on a rival-owned racket is a **2-turn Siege**: paid now, resolved at the start of week + 2 through the shared `resolveAssault()`. RNG is used only at resolve. Neutral `SEIZE` stays instant.
- Siege limits: max 2 outgoing sieges, 1 per racket, must resolve by week 52. Cancelled without refund if the attacker is eliminated or already owns the racket.
- Max 1 `BRIBE (Frame)` per syndicate per week (`framesThisWeek`, new `SyndicateState` field, reset with AP).
- Grudge clamped to 0..100 (`addGrudge`); cools every Sunday by `floor(g × 0.9)`.
- **Progressive Empire Overhead:** Empire Heat `(N − 3) × 5`; Turf Upkeep `600 × max(0, N − 3)²` paid with Crew Payroll (Dirty → Clean → forced liquidation) and logged as its own ledger line.
- Domination timing unchanged (immediate at end of week); the 2-Sunday hold variants were prototyped and rejected.

**AI scoring** (`ai.ts`, no rule exemptions):
- No duplicate or over-cap siege candidates; no frame candidate once the weekly frame is used, or against a rival at Heat 100. Frames get −200 while own Heat ≥ 75.
- Grudge sub-scores capped at 100.
- RICO override also fires on one strike + projected Heat ≥ 65, or projected Heat + likely incoming frames ≥ 100 (+12 per motivated rival that can still frame, capped at +24).
- SEIZE EV subtracts the extra Turf Upkeep; heat risk adds the +5 empire heat; the liquidity guard covers the upkeep step; the context payroll includes current upkeep.
- An upkeep-free racket (post-seize ≤ 3) is valued over `min(8, remaining weeks)` instead of 4.
- Near-domination bonus is +20, and only when the SEIZE's EV after upkeep is ≥ 0 (was a flat +60).
- RECRUIT rearm: +40 for a weak syndicate (attack < 12) while a ≥ 5-racket leader exists; +25 at 0 crew.
- Banker's +20 launder bonus only from 3 owned rackets.
- Perf, outcome-neutral: memoised `bestJobEV(attack)`; the +65 emergency job is computed only in a payroll emergency.

**Balance numbers changed (called out):**
- `archetypes.json` Warlord: `aggression 1.8 → 1.4`, `caution 0.6 → 1.0` (still #1 most aggressive and #1 least cautious).
- Empire Heat per racket `2 → 5`; new Turf Upkeep (`TURF_UPKEEP_BASE = 600`).
- New rule constants: `SIEGE_LEAD_WEEKS = 2`, `MAX_OUTGOING_SIEGES = 2`, `MAX_FRAMES_PER_WEEK = 1`, `GRUDGE_MAX = 100`, `GRUDGE_DECAY_PCT = 10`, `EMPIRE_FREE_RACKETS = 3`, `EMPIRE_HEAT_PER_RACKET = 5`, `MAX_WEEKS = 52`.
- New AI constants: `AI_FRAME_SELF_HEAT = 75`, `AI_FRAME_SELF_HEAT_PENALTY = 200`, `AI_RICO_STRIKE_HEAT = 65`, `AI_FRAME_THREAT_GRUDGE = 35`, `AI_INCOMING_FRAME_HEAT_CAP = 24`, `AI_WEAK_ATTACK = 12`, `AI_LEADER_REARM_BONUS = 40`, `AI_ZERO_CREW_REARM_BONUS = 25`, `AI_LONG_YIELD_WEEKS = 8`, `AI_NEAR_DOMINATION_BONUS = 20`.
- No `jobs.json`, `rackets.json` or `crew.json` values changed.

**Existing tests changed (called out):**
- `data.test.ts`: Warlord weight vector updated (approved).
- `ai.test.ts` "does NOT apply +75 to frame-rival BRIBE even at high heat": now expects `−AI_FRAME_SELF_HEAT_PENALTY`, still asserts the +75 never applies (approved).
- `ai.test.ts` "Banker should prefer LAUNDER when accumulating dirty cash": same scenario and first assertion; the ranking assertion now expects `SEIZE` (income engine before laundering, approved change). A new test pins the +20 bonus at ≥ 3 rackets. Tried giving the Banker 3 rackets and an established crew instead; it then preferred RECRUIT or a 4th racket, so the old ranking claim no longer holds in any natural setup.

**New tests:** `siege.test.ts` (18 cases), 7 AI cases in `ai.test.ts`, view-model, reducer-message and render checks.

**UI (greybox):**
- `[Active Sieges]` table: sieges against your turf and your own always shown; rival-vs-rival only while wiretapping either side, or with `[DEV] show all sieges`.
- Dashboard Turf upkeep column and a "Your Sunday bill: Crew Payroll + Turf Upkeep" line.
- Rival-racket buttons read "Declare siege (…, resolves wk N)" / "Siege underway".
- Verified in Chromium: siege declared → "queued as siege — resolves at the start of week 4", table row shown, no console errors.

## Next task: Milestone 2 — Vertical Slice (W4–W6)
Per SPEC §7: `shadcn/ui` 4-tab dark Zinc layout, Wiretap Inspector drawer, Prep odds modal. Task IDs for M2 aren't broken down in the SPEC yet: start by proposing the W4 task list and a file-by-file plan, then wait for approval. Styling and Tailwind are allowed from M2 onward (AGENTS §3).

## Known issues / parked
- **`calculateSyndicateDefense` (CrewDefense) is unused in combat.** Rival defense is `baseDefense + assignedGuards`, and guards are never set. Parked for Milestone 3 (defense/guards design).
- **§4 risk floors** (clean ≥ 10%, botched ≤ 65%) make attack nearly irrelevant against hard targets; a human can still run 0-crew jobs (the AI avoids them). Needs a SPEC decision.
- Warlord sits near the ceiling (aggregate 31.7%, worst seed 32.6%). Re-run the 4-seed gate after any AI or economy change.
- Domination ends ~10% of games; ~90% go to week-52 valuation. Revisit with Diplomacy/coalitions in M3.
- AI defenders don't react to incoming sieges (no defend verb yet).
- Tie-breaks use `localeCompare` (may differ across ICU builds); `npm run typecheck` checks nothing (solution tsconfig); no CI workflow; `runWeek` not built.

## Out of scope for this step
Diplomacy, Lieutenants, Replay Scrubber, `?seed=` URLs, guards/defend verb, §4 formula changes.
