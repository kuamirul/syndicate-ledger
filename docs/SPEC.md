# Syndicate Ledger — Master Game & Technical Specification (175h Build)

## 1. Core Concept & Run Rules
- **Format:** Single-player, turn-based economic crime strategy web game against **3 Symmetric Utility-AI Syndicates** (4 total syndicates per match).
- **Time Scale:** **1 Turn = 1 Week**. Maximum **28 Weeks** per run (`MAX_WEEKS`; was 52 before M2-T0 — see §2.3); **3 Action Points (AP)** per syndicate per week.
- **Win Conditions:**
  1. **Domination Win (Immediate at End of Week):** Own **>= 8 of 12 City Rackets** (>= 66% turf) while Heat `< 100%`.
  2. **Week 28 Kingpin Tiebreaker:** Survive end of Week 28 with the highest **Syndicate Valuation** = `(CleanCash * 2) + DirtyCash + Sum(OwnedRacketBaseValue)` among non-eliminated syndicates.
- **Lose / Elimination Conditions (Applies Equally to Player & AI):**
  1. **RICO Indictment:** End **2 consecutive weeks** at `Heat === 100`.
  2. **Insolvency / Mutiny:** `DirtyCash + CleanCash < 0` after Sunday Payroll + Turf Upkeep AND `OwnedRackets === 0` (if rackets > 0, forcibly liquidate lowest-value racket at 50% value to cover debt).
  3. **Wiped Out:** `CrewCount === 0`, `OwnedRackets === 0`, and total cash `< $1,000` (cannot afford Crew or Street Jobs).

---

## 2. Deterministic Weekly Turn Order
1. **Start of Week:** Roll weekly City Event modifier (every 4 weeks); tick active 2-turn Siege Telegraphs (resolve every siege whose resolve week has arrived, in declaration order — see §2.1); reset each living syndicate to `3 AP`, `0` Frames used and `0` Launders used.
2. **Player Action Phase:** Player spends up to `3 AP` (actions resolve immediately as clicked, or queued if 2-turn Siege: any `SEIZE` on a rival-owned racket).
3. **AI Action Phase:** Remaining living AI syndicates act in descending order of current Valuation, scoring and executing `1 AP` at a time via `applyAction()` until `0 AP` or pass.
4. **Sunday Ledger Phase (`advanceWeek`):**
   - Add `dirtyYield` from all owned rackets (+25% integer bonus if syndicate owns all 3 rackets in that District).
   - Deduct Crew Payroll (`CrewTotalCost`) + Turf Upkeep (§2.2) from `DirtyCash` first, overflow from `CleanCash`. Handle forced racket liquidation if `< $0`. Turf Upkeep is logged as its own ledger line.
   - Apply passive Heat changes: `-5` base decay + owned racket passive Heat + `max(0, (OwnedRackets - 3) * 5)` Empire Heat tax (§2.2).
   - Cool every Grudge: `grudge = floor(grudge * 0.90)` (§2.1).
   - Resolve High-Heat Hazard: if `Heat >= 70`, roll `25%` chance of Police Raid seizing `20%` of `DirtyCash` (`CleanCash` is immune).
   - Increment `ricoCounter` if `Heat === 100` (else reset `ricoCounter = 0`); check Win/Elimination flags; append immutable `WeekSnapshot` to history; advance `week += 1`.

### 2.1 Siege Telegraph, Action Caps & Grudge (W3-T8b — applies equally to Player & AI)
- **2-turn Siege:** a `SEIZE` on a racket owned by another syndicate is queued, not rolled. Assault cost + Prep and `1 AP` are paid when declared in week `W`; it resolves at the **start of week `W + 2`** (`SIEGE_LEAD_WEEKS = 2`), giving the defender one full action phase to react. The roll uses the attacker's crew at resolve time against the racket's defense at resolve time, through the same assault rules as an instant `SEIZE` (RNG is consumed only at resolve). A `SEIZE` on a neutral racket still resolves instantly.
- **Siege limits:** max `2` active outgoing sieges per syndicate (`MAX_OUTGOING_SIEGES`) and `1` per racket per attacker; a siege must resolve by week 28 (`MAX_WEEKS`), so the last siege can be declared in week 26.
- **Cancellation (no refund):** the siege is called off at resolve if the attacker is eliminated or already owns the racket. If the defender lost the racket meanwhile, it resolves against the racket as it stands.
- **Frame cap:** max `1` `BRIBE (Frame)` per syndicate per week (`MAX_FRAMES_PER_WEEK`); self-`BRIBE` is limited only by AP and cash.
- **Grudge:** stored Grudge is clamped to `0..100` on every increment, and cools every Sunday by `floor(grudge * 0.90)` (`GRUDGE_DECAY_PCT = 10`), so feuds fade unless renewed.

### 2.2 Progressive Empire Overhead (W3-T8b — applies equally to Player & AI)
- **Empire Heat:** `max(0, (OwnedRackets - 3) * 5)` per Sunday (was `* 2` in v0.1).
- **Turf Upkeep:** `600 * max(0, OwnedRackets - 3)^2` per Sunday, paid together with Crew Payroll through the same Dirty -> Clean -> forced-liquidation pipeline: 4 rackets `$600`, 5 `$2,400`, 6 `$5,400`, 7 `$9,600`, 8 `$15,000`.
- Three rackets stay overhead-free, so a small income engine is cheap while a sprawling empire must keep paying to hold its turf.

### 2.3 Pacing & 0-Crew Floor (M2-T0 — applies equally to Player & AI)
- **28-week run:** `MAX_WEEKS = 28`. The Kingpin valuation tiebreaker is checked at the end of week 28 (84 AP per syndicate instead of 156), removing the late-game "End Week / 3x Launder" autopilot.
- **Launder cap:** max `1` `LAUNDER` per syndicate per week (`MAX_LAUNDERS_PER_WEEK`, counter `laundersThisWeek`), still up to `$10,000` at a `25%` fee. A rejected launder does not use up the weekly launder.
- **0-Crew floor:** with `0` total crew, the only legal `EXTORT` is `shakedown` (Corner Shakedown, `ZERO_CREW_JOB_ID`); every other job and every `SEIZE` (neutral claim or rival siege) is rejected without spending AP or cash.
- **0-crew siege cancellation:** at Start-of-Week siege resolution, a siege whose attacker has `0` crew is called off (no refund, no RNG consumed) and logged as `called off (no crew left)`.
- The AI's candidate list mirrors all three rules (no 0-crew `SEIZE`, no non-shakedown 0-crew job, no second launder). It is stricter on one point by judgement, not by rule: it never runs the 0-crew Shakedown either, and rearms with `RECRUIT` instead.
- **Plain-English UI:** player-facing labels come from `src/ui/terms.ts` (e.g. `EXTORT` → "Run Cash Job", `LAUNDER` → "Bank Safe Cash (2x Score, 1/wk)", Heat / `ricoCounter` → "Police Heat" / "Arrest Strikes", Valuation → "Net Worth", Turf Upkeep → "Size Tax"). Engine identifiers are unchanged.
- **Guided Intro (UI only, default ON, toggle `[Guided Intro: ON]`):** weeks 1–2 *Build Your Base* (Run Cash Job, Claim Empty Business, Hire Crew); week 3 *Protect Profits* adds Bank Safe Cash and Pay Off Cops; week 4+ *Turf War* adds Stage Rival Raid, Spy on Rival and Snitch on Rival. The engine and AI have no week locks.

---

## 3. v0.1 Economy & Content Numbers

### 3.1 Starting Syndicate Baseline (Before Doctrine Modifiers)
- `DirtyCash`: `$6,000` | `CleanCash`: `$0` | `Heat`: `10` | `AP`: `3`
- Starting Crew: `4x Tier-1 Street Thugs` (`Attack: 12`, `Defense: 12`, `Payroll: $1,000/wk`)

### 3.2 Player & AI Verbs (1 AP Each)
1. **`EXTORT` (Street Job):** Pick 1 of 6 jobs; optional Prep spend; resolve 3-Tier Risk Roll for instant `DirtyCash`. With `0` crew only `shakedown` is legal (§2.3).
2. **`SEIZE` (Claim/Attack Racket):** Target neutral or rival racket (`+$1,500` base assault cost + optional Prep). Neutral uses Racket `baseDefense` and resolves instantly; Rival uses `RacketBaseDefense + AssignedGuardDefense` and is queued as a 2-turn Siege (§2.1). Requires at least `1` crew (§2.3). Win transfers ownership and inflicts casualties on Messy/Botched.
3. **`RECRUIT` (Hire Crew / Draft Lieutenant):** Hire up to 3 Crew units in one action OR draft 1 available Lieutenant from the shared city pool.
4. **`LAUNDER` (Dirty -> Clean):** Convert up to `$10,000 DirtyCash` into `CleanCash` at a `25%` fee (`$7,500 Clean`), `+0 Heat`; max `1` per week (§2.3).
5. **`BRIBE` (Cut Heat / Frame Rival):** Spend `$3,000 CleanCash` (or `$4,500 DirtyCash`) for `-22 Heat` on self OR `+12 Heat` on a target rival (max `1` Frame per week, §2.1).
6. **`WIRETAP / DIPLOMACY`:** Spend `$1,000` to reveal target rival's exact wallet + top-3 next-turn Utility AI intents for 3 weeks, OR propose Truce / Joint Siege (Milestone 3).

### 3.3 Crew Tiers & Shared Lieutenants
| Unit / Tier | Hire Cost | Atk / Def | Weekly Payroll | Notes |
|---|---|---|---|---|
| **T1 Street Thug** | `$800` | `3 / 3` | `$250` | Early game muscle; high casualty rate on Botched rolls. |
| **T2 Enforcer** | `$2,200` | `8 / 8` | `$600` | Unlocks at `>= 2` Rackets owned. |
| **T3 Hitman** | `$5,000` | `18 / 12` | `$1,300` | Unlocks at `>= 5` Rackets owned. |

- **6 Shared-Pool Lieutenants (Milestone 3 — Max 2 per Syndicate, Unique Citywide):**
  1. *Consigliere* (`$6k`, `$1k/wk`): Launder fee cut from `25%` to `12%`.
  2. *The Fixer* (`$6k`, `$1k/wk`): Prep costs `-40%`; `+8%` Clean Hit odds.
  3. *Police Captain* (`$7k`, `$1.2k/wk`): Passive `-6 Heat/wk`; immune to `>=70` Heat raids.
  4. *Chief Enforcer* (`$7k`, `$1.2k/wk`): All owned rackets gain `+10 Defense`.
  5. *The Mole* (`$5k`, `$900/wk`): Free permanent Wiretap visibility on all rivals.
  6. *Arsonist* (`$6.5k`, `$1.1k/wk`): Failed attacks against rival rackets still shut down target yield for 1 week.

### 3.4 Street Jobs (6 Faucets)
| ID | Name | Difficulty Def | Clean Payout | Messy Payout | Clean / Messy / Botched Heat |
|---|---|---|---|---|---|
| `shakedown` | Corner Shakedown | `6` | `$1,600` | `$1,000` | `+2 / +5 / +8` |
| `chop_shop` | Boost Luxury Cars | `12` | `$3,000` | `$1,800` | `+4 / +9 / +14` |
| `hijack` | Cargo Truck Hijack | `20` | `$5,200` | `$3,100` | `+6 / +13 / +20` |
| `heist` | Armored Van Heist | `32` | `$8,500` | `$4,800` | `+10 / +18 / +28` |
| `rig_fight` | Rig Title Bout | `16` | `$4,000` | `$2,400` | `+3 / +7 / +12` |
| `bank_vault` | Midnight Vault Job | `48` | `$14,000` | `$7,500` | `+15 / +25 / +38` |

### 3.5 Districts & 12 City Rackets (+25% District Monopoly Yield Bonus)
| District | Rackets (3 per District) | Base Value | Neutral Def | Dirty Yield/Wk | Passive Heat/Wk |
|---|---|---|---|---|---|
| **1. Docks** | *Fish Market, Union Pier, Bonded Warehouse* | `$4,000` | `10` | `$1,300` | `+1` |
| **2. Neon Strip** | *dive Bar, Velvet Club, Sportsbook Parlor* | `$7,500` | `18` | `$2,400` | `+2` |
| **3. Industrial** | *Scrap Yard, Trucking Depot, Chemical Plant* | `$12,000` | `28` | `$3,800` | `+3` |
| **4. Uptown** | *Grand Casino, Penthouse Lounge, City Hall Annex* | `$18,000` | `42` | `$5,800` | `+4` |

---

## 4. 3-Tier Risk Roll & Prep Formula
Let `R = AttackerAttack / max(1, TargetDefense)`:
- **Base Clean Hit %:** `clamp(round(40 * R), 10, 75)`
- **Base Botched %:** `clamp(round(35 / max(0.35, R)), 8, 65)`
- **Prep Tiers (DirtyCash spent upfront):**
  - `Tier 0 ($0)`: `+0% Clean`, `-0% Botched`
  - `Tier 1 ($1,200)`: `+12% Clean`, `-8% Botched`
  - `Tier 2 ($2,800)`: `+24% Clean`, `-16% Botched`
- **Final Clamped Probabilities:**
  - `P_Clean = clamp(BaseClean + PrepCleanBonus, 10, 88)`
  - `P_Botched = clamp(BaseBotched - PrepBotchReduction, 5, 100 - P_Clean)`
  - `P_Messy = 100 - P_Clean - P_Botched`
- **Outcome Consequences:**
  - `CLEAN`: Full reward/seizure, `0` Crew lost, Clean Heat delta.
  - `MESSY`: Messy reward (or racket seized damaged at 50% yield for 1 wk), lose `1` lowest-tier Crew unit, Messy Heat delta, `+15` Target Grudge (clamped to `100`).
  - `BOTCHED`: `$0` reward / seizure fails, lose `2` Crew units, Botched Heat delta, `+25` Target Grudge (clamped to `100`).

---

## 5. Symmetric Utility AI & Coalition Scoring

### 5.1 Action Scoring Formula
Every AI action generates a logged `DecisionTrace` using:
`TotalScore = (EV_Score * W.greed) + (Turf_Score * W.aggression) - (HeatRisk_Score * W.caution) + (Grudge_Score * W.revenge) + EmergencyModifiers + CoalitionBonus`

- **Hard Survival Overrides (`EmergencyModifiers`):**
  - If `Heat >= 80`: `BRIBE` receives `+75` emergency utility.
  - If projected Sunday cash `< Payroll`: `EXTORT` (highest EV > 60% win job) receives `+65` utility; `RECRUIT` is clamped to `-999`.
- **Anti-Leader Coalition (`CoalitionBonus` — Milestone 3):**
  - Whenever any syndicate holds `>= 5 Rackets`, all other AI syndicates apply `+40` utility to hostile actions targeting the leader and `+35` utility to accepting Truces with fellow trailing syndicates.

### 5.2 AI Archetype Weight Vectors (`0.5` to `2.0`)
| Archetype | `greed` | `aggression` | `caution` | `revenge` | Signature Behavior |
|---|---|---|---|---|---|
| **The Warlord** | `0.9` | `1.4` | `1.0` | `1.5` | Heavy Crew recruitment; rushes rival turf early. (W3-T8b balance: was `1.8 / 0.6`; still the highest aggression and lowest caution.) |
| **The Banker** | `1.8` | `0.7` | `1.6` | `0.6` | Maximizes CleanCash laundering & Uptown/Week-28 valuation. |
| **The Rat** | `1.1` | `1.0` | `1.5` | `1.4` | Spams Bribe/Frame to push rivals into `100%` RICO indictment. |
| **The Opportunist** | `1.4` | `1.3` | `1.1` | `0.8` | Strikes weakened rivals right after they suffer Botched rolls. |
| **The Turtle** | `1.3` | `0.6` | `1.8` | `1.7` | Locks 1 District monopoly with heavy defense; brutal if attacked. |

---

## 6. Target Repository Architecture
- `/src/engine/` — Pure TS simulation (`types.ts`, `rng.ts`, `risk.ts`, `reducer.ts`, `ai.ts`, `diplomacy.ts`). Zero UI imports.
- `/src/data/` — Static JSON + `zod` schemas (`rackets.json`, `jobs.json`, `archetypes.json`, `events.json`, `barks.json`).
- `/src/store/` — `Zustand` store + `localStorage` persistence + seed import/export.
- `/src/ui/` — Greybox tables (M1) -> `shadcn/ui` 4-Tab Ledger & `Recharts` Replay Scrubber (M2–M4).
- `/scripts/sim.ts` — Headless Node/Vitest Monte Carlo simulator (`npm run sim -- --runs=1000`).

---

## 7. Milestone & Task ID Roadmap (175 Hours)

### Milestone 1: Greybox Prototype (Weeks 1–3 | 30h)
- **`W1-T1` (2h):** Init Vite + React + strict TS + Vitest + ESLint; configure static build & CI test script.
- **`W1-T2` (3h):** Build `/src/engine/types.ts`, `/src/engine/rng.ts` (`mulberry32`), and `/src/data/` Zod-validated JSON configs (Jobs, Rackets, Archetypes).
- **`W1-T3` (3h):** Build `/src/engine/reducer.ts` weekly turn flow (`applyAction`, Sunday payroll, forced liquidation, Heat tax/raid, RICO/Win checks, `WeekSnapshot` history).
- **`W1-T4` (2h):** Build `/src/engine/risk.ts` 3-Tier Risk Resolver + Prep modifier math + 10,000-roll distribution unit test.
- **`W2-T5` (4h):** Build `/src/engine/ai.ts` Symmetric Utility AI v1 + `DecisionTrace` logger.
- **`W2-T6` (3h):** Build `/scripts/sim.ts` CLI runner (`npm run sim`) printing archetype win rates, avg game length, and elimination reasons across 1,000 games in `< 2s`.
- **`W2-T7` (3h):** Build unstyled HTML Greybox UI in `/src/ui/GreyboxApp.tsx` (Player dashboard, Rackets table, live Roll `%` preview, End Week, raw AI DecisionTrace viewer).
- **`W3-T8` (10h):** Prototype balance pass + 2-turn AI Siege telegraph state (`M1 Exit Gate`: `< 5%` AI insolvency rate, all archetypes `12%–32%` win rate in 4-way sims).
  - **M1 Exit Gate as measured (`npm run sim`, 1,000 games per seed block, seeds `1`, `5001`, `20001`, `9999`):**
    - Insolvency `< 5.0%` of all syndicate seats; RICO eliminations low.
    - Every archetype's win rate within `12.0%–32.0%` on the 4-seed aggregate (`n = 3,200` appearances), and `<= 33.0%` on any single seed block (`n = 800`, `1σ ≈ 1.6%` sampling noise around the `25%` baseline).
    - Domination share `8.0%–80.0%` of games; average game length `28–52` weeks.
    - Sim speed: `<= 12.0 s` per 1,000 games and `<= 0.25 ms` per game-week.

### Milestone 2: Vertical Slice (Weeks 4–6)
- **`M2-T0` (pre-UI fixes):** 0-Crew floor, 28-week run, 1x/week Launder cap (§2.3), `src/ui/terms.ts` plain-English labels and UI-only Guided Intro.
  - **Balance gate for 28-week runs (replaces the M1 numbers; `npm run sim`, 1,000 games per seed block, seeds `1`, `5001`, `20001`, `9999`, run sequentially):**
    - Insolvency `< 5.0%` of all syndicate seats; RICO eliminations low.
    - Every archetype's win rate within `12.0%–32.0%` on the 4-seed aggregate (`n = 3,200`), and `<= 33.0%` on any single seed block.
    - Domination share `3.0%–75.0%` of games (in a 28-week sprint Domination is a rare early blowout valve; most games go to the Week-28 Net Worth count).
    - Average game length `20–28` weeks.
    - Sim speed: `< 7.0 s` per 1,000 games and `<= 0.25 ms` per game-week.

### Milestones 2–5 Summary (Weeks 4–18 | 145h)
- **M2 Vertical Slice (`W4–W6`, 30h):** `shadcn/ui` 4-tab dark `Zinc` layout, Wiretap Inspector drawer, Prep odds modal.
- **M3 Alpha (`W7–W11`, 50h):** Symmetric Diplomacy (Truces, Tribute, Betrayal EV), 6 Shared Lieutenants draft, Anti-Leader AI Coalitions, `localStorage` save/migration.
- **M4 Beta (`W12–W15`, 40h):** 28-week `Recharts` Replay Scrubber, 4 Starting Doctrines, 12 City Events, 120 static barks, `Howler.js` CC0 SFX, interactive Week-1 tutorial.
- **M5 Release (`W16–W18`, 25h):** `?seed=` Daily Challenge URLs, in-app "How the AI Works" engineering modal, mobile-web layout polish, Cloudflare/Vercel production release.
