// Pure TypeScript Weekly Turn Flow & Economy Reducer (No UI, DOM, or React imports)

import { CITY_RACKETS, CREW_BY_ID, JOBS_BY_ID } from '../data';
import {
  ASSAULT_BASE_COST,
  BRIBE_CLEAN_COST,
  BRIBE_DIRTY_COST,
  BRIBE_FRAME_HEAT,
  BRIBE_SELF_HEAT,
  EMPIRE_FREE_RACKETS,
  EMPIRE_HEAT_PER_RACKET,
  GRUDGE_DECAY_PCT,
  GRUDGE_MAX,
  LAUNDER_FEE_PCT,
  LAUNDER_MAX,
  MAX_FRAMES_PER_WEEK,
  MAX_OUTGOING_SIEGES,
  MAX_WEEKS,
  SIEGE_LEAD_WEEKS,
  TURF_UPKEEP_BASE,
  WIRETAP_COST,
  WIRETAP_WEEKS,
} from './constants';
import {
  calculateSyndicateAttack,
  calculateSyndicatePayroll,
  calculateTotalCrewCount,
} from './crew';
import { PREP_CONFIG, resolveRiskRoll } from './risk';
import { rollPercentage } from './rng';
import type {
  Action,
  DistrictId,
  GameState,
  PrepTier,
  RacketState,
  RiskOutcome,
  Siege,
  SyndicateCrew,
  SyndicateSnapshot,
  SyndicateState,
  WeekSnapshot,
} from './types';

/**
 * Standard integer clamp utility.
 */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Projects Sunday dirty racket yield for a syndicate including district monopoly bonus
 * and damaged status.
 */
export function calculateProjectedRacketYield(
  syndicateId: string,
  rackets: Record<string, RacketState>
): number {
  let totalYield = 0;
  for (const racket of Object.values(rackets)) {
    if (racket.ownerId === syndicateId) {
      const monopoly = hasDistrictMonopoly(syndicateId, racket.district, rackets);
      let currentYield = racket.dirtyYield;
      if (monopoly) {
        currentYield = Math.floor(currentYield * 1.25);
      }
      if (racket.damagedTurnsRemaining > 0) {
        currentYield = Math.floor(currentYield * 0.5);
      }
      totalYield += currentYield;
    }
  }
  return totalYield;
}

/**
 * Projects a syndicate's Heat after the Sunday passive step (SPEC §2):
 * `heat - 5 + Σ(owned racket passiveHeat) + max(0, (ownedRackets - 3) * 5)`, clamped to 0–100.
 * Single source of truth for advanceWeek() and the AI's RICO projection.
 */
export function projectSundayHeat(
  syndicateId: string,
  heat: number,
  rackets: Record<string, RacketState>
): number {
  let ownedCount = 0;
  let racketPassiveHeat = 0;
  for (const racket of Object.values(rackets)) {
    if (racket.ownerId === syndicateId) {
      ownedCount++;
      racketPassiveHeat += racket.passiveHeat;
    }
  }
  const empireHeatTax = Math.max(0, (ownedCount - EMPIRE_FREE_RACKETS) * EMPIRE_HEAT_PER_RACKET);
  return clamp(heat - 5 + racketPassiveHeat + empireHeatTax, 0, 100);
}

/**
 * Calculates Syndicate Valuation according to Section 1:
 * Valuation = (CleanCash * 2) + DirtyCash + Sum(OwnedRacketBaseValue)
 */
export function calculateSyndicateValuation(
  syndicate: SyndicateState,
  rackets: Record<string, RacketState>
): number {
  let racketValueSum = 0;
  for (const racket of Object.values(rackets)) {
    if (racket.ownerId === syndicate.id) {
      racketValueSum += racket.baseValue;
    }
  }
  return syndicate.cleanCash * 2 + syndicate.dirtyCash + racketValueSum;
}

/**
 * Counts the number of rackets owned by a given syndicate.
 */
export function countOwnedRackets(syndicateId: string, rackets: Record<string, RacketState>): number {
  let count = 0;
  for (const racket of Object.values(rackets)) {
    if (racket.ownerId === syndicateId) {
      count++;
    }
  }
  return count;
}

/**
 * Checks if a syndicate holds a monopoly over a specific district (owns all 3 rackets).
 */
export function hasDistrictMonopoly(
  syndicateId: string,
  district: DistrictId,
  rackets: Record<string, RacketState>
): boolean {
  const districtRackets = Object.values(rackets).filter((r) => r.district === district);
  if (districtRackets.length === 0) return false;
  return districtRackets.every((r) => r.ownerId === syndicateId);
}

/**
 * Deep clones GameState immutably.
 */
export function cloneGameState(state: GameState): GameState {
  const syndicates: Record<string, SyndicateState> = {};
  for (const [id, s] of Object.entries(state.syndicates)) {
    syndicates[id] = {
      ...s,
      crew: { ...s.crew },
      assignedGuards: { ...s.assignedGuards },
      grudge: { ...s.grudge },
      wiretapTurnsRemaining: { ...s.wiretapTurnsRemaining },
    };
  }

  const rackets: Record<string, RacketState> = {};
  for (const [id, r] of Object.entries(state.rackets)) {
    rackets[id] = { ...r };
  }

  return {
    ...state,
    syndicates,
    rackets,
    activeSieges: state.activeSieges.map((siege) => ({ ...siege })),
    history: [...state.history],
    decisionTraces: [...state.decisionTraces],
  };
}

/**
 * Factory for creating a standard initial GameState matching baseline numbers.
 * 4 Syndicates: 1 Player + 3 Symmetric Utility AI Syndicates.
 * Baseline per syndicate: $6,000 DirtyCash, $0 CleanCash, 10 Heat, 3 AP, 4 Thugs.
 */
export function createInitialGameState(seed: number = 42): GameState {
  const rackets: Record<string, RacketState> = {};
  for (const r of CITY_RACKETS) {
    rackets[r.id] = {
      ...r,
      ownerId: null,
      damagedTurnsRemaining: 0,
    };
  }

  const baseCrew: SyndicateCrew = { thug: 4, enforcer: 0, hitman: 0 };

  const syndicates: Record<string, SyndicateState> = {
    player: {
      id: 'player',
      name: 'Player Syndicate',
      isPlayer: true,
      dirtyCash: 6000,
      cleanCash: 0,
      heat: 10,
      ricoCounter: 0,
      actionPoints: 3,
      crew: { ...baseCrew },
      assignedGuards: {},
      isEliminated: false,
      grudge: {},
      wiretapTurnsRemaining: {},
      framesThisWeek: 0,
    },
    ai_1: {
      id: 'ai_1',
      name: 'The Iron Syndicate',
      isPlayer: false,
      archetypeId: 'warlord',
      dirtyCash: 6000,
      cleanCash: 0,
      heat: 10,
      ricoCounter: 0,
      actionPoints: 3,
      crew: { ...baseCrew },
      assignedGuards: {},
      isEliminated: false,
      grudge: {},
      wiretapTurnsRemaining: {},
      framesThisWeek: 0,
    },
    ai_2: {
      id: 'ai_2',
      name: 'Sterling Holdings',
      isPlayer: false,
      archetypeId: 'banker',
      dirtyCash: 6000,
      cleanCash: 0,
      heat: 10,
      ricoCounter: 0,
      actionPoints: 3,
      crew: { ...baseCrew },
      assignedGuards: {},
      isEliminated: false,
      grudge: {},
      wiretapTurnsRemaining: {},
      framesThisWeek: 0,
    },
    ai_3: {
      id: 'ai_3',
      name: 'Shadow Syndicate',
      isPlayer: false,
      archetypeId: 'rat',
      dirtyCash: 6000,
      cleanCash: 0,
      heat: 10,
      ricoCounter: 0,
      actionPoints: 3,
      crew: { ...baseCrew },
      assignedGuards: {},
      isEliminated: false,
      grudge: {},
      wiretapTurnsRemaining: {},
      framesThisWeek: 0,
    },
  };

  return {
    week: 1,
    rngState: seed | 0,
    syndicates,
    rackets,
    activeSieges: [],
    history: [],
    decisionTraces: [],
    winnerId: null,
    winReason: null,
    isGameOver: false,
  };
}

export interface ActionResult {
  /** True when state was committed (AP/resources spent); false on validation rejection. */
  executed: boolean;
  /** Whether the action achieved its goal (a botched SEIZE is executed but not successful). */
  success: boolean;
  reason?: string;
  payout?: number;
  heatDelta?: number;
  casualtiesLost?: number;
  roll?: number;
  outcome?: string;
  /** True when a SEIZE on a rival-owned racket was queued as a 2-turn siege (no roll yet). */
  queued?: boolean;
  /** Week at whose start a queued siege resolves. */
  resolveWeek?: number;
}

/** Adds grudge held by `holder` against `targetId`, clamped to 0..GRUDGE_MAX. MUTATES `holder`. */
export function addGrudge(holder: SyndicateState, targetId: string, amount: number): void {
  holder.grudge[targetId] = clamp((holder.grudge[targetId] ?? 0) + amount, 0, GRUDGE_MAX);
}

/** Sunday grudge cooling for one value (integer, reaches 0). */
export function decayGrudge(grudge: number): number {
  return Math.floor((grudge * (100 - GRUDGE_DECAY_PCT)) / 100);
}

/**
 * Progressive Sunday Turf Upkeep (W3-T8b): TURF_UPKEEP_BASE * max(0, owned - 3)^2.
 * 4 rackets: $600, 5: $2,400, 6: $5,400, 7: $9,600, 8: $15,000. Paid together with Crew Payroll.
 */
export function turfUpkeep(ownedRackets: number): number {
  const over = Math.max(0, ownedRackets - EMPIRE_FREE_RACKETS);
  return TURF_UPKEEP_BASE * over * over;
}

/** Deterministic siege id (no randomUUID in the engine). */
export function siegeId(week: number, attackerId: string, racketId: string): string {
  return `${week}:${attackerId}:${racketId}`;
}

interface AssaultResolution {
  outcome: RiskOutcome;
  roll: number;
  seized: boolean;
  casualtiesLost: number;
}

/**
 * Resolves an assault on a racket: risk roll (attacker's current attack vs base defense + the
 * owner's assigned guards), ownership transfer, damage, attacker casualties and defender grudge.
 * Shared by instant SEIZE and siege resolution. MUTATES `state`, which must be a fresh clone.
 */
function resolveAssault(
  state: GameState,
  attackerId: string,
  racketId: string,
  prepTier: PrepTier
): AssaultResolution {
  const attacker = state.syndicates[attackerId]!;
  const racket = state.rackets[racketId]!;

  let defense = racket.baseDefense;
  const previousOwnerId = racket.ownerId;
  const previousOwner = previousOwnerId ? state.syndicates[previousOwnerId] : undefined;
  if (previousOwner) {
    defense += previousOwner.assignedGuards[racket.id] ?? 0;
  }

  const resolution = resolveRiskRoll(
    calculateSyndicateAttack(attacker.crew),
    defense,
    prepTier,
    state.rngState,
    attacker.crew
  );

  state.rngState = resolution.nextRngState;
  attacker.crew = resolution.casualties.remainingCrew;

  let seized = false;
  if (resolution.outcome === 'CLEAN') {
    seized = true;
    racket.ownerId = attackerId;
    racket.damagedTurnsRemaining = 0;
  } else if (resolution.outcome === 'MESSY') {
    seized = true;
    racket.ownerId = attackerId;
    racket.damagedTurnsRemaining = 1;
    if (previousOwner) {
      addGrudge(previousOwner, attackerId, 15);
    }
  } else if (previousOwner) {
    addGrudge(previousOwner, attackerId, 25);
  }

  return {
    outcome: resolution.outcome,
    roll: resolution.roll,
    seized,
    casualtiesLost: resolution.casualties.totalLost,
  };
}

/**
 * Validates and executes an action for any living syndicate (human or AI).
 * Enforces zero-cheat symmetry and integer math.
 */
export function applyAction(
  prevState: GameState,
  syndicateId: string,
  action: Action
): { state: GameState; result: ActionResult } {
  if (prevState.isGameOver) {
    return { state: prevState, result: { executed: false, success: false, reason: 'Game is already over' } };
  }

  const syndicate = prevState.syndicates[syndicateId];
  if (!syndicate) {
    return { state: prevState, result: { executed: false, success: false, reason: 'Syndicate not found' } };
  }

  if (syndicate.isEliminated) {
    return { state: prevState, result: { executed: false, success: false, reason: 'Syndicate is eliminated' } };
  }

  if (syndicate.actionPoints < 1) {
    return { state: prevState, result: { executed: false, success: false, reason: 'Insufficient Action Points' } };
  }

  const nextState = cloneGameState(prevState);
  const actor = nextState.syndicates[syndicateId]!;
  actor.actionPoints -= 1;

  switch (action.type) {
    case 'PASS': {
      return { state: nextState, result: { executed: true, success: true } };
    }

    case 'EXTORT': {
      const job = JOBS_BY_ID[action.jobId];
      if (!job) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Invalid street job ID' } };
      }

      const prep = PREP_CONFIG[action.prepTier];
      if (actor.dirtyCash < prep.cost) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Cannot afford preparation cost' } };
      }

      actor.dirtyCash -= prep.cost;

      const attack = calculateSyndicateAttack(actor.crew);
      const resolution = resolveRiskRoll(
        attack,
        job.difficultyDef,
        action.prepTier,
        nextState.rngState,
        actor.crew
      );

      nextState.rngState = resolution.nextRngState;
      actor.crew = resolution.casualties.remainingCrew;

      let payout = 0;
      let heatDelta = 0;

      if (resolution.outcome === 'CLEAN') {
        payout = job.cleanPayout;
        heatDelta = job.cleanHeat;
      } else if (resolution.outcome === 'MESSY') {
        payout = job.messyPayout;
        heatDelta = job.messyHeat;
      } else {
        payout = 0;
        heatDelta = job.botchedHeat;
      }

      actor.dirtyCash += payout;
      actor.heat = clamp(actor.heat + heatDelta, 0, 100);

      return {
        state: nextState,
        result: {
          executed: true,
          success: true,
          outcome: resolution.outcome,
          roll: resolution.roll,
          payout,
          heatDelta,
          casualtiesLost: resolution.casualties.totalLost,
        },
      };
    }

    case 'SEIZE': {
      const racket = nextState.rackets[action.racketId];
      if (!racket) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Invalid racket ID' } };
      }

      if (racket.ownerId === syndicateId) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Syndicate already owns this racket' } };
      }

      // SEIZE on a rival-owned racket is a 2-turn Siege (SPEC §2): paid now, resolved later.
      const isSiege = racket.ownerId !== null;
      const resolveWeek = nextState.week + SIEGE_LEAD_WEEKS;
      if (isSiege) {
        if (resolveWeek > MAX_WEEKS) {
          return {
            state: prevState,
            result: { executed: false, success: false, reason: `Too late to telegraph a siege (would resolve after week ${MAX_WEEKS})` },
          };
        }
        const outgoing = nextState.activeSieges.filter((s) => s.attackerId === syndicateId);
        if (outgoing.some((s) => s.racketId === racket.id)) {
          return { state: prevState, result: { executed: false, success: false, reason: 'Already besieging this racket' } };
        }
        if (outgoing.length >= MAX_OUTGOING_SIEGES) {
          return {
            state: prevState,
            result: {
              executed: false,
              success: false,
              reason: `Too many sieges underway (max ${MAX_OUTGOING_SIEGES} at a time)`,
            },
          };
        }
      }

      const prep = PREP_CONFIG[action.prepTier];
      const totalCost = ASSAULT_BASE_COST + prep.cost;

      if (actor.dirtyCash < totalCost) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Insufficient DirtyCash for assault' } };
      }

      actor.dirtyCash -= totalCost;

      if (isSiege) {
        const siege: Siege = {
          id: siegeId(nextState.week, syndicateId, racket.id),
          attackerId: syndicateId,
          racketId: racket.id,
          prepTier: action.prepTier,
          telegraphedWeek: nextState.week,
          resolveWeek,
        };
        nextState.activeSieges.push(siege);
        return { state: nextState, result: { executed: true, success: true, queued: true, resolveWeek } };
      }

      const assault = resolveAssault(nextState, syndicateId, racket.id, action.prepTier);
      return {
        state: nextState,
        result: {
          executed: true,
          success: assault.seized,
          outcome: assault.outcome,
          roll: assault.roll,
          casualtiesLost: assault.casualtiesLost,
        },
      };
    }

    case 'RECRUIT': {
      const tierDef = CREW_BY_ID[action.tier];
      if (!tierDef) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Invalid crew tier' } };
      }

      if (action.count < 1 || action.count > 3 || !Number.isInteger(action.count)) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Must hire between 1 and 3 units' } };
      }

      const ownedRackets = countOwnedRackets(syndicateId, nextState.rackets);
      if (ownedRackets < tierDef.requiredRackets) {
        return {
          state: prevState,
          result: {
            executed: false,
            success: false,
            reason: `Requires at least ${tierDef.requiredRackets} owned rackets to unlock ${tierDef.name}`,
          },
        };
      }

      const totalCost = tierDef.hireCost * action.count;
      const totalFunds = actor.dirtyCash + actor.cleanCash;

      if (totalFunds < totalCost) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Insufficient funds for recruitment' } };
      }

      const dirtyPay = Math.min(actor.dirtyCash, totalCost);
      const cleanPay = totalCost - dirtyPay;

      actor.dirtyCash -= dirtyPay;
      actor.cleanCash -= cleanPay;
      actor.crew[action.tier] += action.count;

      return { state: nextState, result: { executed: true, success: true } };
    }

    case 'LAUNDER': {
      const amount = Math.floor(action.amount);
      if (amount <= 0 || amount > LAUNDER_MAX) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Launder amount must be between $1 and $10,000' } };
      }

      if (actor.dirtyCash < amount) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Insufficient DirtyCash to launder' } };
      }

      const cleanReceived = Math.floor((amount * (100 - LAUNDER_FEE_PCT)) / 100);
      actor.dirtyCash -= amount;
      actor.cleanCash += cleanReceived;

      return { state: nextState, result: { executed: true, success: true, payout: cleanReceived } };
    }

    case 'BRIBE': {
      if (action.useClean) {
        if (actor.cleanCash < BRIBE_CLEAN_COST) {
          return { state: prevState, result: { executed: false, success: false, reason: 'Requires $3,000 CleanCash to bribe' } };
        }
        actor.cleanCash -= BRIBE_CLEAN_COST;
      } else {
        if (actor.dirtyCash < BRIBE_DIRTY_COST) {
          return { state: prevState, result: { executed: false, success: false, reason: 'Requires $4,500 DirtyCash to bribe' } };
        }
        actor.dirtyCash -= BRIBE_DIRTY_COST;
      }

      const targetId = action.targetSyndicateId;
      if (!targetId || targetId === syndicateId) {
        actor.heat = Math.max(0, actor.heat - BRIBE_SELF_HEAT);
      } else {
        const target = nextState.syndicates[targetId];
        if (!target || target.isEliminated) {
          return { state: prevState, result: { executed: false, success: false, reason: 'Invalid target syndicate to frame' } };
        }
        if (actor.framesThisWeek >= MAX_FRAMES_PER_WEEK) {
          return {
            state: prevState,
            result: { executed: false, success: false, reason: `Frame limit reached (${MAX_FRAMES_PER_WEEK} per week)` },
          };
        }
        actor.framesThisWeek += 1;
        target.heat = Math.min(100, target.heat + BRIBE_FRAME_HEAT);
        addGrudge(target, syndicateId, 10);
      }

      return { state: nextState, result: { executed: true, success: true } };
    }

    case 'WIRETAP': {
      if (actor.dirtyCash < WIRETAP_COST) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Wiretap costs $1,000 DirtyCash' } };
      }

      const target = nextState.syndicates[action.targetSyndicateId];
      if (!target || target.isEliminated || action.targetSyndicateId === syndicateId) {
        return { state: prevState, result: { executed: false, success: false, reason: 'Invalid wiretap target' } };
      }

      actor.dirtyCash -= WIRETAP_COST;
      actor.wiretapTurnsRemaining[action.targetSyndicateId] = WIRETAP_WEEKS;

      return { state: nextState, result: { executed: true, success: true } };
    }
  }
}

/**
 * Start-of-week Siege tick (SPEC §2 step 1). Resolves, in declaration order, every siege due at or
 * before `state.week`; cancels (no refund) sieges whose attacker is eliminated or already owns the
 * racket. Consumes RNG only for sieges that resolve. MUTATES `state` (a fresh clone); returns events.
 */
function resolveDueSieges(state: GameState): string[] {
  const events: string[] = [];
  const remaining: Siege[] = [];
  for (const siege of state.activeSieges) {
    if (siege.resolveWeek > state.week) {
      remaining.push(siege);
      continue;
    }
    const attacker = state.syndicates[siege.attackerId];
    const racket = state.rackets[siege.racketId];
    if (!attacker || !racket) continue;
    const prefix = `Start of week ${state.week}: ${attacker.name}'s siege on ${racket.name}`;
    if (attacker.isEliminated) {
      events.push(`${prefix} was called off (attacker eliminated).`);
      continue;
    }
    if (racket.ownerId === attacker.id) {
      events.push(`${prefix} was called off (already theirs).`);
      continue;
    }
    const assault = resolveAssault(state, attacker.id, racket.id, siege.prepTier);
    events.push(
      `${prefix} ${assault.seized ? 'took the racket' : 'failed'} (${assault.outcome}, roll ${assault.roll}, lost ${assault.casualtiesLost} crew).`
    );
  }
  state.activeSieges = remaining;
  return events;
}

/**
 * Pure start-of-week Siege tick: returns a new state with due sieges resolved or cancelled.
 * advanceWeek() runs the same step after advancing the week counter.
 */
export function tickSieges(prevState: GameState): { state: GameState; events: string[] } {
  const nextState = cloneGameState(prevState);
  const events = resolveDueSieges(nextState);
  return { state: nextState, events };
}

/**
 * Executes the deterministic Sunday Ledger Phase:
 * 1. Collect dirtyYield from owned rackets (+25% monopoly bonus, 50% damaged cut).
 * 2. Deduct Crew Payroll + Turf Upkeep (overflow to CleanCash; forced liquidation if in debt).
 * 3. Passive Heat & Empire Tax (-5 base + racket heat + (rackets-3)*5 tax); grudge cooling.
 * 4. High-Heat Hazard (>=70 heat: 25% chance of 20% dirty cash raid).
 * 5. RICO indictment (2 consecutive weeks at 100 heat).
 * 6. Wiped Out check (0 crew, 0 rackets, < $1,000 total cash).
 * 7. Domination win check (>=8 rackets with <100 heat) & Week 52 Kingpin valuation check.
 * 8. Append WeekSnapshot to history and advance week.
 */
export function advanceWeek(prevState: GameState): GameState {
  if (prevState.isGameOver) {
    return prevState;
  }

  const nextState = cloneGameState(prevState);
  const events: string[] = [];

  // --- Step 1: Collect Racket Yields ---
  for (const syndicate of Object.values(nextState.syndicates)) {
    if (syndicate.isEliminated) continue;

    syndicate.dirtyCash += calculateProjectedRacketYield(syndicate.id, nextState.rackets);
  }

  // Decrement damaged turns on rackets
  for (const racket of Object.values(nextState.rackets)) {
    if (racket.damagedTurnsRemaining > 0) {
      racket.damagedTurnsRemaining -= 1;
    }
  }

  // --- Step 2: Crew Payroll + Turf Upkeep & Forced Liquidation ---
  for (const syndicate of Object.values(nextState.syndicates)) {
    if (syndicate.isEliminated) continue;

    // Crew Payroll and Turf Upkeep share one bill: Dirty first, then Clean, then forced liquidation.
    const crewPayroll = calculateSyndicatePayroll(syndicate.crew);
    const ownedForUpkeep = countOwnedRackets(syndicate.id, nextState.rackets);
    const upkeep = turfUpkeep(ownedForUpkeep);
    const payroll = crewPayroll + upkeep;
    if (upkeep > 0) {
      events.push(
        `${syndicate.name} paid $${crewPayroll} Crew Payroll + $${upkeep} Turf Upkeep (${ownedForUpkeep} rackets).`
      );
    }

    if (syndicate.dirtyCash >= payroll) {
      syndicate.dirtyCash -= payroll;
    } else {
      const remainingPayroll = payroll - syndicate.dirtyCash;
      syndicate.dirtyCash = 0;
      syndicate.cleanCash -= remainingPayroll;
    }

    // Handle debt liquidation if cleanCash < 0
    if (syndicate.cleanCash < 0) {
      // Find all owned rackets sorted by baseValue ascending (liquidate lowest first)
      const ownedRackets = Object.values(nextState.rackets)
        .filter((r) => r.ownerId === syndicate.id)
        .sort((a, b) => a.baseValue - b.baseValue);

      for (const racket of ownedRackets) {
        if (syndicate.cleanCash >= 0) break;

        const liquidationPayout = Math.floor(racket.baseValue * 0.5);
        racket.ownerId = null;
        racket.damagedTurnsRemaining = 0;

        syndicate.cleanCash += liquidationPayout;
        events.push(
          `${syndicate.name} liquidated ${racket.name} for $${liquidationPayout} to cover debt.`
        );
      }
    }

    // Insolvency check: if still negative and 0 rackets left
    const remainingOwnedRackets = countOwnedRackets(syndicate.id, nextState.rackets);
    if (syndicate.dirtyCash + syndicate.cleanCash < 0 && remainingOwnedRackets === 0) {
      syndicate.isEliminated = true;
      syndicate.eliminationReason = 'INSOLVENT';
      syndicate.eliminatedWeek = nextState.week;
      events.push(`${syndicate.name} went insolvent and disbanded due to unpaid debt!`);
    }
  }

  // --- Step 3: Passive Heat Decay & Empire Tax ---
  for (const syndicate of Object.values(nextState.syndicates)) {
    if (syndicate.isEliminated) continue;

    syndicate.heat = projectSundayHeat(syndicate.id, syndicate.heat, nextState.rackets);
  }

  // --- Step 3b: Grudge cooling (feuds fade unless renewed) ---
  for (const syndicate of Object.values(nextState.syndicates)) {
    if (syndicate.isEliminated) continue;
    for (const [targetId, grudge] of Object.entries(syndicate.grudge)) {
      syndicate.grudge[targetId] = decayGrudge(grudge);
    }
  }

  // --- Step 4: High-Heat Hazard (Police Raid >= 70 Heat) ---
  for (const syndicate of Object.values(nextState.syndicates)) {
    if (syndicate.isEliminated) continue;

    if (syndicate.heat >= 70) {
      const { roll, nextState: newRng } = rollPercentage(nextState.rngState);
      nextState.rngState = newRng;

      if (roll <= 25) {
        const seized = Math.floor(syndicate.dirtyCash * 0.2);
        syndicate.dirtyCash -= seized;
        events.push(`Police Raid hit ${syndicate.name}! Seized $${seized} in DirtyCash.`);
      }
    }
  }

  // --- Step 5: RICO Counter & Elimination ---
  for (const syndicate of Object.values(nextState.syndicates)) {
    if (syndicate.isEliminated) continue;

    if (syndicate.heat === 100) {
      syndicate.ricoCounter += 1;
      if (syndicate.ricoCounter >= 2) {
        syndicate.isEliminated = true;
        syndicate.eliminationReason = 'RICO';
        syndicate.eliminatedWeek = nextState.week;

        // Release all owned rackets
        for (const racket of Object.values(nextState.rackets)) {
          if (racket.ownerId === syndicate.id) {
            racket.ownerId = null;
          }
        }

        events.push(`${syndicate.name} was hit with a federal RICO indictment and eliminated!`);
      }
    } else {
      syndicate.ricoCounter = 0;
    }
  }

  // --- Step 6: Wiped Out Elimination Check ---
  for (const syndicate of Object.values(nextState.syndicates)) {
    if (syndicate.isEliminated) continue;

    const crewCount = calculateTotalCrewCount(syndicate.crew);
    const ownedCount = countOwnedRackets(syndicate.id, nextState.rackets);
    const totalCash = syndicate.dirtyCash + syndicate.cleanCash;

    if (crewCount === 0 && ownedCount === 0 && totalCash < 1000) {
      syndicate.isEliminated = true;
      syndicate.eliminationReason = 'WIPED_OUT';
      syndicate.eliminatedWeek = nextState.week;
      events.push(`${syndicate.name} has no crew, turf, or cash and was wiped out!`);
    }
  }

  // --- Step 7: Win Conditions & Elimination Outcomes ---
  const livingSyndicates = Object.values(nextState.syndicates).filter((s) => !s.isEliminated);

  // Condition A: Only one syndicate left standing
  if (livingSyndicates.length === 1) {
    const lastStanding = livingSyndicates[0]!;
    nextState.isGameOver = true;
    nextState.winnerId = lastStanding.id;
    nextState.winReason = 'LAST_STANDING';
  } else if (livingSyndicates.length === 0) {
    nextState.isGameOver = true;
    nextState.winnerId = null;
  } else {
    // Condition B: Domination Win (Own >= 8 of 12 City Rackets while Heat < 100)
    const dominationCandidates = livingSyndicates.filter((s) => {
      const owned = countOwnedRackets(s.id, nextState.rackets);
      return owned >= 8 && s.heat < 100;
    });

    if (dominationCandidates.length > 0) {
      dominationCandidates.sort(
        (a, b) =>
          calculateSyndicateValuation(b, nextState.rackets) -
          calculateSyndicateValuation(a, nextState.rackets)
      );
      const winner = dominationCandidates[0]!;
      nextState.isGameOver = true;
      nextState.winnerId = winner.id;
      nextState.winReason = 'DOMINATION';
    } else if (nextState.week >= MAX_WEEKS) {
      // Condition C: Week 52 Kingpin Tiebreaker
      livingSyndicates.sort(
        (a, b) =>
          calculateSyndicateValuation(b, nextState.rackets) -
          calculateSyndicateValuation(a, nextState.rackets)
      );
      const winner = livingSyndicates[0]!;
      nextState.isGameOver = true;
      nextState.winnerId = winner.id;
      nextState.winReason = 'VALUATION';
    }
  }

  // --- Step 8: Reset Turns & Record Snapshot ---
  const syndicateSnapshots: Record<string, SyndicateSnapshot> = {};
  for (const s of Object.values(nextState.syndicates)) {
    syndicateSnapshots[s.id] = {
      id: s.id,
      dirtyCash: s.dirtyCash,
      cleanCash: s.cleanCash,
      heat: s.heat,
      valuation: calculateSyndicateValuation(s, nextState.rackets),
      crewCount: calculateTotalCrewCount(s.crew),
      ownedRacketCount: countOwnedRackets(s.id, nextState.rackets),
      isEliminated: s.isEliminated,
    };

    if (!s.isEliminated) {
      s.actionPoints = 3;
      s.framesThisWeek = 0;
      for (const [targetId, turns] of Object.entries(s.wiretapTurnsRemaining)) {
        if (turns > 0) {
          s.wiretapTurnsRemaining[targetId] = turns - 1;
        }
      }
    }
  }

  const racketSnapshots: Record<string, { ownerId: string | null; damaged: boolean }> = {};
  for (const r of Object.values(nextState.rackets)) {
    racketSnapshots[r.id] = {
      ownerId: r.ownerId,
      damaged: r.damagedTurnsRemaining > 0,
    };
  }

  const snapshot: WeekSnapshot = {
    week: nextState.week,
    syndicates: syndicateSnapshots,
    rackets: racketSnapshots,
    events,
  };

  nextState.history.push(snapshot);

  if (!nextState.isGameOver) {
    nextState.week += 1;
    // Start of the new week: tick 2-turn Siege Telegraphs. Their events are appended to the
    // snapshot just recorded so "last week's events" shows them right after End Week.
    snapshot.events.push(...resolveDueSieges(nextState));
  }

  return nextState;
}
