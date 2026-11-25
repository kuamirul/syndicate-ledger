# Handoff — M3-T1 Crew Defense complete → M3-T2

**Read first:** `AGENTS.md`, `docs/SPEC.md` (§2.1, §2.4 new, §3.2, §4, §5.1), `docs/HANDOFF-m2.md`, this note.

## State
- `npm test`: **366 tests green** (25 files; M3-T1 added 38, including the new `src/engine/crewDefense.test.ts`). `npm run lint`, `npm run typecheck`, `npm run build` clean.
- Bundle (gzipped, Vite report): **173.67 KB JS + 5.90 KB CSS = 179.57 KB** (was 177.64 KB), budget 250 KB.
- Engine purity: no `Math.random` / `Date.now` / `randomUUID` / React / DOM in `/src/engine/`. Every new value is an integer.
- Headless Chromium audit at **1280x720 and 1024x768**: 40/40 checks. Zero console errors and `scrollWidth <= innerWidth` on all four tabs and both raid dialogs. Also checks the alert breakdown, the +1 Thug preview, the Spied and Un-Spied dialogs, that `Hire Crew to Defend →` opens Operations, and the translated Weekly Log line. Screenshots: `docs/screenshots/m3-t1-*.png`.

## Balance gate (`npm run sim`, 1,000 games per seed, run one after another on an idle machine)
| Seed | Warlord | Banker | Rat | Opportunist | Turtle | Domination | Avg len | Insolvent seats | RICO | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 28.8 | 28.3 | 18.8 | 26.0 | 23.3 | 3.6% | 27.8 | 0.6% | 3 | 4.53 s |
| 5001 | 31.4 | 27.5 | 19.6 | 25.3 | 21.3 | 2.9% | 27.8 | 0.8% | 4 | 5.00 s |
| 20001 | 31.9 | 25.1 | 19.6 | 26.6 | 21.8 | 4.0% | 27.8 | 0.7% | 3 | 5.15 s |
| 9999 | 29.1 | 31.0 | 19.8 | 24.9 | 20.3 | 3.9% | 27.8 | 0.3% | 2 | 5.34 s |
| **Aggregate (n = 3,200)** | **30.3** | **28.0** | **19.4** | **25.7** | **21.6** | **3.60%** | **27.8** | **0.61%** | 12 | max 5.34 s |

All checks pass: every archetype is within 12–32% on the aggregate and ≤ 33% on every seed, Domination is within 3–75% on the aggregate, average length is within 20–28, insolvency is below 5%, and every seed runs under 7 s.
Pre-M3-T1 baseline: Warlord 32.8% on seed 1, Domination 3.5–4.9%.

### Prototype comparison (scratch copy, aggregate over the 4 seeds)
| Variant | Warlord agg (max seed) | Domination | Verdict |
|---|---|---|---|
| A: `base + min(24, CrewDef)`, bonus 30 | 28.5 (30.1) | 3.00% (2 seeds < 3) | on the floor, rejected |
| A cap 12 | 31.2 (33.1) | 3.88% | fails the 33% seed limit |
| A cap 18 | 30.5 (33.5) | 3.27% | fails the 33% seed limit |
| B: Garrison Split, bonus 30 | 32.7 (33.8) | 4.25% | fails |
| **B, bonus 15 (shipped)** | **30.3 (31.9)** | **3.60%** | pass |
| B, bonus 10 / 20 | 31.1 / 30.2 | 3.88% / 3.42% | pass (a stable plateau) |

## What landed
- **Engine (`reducer.ts`, `crew.ts`, `constants.ts`):** `garrisonDefense(crewDef, owned) = floor(crewDef / max(1, owned))` and `racketDefenseBreakdown(state, racketId)` (base + garrison + legacy `assignedGuards`). `resolveAssault` uses it for every assault, so neutral claims have 0 guards and stay unchanged. On a CLEAN or MESSY takeover of a rival's business, the defender loses `DEFENDER_TAKEOVER_CASUALTIES = 1` crew, lowest tier first, never below 0. The loss is logged as `; defender lost N crew` and returned as `ActionResult.defenderCasualtiesLost`.
- **AI (`ai.ts`):**
  - `estimateRaidDefense()` / `hasWiretap()`: raid scoring uses the exact guards only for a wiretapped owner. Otherwise it uses the public estimate `garrisonDefense(12, owner's public business count)`.
  - The Opportunist's weak-rival bonus now also requires a wiretap; before this it read private crew directly.
  - `RECRUIT` gets `+round(15 × caution)` while a raid targets one of the AI's businesses, but only if the hire raises its per-business guards.
  - The SEIZE reasoning now prints `Def X = base Y + guards Z (spied)` or `guards ~Z (est.)`.
- **UI:**
  - `siegeModel.visibleRaidDefense()` gives exact guards for your own, neutral, Spied or DEV-visible businesses, and base defense only (`guardsHidden`) otherwise.
  - `turfModel` cards carry `baseDefense`, `guardDefense` (`null` while hidden) and `fogHint`, and their odds use the visible defense.
  - `selectIncomingRaidAlerts()` builds the "+1 Thug" Defense Preview; the hire button's state comes from a dry run of `applyAction`.
  - `TurfTab` has the new raid banner (breakdown, preview, `Hire Crew to Defend →`), an amber `Guards ???` marker on outgoing raids and fog hints on cards.
  - `RiskPrepDialog` takes a `defenseNote` prop (breakdown, then either the fog hint or "Spied: exact guards included").
  - The greybox `viewModel` mirrors the exact engine defense.
- **Copy:** `terms.ts` has `DEFENSE_TERMS`, and `plainEventText` turns `; defender lost N crew` into `; the owner lost N guard(s)`. `archetypes.json`: Banker copy `Week-52` → `Week-28`, with a data test that holds every `Week-N` to `MAX_WEEKS`. SPEC adds §2.4 and updates §3.2, §4, §5.1 and §7.

## Test changes worth reviewing (rule changes, no assertion loosened)
- `siegeModel.test.ts` "attacker odds follow the attacker crew": the expected defense is now `base + 12`, because the player's 4 Thugs guard its only business.
- `viewModel.test.ts` rollPreview SEIZE: expected `base + 12 + 9` (garrison + legacy guards).
- `ai.test.ts` Opportunist bonus: the Opportunist now holds a wiretap on its target, and the `> 40` assertion is unchanged. A new test proves the bonus is 0 without a wiretap.

## Known issues / decisions
- **Incoming raid odds still use the attacker's exact current crew** without a Spy. This is the existing M2-T3 rule, pinned by `siegeModel.test.ts`. It leaks a little about the attacker's private attack. Consider fogging it (with a public attack estimate) in a later task.
- The greybox view (`?greybox=1`) shows exact engine defense for every business, as a dev view.
- `assignedGuards` is still never set; it only adds to the garrison. No "assign guards to one business" verb exists.
- DecisionTrace has no new structured fields; the defense details are in `reasoning` only.
- Carried over from M2: no CI; the Sunday projection excludes Police Raids; Spy and Snitch have no confirmation step.

## Next: M3-T2 (propose a plan first)
Symmetric Diplomacy and Betrayal (Truces, Tribute, Betrayal EV, Anti-Leader coalition scoring) through `applyAction`, re-gated with the same 4-seed table. After that: the Lieutenants draft and the `localStorage` save.

## Out of scope for M3-T1
Diplomacy, Lieutenants, save/migration, Replay Scrubber/Recharts, Doctrines, City Events, a guard-assignment verb.
