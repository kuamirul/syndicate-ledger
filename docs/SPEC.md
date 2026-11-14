# Syndicate Ledger — Master Game & Technical Specification (175h Build)

## 1. Core Concept & Run Rules
- **Format:** Single-player, turn-based economic crime strategy web game against **3 Symmetric Utility-AI Syndicates** (4 total syndicates per match).
- **Time Scale:** **1 Turn = 1 Week**. Maximum **52 Weeks** per run; **3 Action Points (AP)** per syndicate per week.
- **Win Conditions:**
  1. **Domination Win (Immediate at End of Week):** Own **>= 8 of 12 City Rackets** (>= 66% turf) while Heat `< 100%`.
  2. **Week 52 Kingpin Tiebreaker:** Survive end of Week 52 with the highest **Syndicate Valuation** = `(CleanCash * 2) + DirtyCash + Sum(OwnedRacketBaseValue)` among non-eliminated syndicates.
- **Lose / Elimination Conditions (Applies Equally to Player & AI):**
  1. **RICO Indictment:** End **2 consecutive weeks** at `Heat === 100`.
  2. **Insolvency / Mutiny:** `DirtyCash + CleanCash < 0` after Sunday Payroll AND `OwnedRackets === 0` (if rackets > 0, forcibly liquidate lowest-value racket at 50% value to cover debt).
  3. **Wiped Out:** `CrewCount === 0`, `OwnedRackets === 0`, and total cash `< $1,000` (cannot afford Crew or Street Jobs).

---

## 2. Deterministic Weekly Turn Order
1. **Start of Week:** Roll weekly City Event modifier (every 4 weeks); tick active 2-turn Siege Telegraphs; reset each living syndicate to `3 AP`.
2. **Player Action Phase:** Player spends up to `3 AP` (actions resolve immediately as clicked, or queued if 2-turn Siege).
3. **AI Action Phase:** Remaining living AI syndicates act in descending order of current Valuation, scoring and executing `1 AP` at a time via `applyAction()` until `0 AP` or pass.
4. **Sunday Ledger Phase (`advanceWeek`):**
   - Add `dirtyYield` from all owned rackets (+25% integer bonus if syndicate owns all 3 rackets in that District).
   - Deduct Crew Payroll (`CrewTotalCost`) from `DirtyCash` first, overflow from `CleanCash`. Handle forced racket liquidation if `< $0`.
   - Apply passive Heat changes: `-5` base decay + `max(0, (OwnedRackets - 3) * 2)` Empire Heat tax.
   - Resolve High-Heat Hazard: if `Heat >= 70`, roll `25%` chance of Police Raid seizing `20%` of `DirtyCash` (`CleanCash` is immune).
   - Increment `ricoCounter` if `Heat === 100` (else reset `ricoCounter = 0`); check Win/Elimination flags; append immutable `WeekSnapshot` to history; advance `week += 1`.

---

## 3. v0.1 Economy & Content Numbers

### 3.1 Starting Syndicate Baseline (Before Doctrine Modifiers)
- `DirtyCash`: `$6,000` | `CleanCash`: `$0` | `Heat`: `10` | `AP`: `3`
- Starting Crew: `4x Tier-1 Street Thugs` (`Attack: 12`, `Defense: 12`, `Payroll: $1,000/wk`)

### 3.2 Player & AI Verbs (1 AP Each)
1. **`EXTORT` (Street Job):** Pick 1 of 6 jobs; optional Prep spend; resolve 3-Tier Risk Roll for instant `DirtyCash`.
2. **`SEIZE` (Claim/Attack Racket):** Target neutral or rival racket (`+$1,500` base assault cost + optional Prep). Neutral uses Racket `baseDefense`; Rival uses `RacketBaseDefense + AssignedGuardDefense`. Win transfers ownership and inflicts casualties on Messy/Botched.
3. **`RECRUIT` (Hire Crew / Draft Lieutenant):** Hire up to 3 Crew units in one action OR draft 1 available Lieutenant from the shared city pool.
4. **`LAUNDER` (Dirty -> Clean):** Convert up to `$10,000 DirtyCash` into `CleanCash` at a `25%` fee (`$7,500 Clean`), `+0 Heat`.
5. **`BRIBE` (Cut Heat / Frame Rival):** Spend `$3,000 CleanCash` (or `$4,500 DirtyCash`) for `-22 Heat` on self OR `+12 Heat` on a target rival.
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
  - `MESSY`: Messy reward (or racket seized damaged at 50% yield for 1 wk), lose `1` lowest-tier Crew unit, Messy Heat delta, `+15` Target Grudge.
  - `BOTCHED`: `$0` reward / seizure fails, lose `2` Crew units, Botched Heat delta, `+25` Target Grudge.

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
| **The Warlord** | `0.9` | `1.8` | `0.6` | `1.5` | Heavy Crew recruitment; rushes rival turf early. |
| **The Banker** | `1.8` | `0.7` | `1.6` | `0.6` | Maximizes CleanCash laundering & Uptown/Week-52 valuation. |
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

### Milestones 2–5 Summary (Weeks 4–18 | 145h)
- **M2 Vertical Slice (`W4–W6`, 30h):** `shadcn/ui` 4-tab dark `Zinc` layout, Wiretap Inspector drawer, Prep odds modal.
- **M3 Alpha (`W7–W11`, 50h):** Symmetric Diplomacy (Truces, Tribute, Betrayal EV), 6 Shared Lieutenants draft, Anti-Leader AI Coalitions, `localStorage` save/migration.
- **M4 Beta (`W12–W15`, 40h):** 52-week `Recharts` Replay Scrubber, 4 Starting Doctrines, 12 City Events, 120 static barks, `Howler.js` CC0 SFX, interactive Week-1 tutorial.
- **M5 Release (`W16–W18`, 25h):** `?seed=` Daily Challenge URLs, in-app "How the AI Works" engineering modal, mobile-web layout polish, Cloudflare/Vercel production release.
