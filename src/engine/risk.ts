// Pure TypeScript 3-Tier Risk Resolver & Prep Modifier Math (Zero External/UI Imports)

import { rollPercentage } from './rng';
import type {
  PrepTier,
  RiskOutcome,
  RiskProbabilities,
  SyndicateCrew,
} from './types';

export interface PrepTierConfig {
  readonly cost: number;
  readonly cleanBonus: number;
  readonly botchReduction: number;
}

export const PREP_CONFIG: Readonly<Record<PrepTier, PrepTierConfig>> = Object.freeze({
  0: { cost: 0, cleanBonus: 0, botchReduction: 0 },
  1: { cost: 1200, cleanBonus: 12, botchReduction: 8 },
  2: { cost: 2800, cleanBonus: 24, botchReduction: 16 },
});

export interface RiskResolution {
  readonly outcome: RiskOutcome;
  readonly roll: number;
  readonly probabilities: RiskProbabilities;
  readonly grudgeDelta: number;
  readonly casualties: {
    readonly requestedCount: number;
    readonly totalLost: number;
    readonly lostCrew: SyndicateCrew;
    readonly remainingCrew: SyndicateCrew;
  };
  readonly nextRngState: number;
}

/**
 * Standard integer clamp utility.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Calculates total attack strength for a crew roster.
 * Thug: 3, Enforcer: 8, Hitman: 18.
 */
export function calculateSyndicateAttack(crew: SyndicateCrew): number {
  return crew.thug * 3 + crew.enforcer * 8 + crew.hitman * 18;
}

/**
 * Calculates total defense strength for a crew roster.
 * Thug: 3, Enforcer: 8, Hitman: 12.
 */
export function calculateSyndicateDefense(crew: SyndicateCrew): number {
  return crew.thug * 3 + crew.enforcer * 8 + crew.hitman * 12;
}

/**
 * Calculates the exact 3-tier risk roll probabilities based on Section 4 formula:
 * R = AttackerAttack / max(1, TargetDefense)
 * Base Clean Hit %: clamp(round(40 * R), 10, 75)
 * Base Botched %: clamp(round(35 / max(0.35, R)), 8, 65)
 * Prep Modifiers:
 *   Tier 0 ($0): +0% Clean, -0% Botch
 *   Tier 1 ($1,200): +12% Clean, -8% Botch
 *   Tier 2 ($2,800): +24% Clean, -16% Botch
 * Clamped Probabilities:
 *   P_Clean = clamp(BaseClean + PrepCleanBonus, 10, 88)
 *   P_Botched = clamp(BaseBotched - PrepBotchReduction, 5, 100 - P_Clean)
 *   P_Messy = 100 - P_Clean - P_Botched
 */
export function calculateRiskProbabilities(
  attackerAttack: number,
  targetDefense: number,
  prepTier: PrepTier
): RiskProbabilities {
  const safeAttack = Math.max(0, Math.floor(attackerAttack));
  const safeDefense = Math.max(1, Math.floor(targetDefense));
  const r = safeAttack / safeDefense;

  const baseClean = clamp(Math.round(40 * r), 10, 75);
  const baseBotched = clamp(Math.round(35 / Math.max(0.35, r)), 8, 65);

  const prep = PREP_CONFIG[prepTier];
  const clean = clamp(baseClean + prep.cleanBonus, 10, 88);
  const maxBotched = 100 - clean;
  const botched = clamp(baseBotched - prep.botchReduction, 5, maxBotched);
  const messy = 100 - clean - botched;

  return { clean, messy, botched };
}

/**
 * Removes crew units starting from the lowest tier:
 * Thug -> Enforcer -> Hitman.
 */
export function removeLowestTierCrew(
  crew: SyndicateCrew,
  countToRemove: number
): {
  remainingCrew: SyndicateCrew;
  lostCrew: SyndicateCrew;
  totalLost: number;
} {
  let remainingThug = crew.thug;
  let remainingEnforcer = crew.enforcer;
  let remainingHitman = crew.hitman;

  let lostThug = 0;
  let lostEnforcer = 0;
  let lostHitman = 0;

  let needed = Math.max(0, Math.floor(countToRemove));

  // 1. Remove thugs
  if (needed > 0 && remainingThug > 0) {
    const take = Math.min(needed, remainingThug);
    remainingThug -= take;
    lostThug += take;
    needed -= take;
  }

  // 2. Remove enforcers
  if (needed > 0 && remainingEnforcer > 0) {
    const take = Math.min(needed, remainingEnforcer);
    remainingEnforcer -= take;
    lostEnforcer += take;
    needed -= take;
  }

  // 3. Remove hitmen
  if (needed > 0 && remainingHitman > 0) {
    const take = Math.min(needed, remainingHitman);
    remainingHitman -= take;
    lostHitman += take;
    needed -= take;
  }

  const totalLost = lostThug + lostEnforcer + lostHitman;

  return {
    remainingCrew: {
      thug: remainingThug,
      enforcer: remainingEnforcer,
      hitman: remainingHitman,
    },
    lostCrew: {
      thug: lostThug,
      enforcer: lostEnforcer,
      hitman: lostHitman,
    },
    totalLost,
  };
}

/**
 * Deterministically resolves a 3-tier risk roll using seeded PRNG.
 * Consequences:
 * - CLEAN: full reward, 0 casualties, +0 target grudge
 * - MESSY: partial reward, 1 lowest-tier casualty, +15 target grudge
 * - BOTCHED: 0 reward, 2 lowest-tier casualties, +25 target grudge
 */
export function resolveRiskRoll(
  attackerAttack: number,
  targetDefense: number,
  prepTier: PrepTier,
  rngState: number,
  crew: SyndicateCrew = { thug: 0, enforcer: 0, hitman: 0 }
): RiskResolution {
  const probabilities = calculateRiskProbabilities(attackerAttack, targetDefense, prepTier);
  const { roll, nextState } = rollPercentage(rngState);

  let outcome: RiskOutcome;
  let requestedCasualties = 0;
  let grudgeDelta = 0;

  if (roll <= probabilities.clean) {
    outcome = 'CLEAN';
    requestedCasualties = 0;
    grudgeDelta = 0;
  } else if (roll <= probabilities.clean + probabilities.messy) {
    outcome = 'MESSY';
    requestedCasualties = 1;
    grudgeDelta = 15;
  } else {
    outcome = 'BOTCHED';
    requestedCasualties = 2;
    grudgeDelta = 25;
  }

  const casualtyResult = removeLowestTierCrew(crew, requestedCasualties);

  return {
    outcome,
    roll,
    probabilities,
    grudgeDelta,
    casualties: {
      requestedCount: requestedCasualties,
      totalLost: casualtyResult.totalLost,
      lostCrew: casualtyResult.lostCrew,
      remainingCrew: casualtyResult.remainingCrew,
    },
    nextRngState: nextState,
  };
}
