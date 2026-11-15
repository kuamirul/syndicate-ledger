// Single source of truth for crew-derived stats (pure TypeScript, no UI imports)

import { CREW_TIERS } from '../data';
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
