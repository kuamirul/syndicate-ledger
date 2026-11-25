# Handoff — Milestone 2 complete (after M2-T4) → Milestone 3 Alpha

**Read first:** `AGENTS.md`, `docs/SPEC.md` (§2.1, §2.3, §3.2, §5.1), `docs/HANDOFF-step10.md`, this note.

## State
- `npm test`: **328 tests green** (24 files). M2-T4 added 38: `matchSummary` 13, `actionGuard` 7, `hotkeyGuard` 9, `endWeekGuard` (store) 9. `npm run lint`, `npm run typecheck`, `npm run build` clean.
- Bundle (gzipped): **171.81 KB JS + 5.83 KB CSS = 177.64 KB**, budget 250 KB.
- `/src/engine/` and `/src/data/`: **zero diff** in this step; no existing assertion changed.
- Headless Chromium audit at **1280x720 and 1024x768**: 61/61 checks, zero console errors, `scrollWidth <= innerWidth` on all four tabs, the AI Decision Sheet and the summary dialog; `?greybox=1` renders. Screenshots: `docs/screenshots/m2-t4-*.png`.

## What landed in M2-T4
- **Post-run summary** (`matchSummary.ts`, `MatchSummaryDialog.tsx`): opens automatically when the run is over for the player (`isGameOver` or the player is eliminated). Full 4-syndicate standings (fog lifted), outcome badges, one-sentence **Decisive Factor** (exact Net Worth margin, whether Safe Cash x2 decided it, the 8+ Businesses takeover week, or the week and cause of elimination). Actions: `New Run (Random Seed)`, `Retry Exact Seed (#X)`, `Inspect Final Board`. `View Final Results` in the top bar reopens it.
- **Early elimination:** the engine keeps simulating until `isGameOver`, so a player who falls early gets the Defeat summary at once, all actions lock ("Match Complete") and End Week is disabled, preserving the board of the elimination week.
- **Unspent-Action guard** (`actionGuard.ts`, `UnspentActionDialog.tsx`): `hasAffordableUnlockedAction` is a dry run of the engine's own `applyAction` over a candidate list, filtered by the Guided Intro verb locks. "Don't warn again" lasts for the session only (no persistence).
- **Safe hotkeys** (`hotkeyGuard.ts`, `useLedgerHotkeys.ts`): `1`-`4` switch tabs, `Space` runs End Week through the guard. Ignored with Ctrl/Meta/Alt, on key repeat, in INPUT/TEXTAREA/SELECT/contenteditable, while any dialog / sheet / popover is open, and once the run is over. `Space` is also left alone when focus is on a BUTTON, A, `[role=tab|switch|checkbox|button]` so a focused control never double-fires, except a *disabled* button (after the last Action Point is spent, the clicked button is disabled and Space must still end the week).
- **Store** (`gameStore.ts`): `summaryDismissed`, `skipUnspentApWarning`, `endWeekPromptOpen`, `requestEndWeek`, `confirmEndWeek`, `cancelEndWeek`, `startRandomGame`, `dismissSummary`, `reopenSummary`, `randomSeed()` (UI layer only). `endWeek()` is now a no-op once the run is over.
- `terms.ts` additions only: `MATCH_OUTCOME_LABELS`, `SUMMARY_TERMS`, `GUARD_TERMS`, `HOTKEY_TERMS`, `SPEND_TERMS.matchComplete`. The summary text is tested to contain no raw `RICO`, `racket`, `siege` or `launder`.
- `noActionReason()` in `operationsModel.ts`: disabled buttons say "Match Complete" instead of "No actions left" once the run is over.

## Rules and gotchas worth knowing
- Corner Shakedown at prep $0 is legal even with 0 crew and $0 cash, so during a live turn `hasAffordableUnlockedAction` is effectively `actionPoints > 0`. The tests assert this; the guard therefore prompts on any turn with Action Points left unless the player opted out.
- **Focus on dialog open matters.** The Space press that ends the final week must not be released onto a focused button of the dialog it just opened. The summary dialog focuses its own container; the guard dialog focuses `Keep Playing` (a leaked key-up there cancels instead of confirming). A real-browser regression found this; there is no unit test for it.
- `Space` on a focused *enabled* button (for example the `Boost Odds…` button that regains focus after its dialog closes) activates that button natively and does not end the week. This follows the approved focus rule.
- The tab labels already read `[1]`..`[4]`, so they serve as the keycaps; only End Week got an extra `Space` keycap.
- A `New Run` seed is drawn with `Math.random()` in the store (UI layer, allowed); the engine still never draws unseeded randomness.
- When the player is eliminated before the match ends, the summary shows standings as of that week, not a final result.

## Known issues / parked
- **Stale copy for M3:** `src/data/archetypes.json` still says "Week-52" in The Banker's `signatureBehavior`. It lives in `/src/data/`, which this step left untouched; update it (and any test that pins it) in M3.
- Spy and Snitch are one-click with no confirmation; jobs and claims show results only in the toast and wallet delta.
- The Sunday projection excludes the random Heat >= 70 Police Raid.
- No defend verb exists: `assignedGuards` is never set, so crew does not defend a business (see `HANDOFF-step10.md`).
- Last turn's rejected AI alternatives are not stored in `DecisionTrace`; the Decision Sheet shows a live top 3 instead.
- No CI.

## Next: Milestone 3 Alpha (queued; propose a plan first)
1. **`CrewDefense` combat integration** (engine): let crew and `assignedGuards` defend businesses; needs the player verb, the AI scoring, `DecisionTrace` fields and a sim re-balance against the M2 gate.
2. **Symmetric Diplomacy / Betrayal** (Truces, Tribute, Betrayal EV, Anti-Leader coalition scoring) through `applyAction` for player and AI alike.
3. **6 Shared Lieutenants draft** (max 2 per syndicate, unique citywide).
4. **`localStorage` save and migration** (store layer; keep the engine free of `localStorage`).
5. Update the stale "Week-52" archetype copy.

## Out of scope for M2
Replay Scrubber and Recharts (M4), Doctrines, City Events, barks, SFX, `?seed=` Daily Challenge URLs, mobile polish (M5), and any engine change.
