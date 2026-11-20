// Pure selectors over GameState for the ledger HUD. No React / Zustand imports.
// The Sunday projection reuses the engine's own helpers so it matches `advanceWeek` 1:1.

import { calculateSyndicatePayroll } from '../engine/crew';
import {
  calculateProjectedRacketYield,
  calculateSyndicateValuation,
  countOwnedRackets,
  projectSundayHeat,
  turfUpkeep,
} from '../engine/reducer';
import type { GameState } from '../engine/types';

export const HEAT_RAID_THRESHOLD = 70;
export const DOMINATION_RACKETS = 8;

export interface SundayProjection {
  /** Business Income incl. +25% District Bonus and 50% Damaged penalty. */
  income: number;
  crewPayroll: number;
  /** Turf Upkeep, shown to players as "Size Tax". */
  sizeTax: number;
  /** income - crewPayroll - sizeTax. */
  net: number;
  /** Street Cash after income and the Dirty -> Safe overflow bill (before any forced sale). */
  projectedStreet: number;
  projectedSafe: number;
  /** True when total cash after Sunday is below $0 (a business would be force-sold). */
  forcedSaleRisk: boolean;
  /** Heat after the Sunday passive step: -5 base + business heat + Empire Heat. */
  projectedHeat: number;
  heatDelta: number;
  /** True if projected Heat is at/above the Police Raid threshold. */
  raidRisk: boolean;
}

export function selectSundayProjection(state: GameState, syndicateId: string): SundayProjection | null {
  const s = state.syndicates[syndicateId];
  if (!s) return null;
  const income = calculateProjectedRacketYield(syndicateId, state.rackets);
  const crewPayroll = calculateSyndicatePayroll(s.crew);
  const sizeTax = turfUpkeep(countOwnedRackets(syndicateId, state.rackets));
  const bill = crewPayroll + sizeTax;

  // Mirrors advanceWeek: yield is added to DirtyCash, then the bill is paid Dirty first, Clean overflow.
  const dirtyAfterIncome = s.dirtyCash + income;
  let projectedStreet: number;
  let projectedSafe = s.cleanCash;
  if (dirtyAfterIncome >= bill) {
    projectedStreet = dirtyAfterIncome - bill;
  } else {
    projectedStreet = 0;
    projectedSafe -= bill - dirtyAfterIncome;
  }
  const projectedHeat = projectSundayHeat(syndicateId, s.heat, state.rackets);
  return {
    income,
    crewPayroll,
    sizeTax,
    net: income - crewPayroll - sizeTax,
    projectedStreet,
    projectedSafe,
    forcedSaleRisk: projectedStreet + projectedSafe < 0,
    projectedHeat,
    heatDelta: projectedHeat - s.heat,
    raidRisk: projectedHeat >= HEAT_RAID_THRESHOLD,
  };
}

/** 1-based Net Worth rank among non-eliminated syndicates (ties share the better rank). */
export function selectCityRank(state: GameState, syndicateId: string): number {
  const mine = state.syndicates[syndicateId];
  if (!mine) return 0;
  const myWorth = calculateSyndicateValuation(mine, state.rackets);
  let better = 0;
  for (const other of Object.values(state.syndicates)) {
    if (other.id === syndicateId || other.isEliminated) continue;
    if (calculateSyndicateValuation(other, state.rackets) > myWorth) better++;
  }
  return better + 1;
}

export function selectNetWorth(state: GameState, syndicateId: string): number {
  const s = state.syndicates[syndicateId];
  return s ? calculateSyndicateValuation(s, state.rackets) : 0;
}

/** Active sieges aimed at a racket the given syndicate currently owns. */
export function selectIncomingRaidCount(state: GameState, syndicateId: string): number {
  return state.activeSieges.filter((g) => state.rackets[g.racketId]?.ownerId === syndicateId).length;
}
