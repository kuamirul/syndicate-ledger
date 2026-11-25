// Pure view-model for the Operations tab (M2-T2). No React / store imports.
// Every number mirrors reducer.ts payment rules; applyAction stays the only legality authority and
// operationsModel.test.ts checks `affordable` against it.

import { CREW_TIERS, STREET_JOBS } from '../data';
import {
  BRIBE_CLEAN_COST,
  BRIBE_DIRTY_COST,
  BRIBE_FRAME_HEAT,
  BRIBE_SELF_HEAT,
  LAUNDER_FEE_PCT,
  LAUNDER_MAX,
  MAX_FRAMES_PER_WEEK,
  MAX_LAUNDERS_PER_WEEK,
  WIRETAP_COST,
  ZERO_CREW_JOB_ID,
} from '../engine/constants';
import { calculateTotalCrewCount } from '../engine/crew';
import { countOwnedRackets } from '../engine/reducer';
import { PREP_CONFIG } from '../engine/risk';
import type {
  CrewTierDef,
  CrewTierId,
  GameState,
  PrepTier,
  RiskOutcome,
  RiskProbabilities,
  StreetJobDef,
  SyndicateState,
} from '../engine/types';
import { selectSundayProjection } from '../store/selectors';
import { verbLock, type VerbLock } from './guidedIntro';
import { SPEND_TERMS } from './terms';
import { rollPreview } from './viewModel';

export const PREP_TIERS: readonly PrepTier[] = [0, 1, 2];

// ---------------------------------------------------------------------------------------------
// Spend safety
// ---------------------------------------------------------------------------------------------

export interface SpendSafety {
  /** Street and Safe Cash both cover their share (engine legality for the cash part). */
  affordable: boolean;
  leavesStreet: number;
  leavesSafe: number;
  /** Street + Safe after the spend, plus the projected Sunday net (less any added weekly payroll). */
  projectedPostSundayTotal: number;
  /** Post-Sunday total would be below $0 (a business would be force-sold). */
  triggersShortfall: boolean;
  /** The syndicate would already be underwater on Sunday before this spend. */
  alreadyShort: boolean;
}

export function evaluateSpendSafety(
  state: GameState,
  syndicateId: string,
  streetCost: number,
  safeCost: number,
  addedWeeklyPayroll = 0
): SpendSafety | null {
  const s = state.syndicates[syndicateId];
  const proj = selectSundayProjection(state, syndicateId);
  if (!s || !proj) return null;
  const leavesStreet = s.dirtyCash - streetCost;
  const leavesSafe = s.cleanCash - safeCost;
  const projectedPostSundayTotal = leavesStreet + leavesSafe + proj.net - addedWeeklyPayroll;
  return {
    affordable: leavesStreet >= 0 && leavesSafe >= 0,
    leavesStreet,
    leavesSafe,
    projectedPostSundayTotal,
    triggersShortfall: projectedPostSundayTotal < 0,
    alreadyShort: s.dirtyCash + s.cleanCash + proj.net < 0,
  };
}

/** RECRUIT payment order (reducer.ts): Street Cash first, Safe Cash covers the rest. */
export function splitRecruitCost(syndicate: SyndicateState, total: number): { street: number; safe: number } {
  const street = Math.min(syndicate.dirtyCash, total);
  return { street, safe: total - street };
}

/** True when the player may spend an Action Point right now. */
export function canAct(state: GameState, syndicateId: string): boolean {
  const s = state.syndicates[syndicateId];
  return !!s && !state.isGameOver && !s.isEliminated && s.actionPoints >= 1;
}

/** Disabled-button reason when no action can be spent: "Match Complete" once the run is over for the player. */
export function noActionReason(state: GameState, syndicateId: string): string {
  const s = state.syndicates[syndicateId];
  return state.isGameOver || !s || s.isEliminated ? SPEND_TERMS.matchComplete : SPEND_TERMS.noActions;
}

// ---------------------------------------------------------------------------------------------
// Risk preview (jobs and, in M2-T3, claims / raids)
// ---------------------------------------------------------------------------------------------

export interface PrepTierOption {
  tier: PrepTier;
  prepCost: number;
  /** Street Cash paid up front: base cost (0 for jobs, assault cost for seizes) + prep. */
  streetCost: number;
  odds: RiskProbabilities;
  /** Improvement over Tier 0 in percentage points. */
  deltaClean: number;
  deltaMessy: number;
  deltaBotched: number;
  safety: SpendSafety;
  /** Why the tier is disabled (cash or Action Points), else null. */
  disabledReason: string | null;
}

/** Generic tier table for any risk-rolled action. `oddsFor` returns the odds for a prep tier. */
export function buildPrepTierOptions(
  state: GameState,
  syndicateId: string,
  baseStreetCost: number,
  oddsFor: (tier: PrepTier) => RiskProbabilities | null
): PrepTierOption[] {
  const base = oddsFor(0);
  const out: PrepTierOption[] = [];
  for (const tier of PREP_TIERS) {
    const odds = oddsFor(tier);
    const prepCost = PREP_CONFIG[tier].cost;
    const streetCost = baseStreetCost + prepCost;
    const safety = evaluateSpendSafety(state, syndicateId, streetCost, 0);
    if (!odds || !base || !safety) continue;
    let disabledReason: string | null = null;
    if (!canAct(state, syndicateId)) disabledReason = noActionReason(state, syndicateId);
    else if (!safety.affordable) disabledReason = `Need ${money(streetCost)} Street Cash`;
    out.push({
      tier,
      prepCost,
      streetCost,
      odds,
      deltaClean: odds.clean - base.clean,
      deltaMessy: odds.messy - base.messy,
      deltaBotched: odds.botched - base.botched,
      safety,
      disabledReason,
    });
  }
  return out;
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export interface OutcomeConsequence {
  /** Plain-English headline, e.g. "+$3,000 Street Cash". */
  gain: string;
  crewLost: number;
  heat: number;
}

/** Job consequences per outcome (crew losses capped by crew actually owned, lowest tier first). */
export function jobConsequences(job: StreetJobDef, totalCrew: number): Record<RiskOutcome, OutcomeConsequence> {
  return {
    CLEAN: { gain: `+${money(job.cleanPayout)} Street Cash`, crewLost: 0, heat: job.cleanHeat },
    MESSY: { gain: `+${money(job.messyPayout)} Street Cash`, crewLost: Math.min(1, totalCrew), heat: job.messyHeat },
    BOTCHED: { gain: 'No payout', crewLost: Math.min(2, totalCrew), heat: job.botchedHeat },
  };
}

export interface JobRow {
  job: StreetJobDef;
  locked: boolean;
  lockReason: string | null;
  /** Odds for each prep tier (same math as applyAction). */
  odds: Record<PrepTier, RiskProbabilities>;
  tiers: PrepTierOption[];
  /** True when a $0 job can be run right now. */
  canRunFree: boolean;
}

/** Jobs sorted by difficulty (easiest first). */
export function buildJobRows(state: GameState, syndicateId: string): JobRow[] {
  const s = state.syndicates[syndicateId];
  if (!s) return [];
  const totalCrew = calculateTotalCrewCount(s.crew);
  const sorted = [...STREET_JOBS].sort((a, b) => a.difficultyDef - b.difficultyDef || a.id.localeCompare(b.id));
  return sorted.map((job) => {
    const oddsFor = (tier: PrepTier) => rollPreview(state, syndicateId, { type: 'EXTORT', jobId: job.id, prepTier: tier });
    const tiers = buildPrepTierOptions(state, syndicateId, 0, oddsFor);
    const locked = totalCrew === 0 && job.id !== ZERO_CREW_JOB_ID;
    const odds = Object.fromEntries(tiers.map((t) => [t.tier, t.odds])) as Record<PrepTier, RiskProbabilities>;
    const free = tiers.find((t) => t.tier === 0);
    return {
      job,
      locked,
      lockReason: locked ? 'Requires ≥1 Crew' : null,
      odds,
      tiers,
      canRunFree: !locked && !!free && free.disabledReason === null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Hire Crew
// ---------------------------------------------------------------------------------------------

export interface CrewHireOption {
  tier: CrewTierDef;
  count: 1 | 2 | 3;
  unlocked: boolean;
  /** e.g. "Needs ≥2 Businesses"; null when unlocked. */
  lockReason: string | null;
  cost: number;
  paidStreet: number;
  paidSafe: number;
  attackGained: number;
  defenseGained: number;
  addedPayroll: number;
  /** Projected Sunday net after the extra payroll. */
  newSundayNet: number;
  safety: SpendSafety;
  disabledReason: string | null;
}

export function buildCrewOptions(state: GameState, syndicateId: string): CrewHireOption[] {
  const s = state.syndicates[syndicateId];
  const proj = selectSundayProjection(state, syndicateId);
  if (!s || !proj) return [];
  const owned = countOwnedRackets(syndicateId, state.rackets);
  const out: CrewHireOption[] = [];
  for (const tier of CREW_TIERS) {
    for (const count of [1, 2, 3] as const) {
      const cost = tier.hireCost * count;
      const { street, safe } = splitRecruitCost(s, cost);
      const addedPayroll = tier.weeklyPayroll * count;
      const safety = evaluateSpendSafety(state, syndicateId, street, safe, addedPayroll);
      if (!safety) continue;
      const unlocked = owned >= tier.requiredRackets;
      const affordable = s.dirtyCash + s.cleanCash >= cost;
      let disabledReason: string | null = null;
      if (!unlocked) disabledReason = `Needs ≥${tier.requiredRackets} Businesses`;
      else if (!canAct(state, syndicateId)) disabledReason = noActionReason(state, syndicateId);
      else if (!affordable) disabledReason = `Need ${money(cost)}`;
      out.push({
        tier,
        count,
        unlocked,
        lockReason: unlocked ? null : `Needs ≥${tier.requiredRackets} Businesses`,
        cost,
        paidStreet: street,
        paidSafe: safe,
        attackGained: tier.attack * count,
        defenseGained: tier.defense * count,
        addedPayroll,
        newSundayNet: proj.net - addedPayroll,
        safety: { ...safety, affordable },
        disabledReason,
      });
    }
  }
  return out;
}

export function recruitAction(tier: CrewTierId, count: 1 | 2 | 3) {
  return { type: 'RECRUIT', tier, count } as const;
}

// ---------------------------------------------------------------------------------------------
// Protect Profits (Bank Safe Cash / Pay Off Cops)
// ---------------------------------------------------------------------------------------------

export const LAUNDER_PRESETS = [1000, 5000, LAUNDER_MAX] as const;

export interface LaunderOption {
  /** Street Cash converted. */
  amount: number;
  fee: number;
  /** Safe Cash received (engine: floor(amount * (100 - fee%) / 100)). */
  safeGained: number;
  /** Net Worth change: 2 * safeGained - amount. */
  netWorthDelta: number;
  safety: SpendSafety;
  disabledReason: string | null;
}

export function launderUsed(state: GameState, syndicateId: string): boolean {
  const s = state.syndicates[syndicateId];
  return !!s && s.laundersThisWeek >= MAX_LAUNDERS_PER_WEEK;
}

export function buildLaunderOption(state: GameState, syndicateId: string, amount: number): LaunderOption | null {
  const s = state.syndicates[syndicateId];
  if (!s) return null;
  const a = Math.floor(amount);
  const safeGained = Math.floor((a * (100 - LAUNDER_FEE_PCT)) / 100);
  // Banking moves Street Cash into Safe Cash: street falls by `a`, safe rises by `safeGained`.
  const safety = evaluateSpendSafety(state, syndicateId, a, -safeGained);
  if (!safety) return null;
  let disabledReason: string | null = null;
  if (launderUsed(state, syndicateId)) disabledReason = 'Already Banked This Week (1/1)';
  else if (!canAct(state, syndicateId)) disabledReason = noActionReason(state, syndicateId);
  else if (a <= 0 || a > LAUNDER_MAX) disabledReason = `Pick $1–${money(LAUNDER_MAX)}`;
  else if (s.dirtyCash < a) disabledReason = `Need ${money(a)} Street Cash`;
  return {
    amount: a,
    fee: a - safeGained,
    safeGained,
    netWorthDelta: 2 * safeGained - a,
    safety: { ...safety, affordable: s.dirtyCash >= a },
    disabledReason,
  };
}

/** Largest legal launder amount right now (Street Cash capped at LAUNDER_MAX). */
export function maxLaunderAmount(state: GameState, syndicateId: string): number {
  const s = state.syndicates[syndicateId];
  return s ? Math.max(0, Math.min(LAUNDER_MAX, s.dirtyCash)) : 0;
}

export interface BribeOption {
  /** BRIBE `useClean` flag: pay with Safe Cash ($3,000) or Street Cash ($4,500). */
  useClean: boolean;
  streetCost: number;
  safeCost: number;
  heatBefore: number;
  heatAfter: number;
  safety: SpendSafety;
  disabledReason: string | null;
}

export function buildPayCopsOptions(state: GameState, syndicateId: string): BribeOption[] {
  const s = state.syndicates[syndicateId];
  if (!s) return [];
  const out: BribeOption[] = [];
  for (const useClean of [true, false]) {
    const safeCost = useClean ? BRIBE_CLEAN_COST : 0;
    const streetCost = useClean ? 0 : BRIBE_DIRTY_COST;
    const safety = evaluateSpendSafety(state, syndicateId, streetCost, safeCost);
    if (!safety) continue;
    let disabledReason: string | null = null;
    if (!canAct(state, syndicateId)) disabledReason = noActionReason(state, syndicateId);
    else if (!safety.affordable) disabledReason = useClean ? `Need ${money(safeCost)} Safe Cash` : `Need ${money(streetCost)} Street Cash`;
    out.push({
      useClean,
      streetCost,
      safeCost,
      heatBefore: s.heat,
      heatAfter: Math.max(0, s.heat - BRIBE_SELF_HEAT),
      safety,
      disabledReason,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Covert Ops (Spy / Snitch)
// ---------------------------------------------------------------------------------------------

export interface SpyOption {
  targetId: string;
  safety: SpendSafety;
  disabledReason: string | null;
}

export function buildSpyOption(state: GameState, syndicateId: string, targetId: string): SpyOption | null {
  const safety = evaluateSpendSafety(state, syndicateId, WIRETAP_COST, 0);
  const target = state.syndicates[targetId];
  if (!safety) return null;
  let disabledReason: string | null = null;
  if (!target || target.isEliminated || targetId === syndicateId) disabledReason = 'Pick a living rival';
  else if (!canAct(state, syndicateId)) disabledReason = noActionReason(state, syndicateId);
  else if (!safety.affordable) disabledReason = `Need ${money(WIRETAP_COST)} Street Cash`;
  return { targetId, safety, disabledReason };
}

export interface SnitchOption {
  useClean: boolean;
  targetId: string;
  streetCost: number;
  safeCost: number;
  /** Rival Heat shown before -> after the +12 frame. */
  targetHeatBefore: number;
  targetHeatAfter: number;
  safety: SpendSafety;
  disabledReason: string | null;
}

export function framesUsed(state: GameState, syndicateId: string): boolean {
  const s = state.syndicates[syndicateId];
  return !!s && s.framesThisWeek >= MAX_FRAMES_PER_WEEK;
}

export function buildSnitchOptions(state: GameState, syndicateId: string, targetId: string): SnitchOption[] {
  const target = state.syndicates[targetId];
  const out: SnitchOption[] = [];
  for (const useClean of [true, false]) {
    const safeCost = useClean ? BRIBE_CLEAN_COST : 0;
    const streetCost = useClean ? 0 : BRIBE_DIRTY_COST;
    const safety = evaluateSpendSafety(state, syndicateId, streetCost, safeCost);
    if (!safety) continue;
    let disabledReason: string | null = null;
    if (!target || target.isEliminated || targetId === syndicateId) disabledReason = 'Pick a living rival';
    else if (framesUsed(state, syndicateId)) disabledReason = 'Already Snitched This Week (1/1)';
    else if (!canAct(state, syndicateId)) disabledReason = noActionReason(state, syndicateId);
    else if (!safety.affordable) disabledReason = useClean ? `Need ${money(safeCost)} Safe Cash` : `Need ${money(streetCost)} Street Cash`;
    out.push({
      useClean,
      targetId,
      streetCost,
      safeCost,
      targetHeatBefore: target?.heat ?? 0,
      targetHeatAfter: Math.min(100, (target?.heat ?? 0) + BRIBE_FRAME_HEAT),
      safety,
      disabledReason,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Guided Intro section locks
// ---------------------------------------------------------------------------------------------

export interface SectionLocks {
  jobs: VerbLock;
  crew: VerbLock;
  protect: VerbLock;
  covert: VerbLock;
}

export function sectionLocks(week: number, guidedIntro: boolean): SectionLocks {
  return {
    jobs: verbLock('runJob', week, guidedIntro),
    crew: verbLock('hireCrew', week, guidedIntro),
    protect: verbLock('bankCash', week, guidedIntro),
    covert: verbLock('spy', week, guidedIntro),
  };
}
