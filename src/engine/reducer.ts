// Pure TypeScript Weekly Turn Flow & Economy Reducer (No UI, DOM, or React imports)

import { CITY_RACKETS, CREW_BY_ID, JOBS_BY_ID } from '../data';
import { calculateSyndicateAttack, PREP_CONFIG, resolveRiskRoll } from './risk';
import { rollPercentage } from './rng';
import type {
  Action,
  DistrictId,
  GameState,
  RacketState,
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
 * Calculates total count of active crew members for a syndicate.
 */
export function calculateTotalCrewCount(crew: SyndicateCrew): number {
  return crew.thug + crew.enforcer + crew.hitman;
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
    activeSieges: [...state.activeSieges],
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
  success: boolean;
  reason?: string;
  payout?: number;
  heatDelta?: number;
  casualtiesLost?: number;
  roll?: number;
  outcome?: string;
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
    return { state: prevState, result: { success: false, reason: 'Game is already over' } };
  }

  const syndicate = prevState.syndicates[syndicateId];
  if (!syndicate) {
    return { state: prevState, result: { success: false, reason: 'Syndicate not found' } };
  }

  if (syndicate.isEliminated) {
    return { state: prevState, result: { success: false, reason: 'Syndicate is eliminated' } };
  }

  if (syndicate.actionPoints < 1) {
    return { state: prevState, result: { success: false, reason: 'Insufficient Action Points' } };
  }

  const nextState = cloneGameState(prevState);
  const actor = nextState.syndicates[syndicateId]!;
  actor.actionPoints -= 1;

  switch (action.type) {
    case 'PASS': {
      return { state: nextState, result: { success: true } };
    }

    case 'EXTORT': {
      const job = JOBS_BY_ID[action.jobId];
      if (!job) {
        return { state: prevState, result: { success: false, reason: 'Invalid street job ID' } };
      }

      const prep = PREP_CONFIG[action.prepTier];
      if (actor.dirtyCash < prep.cost) {
        return { state: prevState, result: { success: false, reason: 'Cannot afford preparation cost' } };
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
        return { state: prevState, result: { success: false, reason: 'Invalid racket ID' } };
      }

      if (racket.ownerId === syndicateId) {
        return { state: prevState, result: { success: false, reason: 'Syndicate already owns this racket' } };
      }

      const prep = PREP_CONFIG[action.prepTier];
      const baseAssaultCost = 1500;
      const totalCost = baseAssaultCost + prep.cost;

      if (actor.dirtyCash < totalCost) {
        return { state: prevState, result: { success: false, reason: 'Insufficient DirtyCash for assault' } };
      }

      actor.dirtyCash -= totalCost;

      const attack = calculateSyndicateAttack(actor.crew);
      let defense = racket.baseDefense;

      const previousOwnerId = racket.ownerId;
      if (previousOwnerId && nextState.syndicates[previousOwnerId]) {
        const rival = nextState.syndicates[previousOwnerId]!;
        const assignedGuard = rival.assignedGuards[racket.id] ?? 0;
        defense += assignedGuard;
      }

      const resolution = resolveRiskRoll(
        attack,
        defense,
        action.prepTier,
        nextState.rngState,
        actor.crew
      );

      nextState.rngState = resolution.nextRngState;
      actor.crew = resolution.casualties.remainingCrew;

      let seized = false;

      if (resolution.outcome === 'CLEAN') {
        seized = true;
        racket.ownerId = syndicateId;
        racket.damagedTurnsRemaining = 0;
      } else if (resolution.outcome === 'MESSY') {
        seized = true;
        racket.ownerId = syndicateId;
        racket.damagedTurnsRemaining = 1;

        if (previousOwnerId && nextState.syndicates[previousOwnerId]) {
          const rival = nextState.syndicates[previousOwnerId]!;
          rival.grudge[syndicateId] = (rival.grudge[syndicateId] ?? 0) + 15;
        }
      } else {
        seized = false;
        if (previousOwnerId && nextState.syndicates[previousOwnerId]) {
          const rival = nextState.syndicates[previousOwnerId]!;
          rival.grudge[syndicateId] = (rival.grudge[syndicateId] ?? 0) + 25;
        }
      }

      return {
        state: nextState,
        result: {
          success: seized,
          outcome: resolution.outcome,
          roll: resolution.roll,
          casualtiesLost: resolution.casualties.totalLost,
        },
      };
    }

    case 'RECRUIT': {
      const tierDef = CREW_BY_ID[action.tier];
      if (!tierDef) {
        return { state: prevState, result: { success: false, reason: 'Invalid crew tier' } };
      }

      if (action.count < 1 || action.count > 3 || !Number.isInteger(action.count)) {
        return { state: prevState, result: { success: false, reason: 'Must hire between 1 and 3 units' } };
      }

      const ownedRackets = countOwnedRackets(syndicateId, nextState.rackets);
      if (ownedRackets < tierDef.requiredRackets) {
        return {
          state: prevState,
          result: {
            success: false,
            reason: `Requires at least ${tierDef.requiredRackets} owned rackets to unlock ${tierDef.name}`,
          },
        };
      }

      const totalCost = tierDef.hireCost * action.count;
      const totalFunds = actor.dirtyCash + actor.cleanCash;

      if (totalFunds < totalCost) {
        return { state: prevState, result: { success: false, reason: 'Insufficient funds for recruitment' } };
      }

      const dirtyPay = Math.min(actor.dirtyCash, totalCost);
      const cleanPay = totalCost - dirtyPay;

      actor.dirtyCash -= dirtyPay;
      actor.cleanCash -= cleanPay;
      actor.crew[action.tier] += action.count;

      return { state: nextState, result: { success: true } };
    }

    case 'LAUNDER': {
      const amount = Math.floor(action.amount);
      if (amount <= 0 || amount > 10000) {
        return { state: prevState, result: { success: false, reason: 'Launder amount must be between $1 and $10,000' } };
      }

      if (actor.dirtyCash < amount) {
        return { state: prevState, result: { success: false, reason: 'Insufficient DirtyCash to launder' } };
      }

      const cleanReceived = Math.floor(amount * 0.75); // 25% fee
      actor.dirtyCash -= amount;
      actor.cleanCash += cleanReceived;

      return { state: nextState, result: { success: true, payout: cleanReceived } };
    }

    case 'BRIBE': {
      if (action.useClean) {
        if (actor.cleanCash < 3000) {
          return { state: prevState, result: { success: false, reason: 'Requires $3,000 CleanCash to bribe' } };
        }
        actor.cleanCash -= 3000;
      } else {
        if (actor.dirtyCash < 4500) {
          return { state: prevState, result: { success: false, reason: 'Requires $4,500 DirtyCash to bribe' } };
        }
        actor.dirtyCash -= 4500;
      }

      const targetId = action.targetSyndicateId;
      if (!targetId || targetId === syndicateId) {
        actor.heat = Math.max(0, actor.heat - 22);
      } else {
        const target = nextState.syndicates[targetId];
        if (!target || target.isEliminated) {
          return { state: prevState, result: { success: false, reason: 'Invalid target syndicate to frame' } };
        }
        target.heat = Math.min(100, target.heat + 12);
        target.grudge[syndicateId] = (target.grudge[syndicateId] ?? 0) + 10;
      }

      return { state: nextState, result: { success: true } };
    }

    case 'WIRETAP': {
      if (actor.dirtyCash < 1000) {
        return { state: prevState, result: { success: false, reason: 'Wiretap costs $1,000 DirtyCash' } };
      }

      const target = nextState.syndicates[action.targetSyndicateId];
      if (!target || target.isEliminated || action.targetSyndicateId === syndicateId) {
        return { state: prevState, result: { success: false, reason: 'Invalid wiretap target' } };
      }

      actor.dirtyCash -= 1000;
      actor.wiretapTurnsRemaining[action.targetSyndicateId] = 3;

      return { state: nextState, result: { success: true } };
    }
  }
}

/**
 * Executes the deterministic Sunday Ledger Phase:
 * 1. Collect dirtyYield from owned rackets (+25% monopoly bonus, 50% damaged cut).
 * 2. Deduct Crew Payroll (overflow to CleanCash; forced liquidation if in debt).
 * 3. Passive Heat & Empire Tax (-5 base + racket heat + (rackets-3)*2 tax).
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

    let weeklyYield = 0;
    for (const racket of Object.values(nextState.rackets)) {
      if (racket.ownerId === syndicate.id) {
        const monopoly = hasDistrictMonopoly(syndicate.id, racket.district, nextState.rackets);
        let currentYield = racket.dirtyYield;

        if (monopoly) {
          currentYield = Math.floor(currentYield * 1.25);
        }

        if (racket.damagedTurnsRemaining > 0) {
          currentYield = Math.floor(currentYield * 0.5);
        }

        weeklyYield += currentYield;
      }
    }

    syndicate.dirtyCash += weeklyYield;
  }

  // Decrement damaged turns on rackets
  for (const racket of Object.values(nextState.rackets)) {
    if (racket.damagedTurnsRemaining > 0) {
      racket.damagedTurnsRemaining -= 1;
    }
  }

  // --- Step 2: Crew Payroll & Forced Liquidation ---
  for (const syndicate of Object.values(nextState.syndicates)) {
    if (syndicate.isEliminated) continue;

    const payroll =
      syndicate.crew.thug * 250 +
      syndicate.crew.enforcer * 600 +
      syndicate.crew.hitman * 1300;

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

    const ownedCount = countOwnedRackets(syndicate.id, nextState.rackets);
    let racketPassiveHeat = 0;
    for (const racket of Object.values(nextState.rackets)) {
      if (racket.ownerId === syndicate.id) {
        racketPassiveHeat += racket.passiveHeat;
      }
    }

    const empireHeatTax = Math.max(0, (ownedCount - 3) * 2);
    const netHeatChange = -5 + racketPassiveHeat + empireHeatTax;

    syndicate.heat = clamp(syndicate.heat + netHeatChange, 0, 100);
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
    nextState.winReason = 'DOMINATION';
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
    } else if (nextState.week >= 52) {
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
  }

  return nextState;
}
