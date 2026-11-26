// Single source of truth for crew-derived stats (pure TypeScript, no UI imports)

import { CREW_TIERS } from '../data';
import { GARRISON_MIN_SPLIT } from './constants';
import type { SyndicateCrew } from './types';

/** Calculates total attack strength for a crew roster from CREW_TIERS. */
export function calculateSyndicateAttack(crew: SyndicateCrew): number {
  return CREW_TIERS.reduce((sum, tier) => sum + crew[tier.id] * tier.attack, 0);
}

/** Calculates total defense strength for a crew roster from CREW_TIERS. */
export function calculateSyndicateDefense(crew: SyndicateCrew): number {
  return CREW_TIERS.reduce((sum, tier) => sum + crew[tier.id] * tier.defense, 0);
}

/** Calculates total weekly payroll for a crew roster from CREW_TIERS. */
export function calculateSyndicatePayroll(crew: SyndicateCrew): number {
  return CREW_TIERS.reduce((sum, tier) => sum + crew[tier.id] * tier.weeklyPayroll, 0);
}

/** Calculates total count of active crew members. */
export function calculateTotalCrewCount(crew: SyndicateCrew): number {
  return CREW_TIERS.reduce((sum, tier) => sum + crew[tier.id], 0);
}

/**
 * Guard defense each owned business gets from its owner's crew (M3-T1 Garrison Split):
 * floor(crewDefense / max(1, ownedBusinesses)). A concentrated crew defends hard; a sprawling
 * empire spreads thin. Integer, never negative.
 */
export function garrisonDefense(crewDefense: number, ownedBusinesses: number): number {
  return Math.floor(Math.max(0, crewDefense) / Math.max(GARRISON_MIN_SPLIT, ownedBusinesses));
}
