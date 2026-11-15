// Pure TypeScript Symmetric Utility AI v1 & DecisionTrace Logger (No UI, DOM, or React imports)

import {
  ARCHETYPES_BY_ID,
  CREW_BY_ID,
  CREW_TIERS,
  JOBS_BY_ID,
  STREET_JOBS,
} from '../data';
import {
  ACTION_POINTS_PER_WEEK,
  AI_CASH_RESERVE,
  AI_LOOKAHEAD_WEEKS,
  AI_RICO_EMERGENCY,
  AI_SAFE_HEAT,
  ASSAULT_BASE_COST,
  BRIBE_CLEAN_COST,
  BRIBE_DIRTY_COST,
  LAUNDER_FEE_PCT,
  LAUNDER_MAX,
  WIRETAP_COST,
} from './constants';
import {
  calculateSyndicateAttack,
  calculateSyndicatePayroll,
  calculateTotalCrewCount,
} from './crew';
import {
  applyAction,
  calculateProjectedRacketYield,
  calculateSyndicateValuation,
  countOwnedRackets,
  projectSundayHeat,
} from './reducer';
import type { ActionResult } from './reducer';
import { calculateRiskProbabilities, PREP_CONFIG } from './risk';
import type {
  Action,
  ArchetypeWeights,
  DecisionTrace,
  DecisionTraceScores,
  GameState,
  PrepTier,
  RacketState,
  StreetJobDef,
} from './types';

const PREP_TIERS: readonly PrepTier[] = [0, 1, 2];

/**
 * Net expected cash of one EXTORT attempt: E[payout] - prep - E[casualty replacement]
 * (messy loses 1 unit, botched 2, valued at the $800 thug hire cost). Float; callers round.
 */
export function extortNetEV(attack: number, job: StreetJobDef, prepTier: PrepTier): number {
  const probs = calculateRiskProbabilities(attack, job.difficultyDef, prepTier);
  const expectedPayout = (probs.clean * job.cleanPayout + probs.messy * job.messyPayout) / 100;
  const expectedCasualties = (probs.messy * 800 + probs.botched * 1600) / 100;
  return expectedPayout - PREP_CONFIG[prepTier].cost - expectedCasualties;
}

/** SPEC §5.1 "safe" street job threshold: win (clean + messy) chance of at least 60%. */
export const SAFE_JOB_WIN_PCT = 60;

/** Expected heat per attempt a job may cost to count as repeatable weekly (= passive -5/wk decay). */
export const SUSTAINABLE_JOB_HEAT = 5;

/**
 * Sustainable earning power of a crew: the best net EV among EXTORTs at `attack` that are both
 * *safe* (>= 60% win, SPEC §5.1) and *repeatable* (expected heat per attempt <= the weekly decay),
 * or 0 if none. Used only to value RECRUIT. Long-shot and high-heat jobs are excluded on purpose:
 * the clamped risk floors make the vault job "+EV" even at attack 3, and big jobs look lucrative
 * at high attack, but heat makes neither repeatable three times a week.
 */
export function bestJobEV(attack: number): number {
  if (attack <= 0) return 0;
  let best = 0;
  for (const job of STREET_JOBS) {
    for (const tier of PREP_TIERS) {
      const probs = calculateRiskProbabilities(attack, job.difficultyDef, tier);
      if (probs.clean + probs.messy < SAFE_JOB_WIN_PCT) continue;
      const expectedHeat =
        (probs.clean * job.cleanHeat + probs.messy * job.messyHeat + probs.botched * job.botchedHeat) / 100;
      if (expectedHeat > SUSTAINABLE_JOB_HEAT) continue;
      const ev = extortNetEV(attack, job, tier);
      if (ev > best) best = ev;
    }
  }
  return best;
}

/**
 * Cash an action commits up front, before any payout (LAUNDER: the fee it destroys).
 * Used by the AI liquidity guard; mirrors the costs charged in applyAction().
 */
export function upfrontCost(action: Action): number {
  switch (action.type) {
    case 'EXTORT':
      return PREP_CONFIG[action.prepTier].cost;
    case 'SEIZE':
      return ASSAULT_BASE_COST + PREP_CONFIG[action.prepTier].cost;
    case 'RECRUIT': {
      const tierDef = CREW_BY_ID[action.tier];
      return tierDef ? action.count * tierDef.hireCost : 0;
    }
    case 'LAUNDER':
      return action.amount - Math.floor((action.amount * (100 - LAUNDER_FEE_PCT)) / 100);
    case 'BRIBE':
      return action.useClean ? BRIBE_CLEAN_COST : BRIBE_DIRTY_COST;
    case 'WIRETAP':
      return WIRETAP_COST;
    case 'PASS':
      return 0;
  }
}

/**
 * Checks if a syndicate is the citywide leader (holds >= 5 rackets).
 */
export function findCityLeader(rackets: Record<string, RacketState>): string | null {
  const counts: Record<string, number> = {};
  for (const racket of Object.values(rackets)) {
    if (racket.ownerId) {
      counts[racket.ownerId] = (counts[racket.ownerId] ?? 0) + 1;
    }
  }

  let leaderId: string | null = null;
  let maxCount = 0;
  for (const [id, count] of Object.entries(counts)) {
    if (count >= 5 && count > maxCount) {
      maxCount = count;
      leaderId = id;
    }
  }
  return leaderId;
}

/**
 * Generates all legal, valid candidate actions for a syndicate on its turn.
 * Guaranteed to satisfy resource and unlock requirements.
 */
export function generateCandidateActions(
  state: GameState,
  syndicateId: string
): Action[] {
  const actor = state.syndicates[syndicateId];
  if (!actor || actor.isEliminated || actor.actionPoints < 1 || state.isGameOver) {
    return [];
  }

  const actions: Action[] = [];
  const ownedRacketsCount = countOwnedRackets(actor.id, state.rackets);
  // The AI never sends an empty crew on a job or assault (AI judgement, not a game rule:
  // the floored risk odds would otherwise make 0-crew vault jobs and assaults "+EV").
  const hasCrew = calculateTotalCrewCount(actor.crew) > 0;

  // 1. EXTORT actions (6 jobs x affordable prep tiers)
  for (const job of hasCrew ? STREET_JOBS : []) {
    // Prep Tier 0: free
    actions.push({ type: 'EXTORT', jobId: job.id, prepTier: 0 });

    // Prep Tier 1: $1,200
    if (actor.dirtyCash >= PREP_CONFIG[1].cost) {
      actions.push({ type: 'EXTORT', jobId: job.id, prepTier: 1 });
    }

    // Prep Tier 2: $2,800
    if (actor.dirtyCash >= PREP_CONFIG[2].cost) {
      actions.push({ type: 'EXTORT', jobId: job.id, prepTier: 2 });
    }
  }

  // 2. SEIZE actions (Rival or Neutral rackets x affordable prep tiers)
  for (const racket of hasCrew ? Object.values(state.rackets) : []) {
    // Cannot attack own racket
    if (racket.ownerId === actor.id) continue;

    // Prep Tier 0
    if (actor.dirtyCash >= ASSAULT_BASE_COST + PREP_CONFIG[0].cost) {
      actions.push({ type: 'SEIZE', racketId: racket.id, prepTier: 0 });
    }

    // Prep Tier 1
    if (actor.dirtyCash >= ASSAULT_BASE_COST + PREP_CONFIG[1].cost) {
      actions.push({ type: 'SEIZE', racketId: racket.id, prepTier: 1 });
    }

    // Prep Tier 2
    if (actor.dirtyCash >= ASSAULT_BASE_COST + PREP_CONFIG[2].cost) {
      actions.push({ type: 'SEIZE', racketId: racket.id, prepTier: 2 });
    }
  }

  // 3. RECRUIT actions (Hire 1-3 crew of unlocked tiers)
  for (const tier of CREW_TIERS) {
    if (ownedRacketsCount >= tier.requiredRackets) {
      for (let count = 1; count <= 3; count++) {
        if (actor.dirtyCash >= count * tier.hireCost) {
          actions.push({ type: 'RECRUIT', tier: tier.id, count });
        }
      }
    }
  }

  // 4. LAUNDER actions (Convert up to $10,000 DirtyCash to CleanCash)
  if (actor.dirtyCash >= 1000) {
    const maxLaunder = Math.min(LAUNDER_MAX, actor.dirtyCash);
    actions.push({ type: 'LAUNDER', amount: maxLaunder });

    // If actor has plenty of cash, also consider a smaller 5k increment
    if (maxLaunder > 5000 && actor.dirtyCash >= 5000) {
      actions.push({ type: 'LAUNDER', amount: 5000 });
    }
  }

  // 5. BRIBE actions
  // 5a. Heat reduction on self
  if (actor.heat > 0) {
    if (actor.cleanCash >= BRIBE_CLEAN_COST) {
      actions.push({ type: 'BRIBE', useClean: true });
    }
    if (actor.dirtyCash >= BRIBE_DIRTY_COST) {
      actions.push({ type: 'BRIBE', useClean: false });
    }
  }

  // 5b. Frame living rivals (+12 heat)
  for (const rival of Object.values(state.syndicates)) {
    if (rival.id === actor.id || rival.isEliminated) continue;

    if (actor.cleanCash >= BRIBE_CLEAN_COST) {
      actions.push({ type: 'BRIBE', useClean: true, targetSyndicateId: rival.id });
    }
    if (actor.dirtyCash >= BRIBE_DIRTY_COST) {
      actions.push({ type: 'BRIBE', useClean: false, targetSyndicateId: rival.id });
    }
  }

  // 6. WIRETAP actions ($1,000 to reveal wallet & intents)
  if (actor.dirtyCash >= WIRETAP_COST) {
    for (const rival of Object.values(state.syndicates)) {
      if (rival.id === actor.id || rival.isEliminated) continue;
      const wiretapRemaining = actor.wiretapTurnsRemaining[rival.id] ?? 0;
      if (wiretapRemaining <= 0) {
        actions.push({ type: 'WIRETAP', targetSyndicateId: rival.id });
      }
    }
  }

  // 7. PASS (always legal fallback)
  actions.push({ type: 'PASS' });

  return actions;
}

/** Per-state values shared by every candidate of one evaluation (pure caching, no semantics). */
export interface ScoringContext {
  leaderId: string | null;
  projectedYield: number;
  attack: number;
  payroll: number;
  totalCash: number;
  ownedCount: number;
  /** Rackets the actor owns per district, and rackets per district. */
  ownedInDistrict: Record<string, number>;
  districtSize: Record<string, number>;
  projectedSundayHeat: number;
  /** Earning power at the actor's current attack (see bestJobEV). */
  currentBestJobEV: number;
  /** `${jobId}_${prepTier}` of the single best >=60%-win EXTORT the actor can afford, if any. */
  bestEmergencyJobKey: string | null;
}

/** Builds the per-state ScoringContext for one syndicate. */
export function buildScoringContext(state: GameState, syndicateId: string): ScoringContext {
  const actor = state.syndicates[syndicateId]!;
  const attack = calculateSyndicateAttack(actor.crew);
  const payroll = calculateSyndicatePayroll(actor.crew);
  const totalCash = actor.dirtyCash + actor.cleanCash;

  const ownedInDistrict: Record<string, number> = {};
  const districtSize: Record<string, number> = {};
  let ownedCount = 0;
  for (const racket of Object.values(state.rackets)) {
    districtSize[racket.district] = (districtSize[racket.district] ?? 0) + 1;
    if (racket.ownerId === syndicateId) {
      ownedCount++;
      ownedInDistrict[racket.district] = (ownedInDistrict[racket.district] ?? 0) + 1;
    }
  }

  // SPEC §5.1: the +65 goes to the single highest-EV EXTORT with >= 60% win chance, among jobs
  // the actor could actually run (prep affordable and within the liquidity guard).
  let bestEmergencyJobKey: string | null = null;
  let bestEmergencyEV = -Infinity;
  if (attack > 0) {
    for (const job of STREET_JOBS) {
      for (const tier of PREP_TIERS) {
        const prepCost = PREP_CONFIG[tier].cost;
        if (prepCost > 0 && (actor.dirtyCash < prepCost || totalCash - prepCost < payroll + AI_CASH_RESERVE)) {
          continue;
        }
        const probs = calculateRiskProbabilities(attack, job.difficultyDef, tier);
        if (probs.clean + probs.messy < SAFE_JOB_WIN_PCT) continue;
        const ev = extortNetEV(attack, job, tier);
        if (ev > bestEmergencyEV) {
          bestEmergencyEV = ev;
          bestEmergencyJobKey = `${job.id}_${tier}`;
        }
      }
    }
  }

  return {
    leaderId: findCityLeader(state.rackets),
    projectedYield: calculateProjectedRacketYield(syndicateId, state.rackets),
    attack,
    payroll,
    totalCash,
    ownedCount,
    ownedInDistrict,
    districtSize,
    projectedSundayHeat: projectSundayHeat(syndicateId, actor.heat, state.rackets),
    currentBestJobEV: bestJobEV(attack),
    bestEmergencyJobKey,
  };
}

export interface ScoredAction {
  action: Action;
  scores: DecisionTraceScores;
  reasoning: string;
}

/**
 * Scores a candidate action for a given syndicate using the Section 5 Utility AI formula:
 * TotalScore = (EV_Score * W.greed) + (Turf_Score * W.aggression) - (HeatRisk_Score * W.caution) + (Grudge_Score * W.revenge) + EmergencyModifiers + CoalitionBonus
 */
export function scoreCandidateAction(
  state: GameState,
  syndicateId: string,
  action: Action,
  ctx?: ScoringContext
): ScoredAction {
  const actor = state.syndicates[syndicateId]!;
  const archetypeDef = actor.archetypeId ? ARCHETYPES_BY_ID[actor.archetypeId] : undefined;
  const weights: ArchetypeWeights = archetypeDef?.weights ?? {
    greed: 1.0,
    aggression: 1.0,
    caution: 1.0,
    revenge: 1.0,
  };

  const c = ctx ?? buildScoringContext(state, syndicateId);
  const actorAttack = c.attack;
  const payroll = c.payroll;
  const projectedSundayCash = c.totalCash + c.projectedYield;
  const isPayrollEmergency = projectedSundayCash < payroll;
  const isHeatEmergency = actor.heat >= 80;
  // RICO strike projected for this Sunday if nothing is done about Heat.
  const isRicoEmergency = c.projectedSundayHeat >= 100;
  const leaderId = c.leaderId;

  let evScore = 0;
  let turfScore = 0;
  let heatRiskScore = 0;
  let grudgeScore = 0;
  let emergencyModifiers = 0;
  let coalitionBonus = 0;
  let reasoning = '';

  switch (action.type) {
    case 'EXTORT': {
      const job = JOBS_BY_ID[action.jobId];
      if (!job) break;

      const probs = calculateRiskProbabilities(actorAttack, job.difficultyDef, action.prepTier);
      const netEV = extortNetEV(actorAttack, job, action.prepTier);
      evScore = Math.round(netEV / 100);

      // Expected heat generation
      const expectedHeatDelta =
        (probs.clean * job.cleanHeat + probs.messy * job.messyHeat + probs.botched * job.botchedHeat) /
        100;
      // Heat that stays at or below AI_SAFE_HEAT is effectively free: it decays -5/wk and is far
      // from the 70 raid line. Above it, every expected point of heat costs 2 utility.
      heatRiskScore =
        actor.heat + expectedHeatDelta <= AI_SAFE_HEAT ? 0 : Math.round(expectedHeatDelta * 2);

      // Extra penalty if pushing heat toward 70 (raid) or 90+ (RICO)
      if (actor.heat >= 70) {
        heatRiskScore += 25;
      }
      if (actor.heat + expectedHeatDelta >= 70) {
        heatRiskScore += 20;
      }
      if (actor.heat + expectedHeatDelta >= 90) {
        heatRiskScore += 50;
      }

      // Hard Survival Override: If projected Sunday cash < Payroll, the single highest-EV
      // EXTORT with >= 60% win chance gets +65 (SPEC §5.1).
      const pWin = probs.clean + probs.messy;
      if (isPayrollEmergency && c.bestEmergencyJobKey === `${action.jobId}_${action.prepTier}`) {
        emergencyModifiers = 65;
        reasoning = `Emergency payroll solvency: Extorting ${job.name} (EV $${Math.round(netEV)}, Win ${pWin}%) to avoid insolvency`;
      } else {
        reasoning = `Extorting ${job.name} with Prep Tier ${action.prepTier} (Net EV $${Math.round(netEV)}, Win ${pWin}%)`;
      }
      break;
    }

    case 'SEIZE': {
      const racket = state.rackets[action.racketId];
      if (!racket) break;

      const prepCost = PREP_CONFIG[action.prepTier].cost;
      const isRival = racket.ownerId !== null && racket.ownerId !== actor.id;
      const targetDefender = racket.ownerId ? state.syndicates[racket.ownerId] : null;
      const assignedGuards = targetDefender?.assignedGuards[racket.id] ?? 0;
      const targetDefense = racket.baseDefense + assignedGuards;

      const probs = calculateRiskProbabilities(actorAttack, targetDefense, action.prepTier);
      const pSuccess = (probs.clean + probs.messy) / 100;
      const pMessy = probs.messy / 100;
      const pBotched = probs.botched / 100;

      // Net EV: Expected dirty yield stream (~4 weeks value) minus assault and casualty cost
      const expectedYieldValue = pSuccess * (racket.dirtyYield * 4);
      const expectedCasualtyCost = pMessy * 800 + pBotched * 1600;
      const netEV = expectedYieldValue - ASSAULT_BASE_COST - prepCost - expectedCasualtyCost;
      evScore = Math.round(netEV / 100);

      // Turf Score: territorial conquest and monopoly progress
      turfScore = isRival ? 35 : 25;

      // District Monopoly check: Would this capture complete the district?
      const districtRacketCount = c.districtSize[racket.district] ?? 0;
      const currentlyOwnedInDistrict = c.ownedInDistrict[racket.district] ?? 0;
      if (currentlyOwnedInDistrict === districtRacketCount - 1) {
        // Completing district monopoly!
        turfScore += 40;
      } else if (currentlyOwnedInDistrict === 1) {
        turfScore += 15;
      }

      // Uptown prestige bonus
      if (racket.district === 'uptown') {
        turfScore += 15;
      }

      // Near domination win: if actor currently owns >= 6 rackets
      if (c.ownedCount >= 6) {
        turfScore += 60;
      }

      // Archetype specific turf bonuses:
      // The Turtle focuses heavily on its chosen district
      if (actor.archetypeId === 'turtle' && currentlyOwnedInDistrict > 0) {
        turfScore += 25;
      }

      // The Opportunist strikes weakened rivals (defender has <= 2 total crew)
      if (actor.archetypeId === 'opportunist' && targetDefender) {
        const defenderCrewCount = calculateTotalCrewCount(targetDefender.crew);
        if (defenderCrewCount <= 2) {
          turfScore += 25;
        }
      }

      // Heat Risk: Rackets generate passive heat + combat heat
      const expCombatHeat = (probs.clean * 1 + probs.messy * 2 + probs.botched * 3) / 100;
      heatRiskScore = Math.round((expCombatHeat + racket.passiveHeat) * 3);
      if (actor.heat >= 70) {
        heatRiskScore += 25;
      }
      if (actor.heat + expCombatHeat >= 90) {
        heatRiskScore += 50;
      }

      // Grudge Score: Revenge against rivals who attacked us
      if (isRival && racket.ownerId) {
        const grudge = actor.grudge[racket.ownerId] ?? 0;
        grudgeScore = Math.round(grudge * 0.6);
      }

      // Anti-Leader Coalition: +40 bonus for seizing leader's turf
      if (leaderId && leaderId !== actor.id && racket.ownerId === leaderId) {
        coalitionBonus = 40;
      }

      reasoning = `Seizing ${racket.name} in ${racket.district} (Win ${probs.clean + probs.messy}%, Turf +${turfScore}${coalitionBonus ? ', Coalition +40' : ''})`;
      break;
    }

    case 'RECRUIT': {
      const tierDef = CREW_BY_ID[action.tier];
      const totalHireCost = action.count * tierDef.hireCost;

      // Marginal earning power over the lookahead horizon: how much better the best street job
      // becomes with the added attack (x 3 AP/wk), minus hire cost and the extra payroll.
      const newAttack = actorAttack + action.count * tierDef.attack;
      const earningGain = bestJobEV(newAttack) - c.currentBestJobEV;
      const netEV =
        earningGain * ACTION_POINTS_PER_WEEK * AI_LOOKAHEAD_WEEKS -
        totalHireCost -
        action.count * tierDef.weeklyPayroll * AI_LOOKAHEAD_WEEKS;
      evScore = Math.round(netEV / 100);

      // Turf Score: Added combat strength enables turf expansion and defense
      const combatPower = action.count * (tierDef.attack + tierDef.defense);
      turfScore = Math.round(combatPower * 1.5);

      // Warlords love recruiting muscle
      if (actor.archetypeId === 'warlord') {
        turfScore += 15;
      }

      // Hard Survival Override: If Sunday cash < Payroll, RECRUIT is clamped to -999
      if (isPayrollEmergency) {
        emergencyModifiers = -999;
        reasoning = `Survival clamp: Cannot recruit ${action.count}x ${tierDef.name} due to Sunday payroll deficit`;
      } else {
        reasoning = `Recruiting ${action.count}x ${tierDef.name} for combat strength (Power +${combatPower}, ${AI_LOOKAHEAD_WEEKS}-wk net EV $${Math.round(netEV)})`;
      }
      break;
    }

    case 'LAUNDER': {
      // 25% fee converts amount to 75% clean cash. Clean cash is valued 2x in valuation!
      // Net valuation gain: 2 * 0.75 * amount - 1.0 * amount = +0.5 * amount
      const valuationGain = Math.round((action.amount * 0.5) / 100);
      evScore = valuationGain;

      // If Heat >= 70, clean cash is immune to 20% police raids on dirty cash
      if (actor.heat >= 70) {
        evScore += Math.round((action.amount * 0.2) / 100);
      }

      // Bankers prioritize laundering
      if (actor.archetypeId === 'banker') {
        evScore += 20;
      }

      reasoning = `Laundering $${action.amount} DirtyCash to CleanCash (Valuation gain +${valuationGain}, raid immunity)`;
      break;
    }

    case 'BRIBE': {
      const cost = action.useClean ? BRIBE_CLEAN_COST : BRIBE_DIRTY_COST;
      evScore = -Math.round(cost / 200);

      if (!action.targetSyndicateId) {
        // Heat reduction on self (-22 Heat)
        // Subtracted in TotalScore: - (HeatRisk_Score * caution), so negative score becomes a bonus
        heatRiskScore = actor.heat >= 60 ? -60 : -35;

        // Hard Survival Override: Heat >= 80 gives +75 emergency utility; a RICO strike projected
        // for this Sunday makes the bribe outrank everything (AI_RICO_EMERGENCY).
        if (isRicoEmergency) {
          emergencyModifiers = AI_RICO_EMERGENCY;
          reasoning = `RICO emergency: Heat ${actor.heat}% projected to hit 100 this Sunday (+${AI_RICO_EMERGENCY} Emergency)`;
        } else if (isHeatEmergency) {
          emergencyModifiers = 75;
          reasoning = `Emergency Heat reduction: Heat at ${actor.heat}% poses immediate RICO indictment danger (+75 Emergency)`;
        } else {
          reasoning = `Bribing officials to reduce Heat by -22 (Current Heat: ${actor.heat}%)`;
        }
      } else {
        // Frame rival (+12 Heat on rival)
        const targetRival = state.syndicates[action.targetSyndicateId];
        turfScore = 15;

        if (targetRival) {
          // Extra value if pushing rival into raid territory or RICO
          if (targetRival.heat >= 70) {
            turfScore += 30;
          }

          // Grudge revenge
          const grudge = actor.grudge[targetRival.id] ?? 0;
          grudgeScore = Math.round(grudge * 0.8);

          // Anti-Leader Coalition: +40 bonus for framing leader
          if (leaderId && leaderId !== actor.id && targetRival.id === leaderId) {
            coalitionBonus = 40;
          }

          // The Rat specializes in framing rivals
          if (actor.archetypeId === 'rat') {
            turfScore += 25;
          }

          reasoning = `Framing rival ${targetRival.name} with +12 Heat (Target Heat: ${targetRival.heat}%${coalitionBonus ? ', Coalition +40' : ''})`;
        }
      }
      break;
    }

    case 'WIRETAP': {
      evScore = -10;
      turfScore = 8;
      const targetRival = state.syndicates[action.targetSyndicateId];
      reasoning = `Wiretapping ${targetRival?.name ?? action.targetSyndicateId} for 3 weeks of intent and wallet visibility`;
      break;
    }

    case 'PASS': {
      evScore = 0;
      turfScore = 0;
      heatRiskScore = 0;
      grudgeScore = 0;
      emergencyModifiers = 0;
      coalitionBonus = 0;
      reasoning = 'Passing Action Point (preserving resources)';
      break;
    }
  }

  // Liquidity guard (AI judgement, symmetric rules): never commit cash that would leave less than
  // payroll (incl. any new hires) + AI_CASH_RESERVE on hand. Sunday yield is not counted because a
  // rival can seize the racket before Sunday. A self-BRIBE in a heat/RICO emergency only has to
  // keep payroll covered.
  const cost = upfrontCost(action);
  if (cost > 0 && emergencyModifiers > -900) {
    const addedPayroll =
      action.type === 'RECRUIT' ? action.count * CREW_BY_ID[action.tier].weeklyPayroll : 0;
    const isSelfBribeEmergency =
      action.type === 'BRIBE' && !action.targetSyndicateId && (isHeatEmergency || isRicoEmergency);
    const floor = payroll + addedPayroll + (isSelfBribeEmergency ? 0 : AI_CASH_RESERVE);
    if (c.totalCash - cost < floor) {
      emergencyModifiers = -999;
      reasoning = `Liquidity clamp: spending $${cost} would leave less than $${floor} for payroll + reserve (${reasoning})`;
    }
  }

  // Calculate TotalScore using the specification formula
  let totalScore: number;
  if (emergencyModifiers <= -900) {
    totalScore = -999;
  } else {
    totalScore = Math.round(
      evScore * weights.greed +
        turfScore * weights.aggression -
        heatRiskScore * weights.caution +
        grudgeScore * weights.revenge +
        emergencyModifiers +
        coalitionBonus
    );
  }

  const scores: DecisionTraceScores = {
    evScore,
    turfScore,
    heatRiskScore,
    grudgeScore,
    emergencyModifiers,
    coalitionBonus,
    totalScore,
  };

  return {
    action,
    scores,
    reasoning,
  };
}

/**
 * Deterministic tie-breaker priority for actions.
 */
function getActionTypePriority(type: Action['type']): number {
  switch (type) {
    case 'BRIBE':
      return 7;
    case 'SEIZE':
      return 6;
    case 'EXTORT':
      return 5;
    case 'LAUNDER':
      return 4;
    case 'RECRUIT':
      return 3;
    case 'WIRETAP':
      return 2;
    case 'PASS':
      return 1;
  }
}

/**
 * Generates an invariant key for tie-breaking comparison.
 */
function getActionTieKey(action: Action): string {
  switch (action.type) {
    case 'EXTORT':
      return `EXTORT_${action.jobId}_${action.prepTier}`;
    case 'SEIZE':
      return `SEIZE_${action.racketId}_${action.prepTier}`;
    case 'RECRUIT':
      return `RECRUIT_${action.tier}_${action.count}`;
    case 'LAUNDER':
      return `LAUNDER_${action.amount}`;
    case 'BRIBE':
      return `BRIBE_${action.useClean ? 'CLEAN' : 'DIRTY'}_${action.targetSyndicateId ?? 'SELF'}`;
    case 'WIRETAP':
      return `WIRETAP_${action.targetSyndicateId}`;
    case 'PASS':
      return 'PASS';
  }
}

/**
 * Deterministic ranking: TotalScore desc, then action-type priority desc, then tie key asc.
 * Negative when `a` ranks ahead of `b`.
 */
export function compareScoredActions(a: ScoredAction, b: ScoredAction): number {
  if (b.scores.totalScore !== a.scores.totalScore) {
    return b.scores.totalScore - a.scores.totalScore;
  }
  const prioA = getActionTypePriority(a.action.type);
  const prioB = getActionTypePriority(b.action.type);
  if (prioB !== prioA) {
    return prioB - prioA;
  }
  return getActionTieKey(a.action).localeCompare(getActionTieKey(b.action));
}

function scoreAllCandidates(state: GameState, syndicateId: string): ScoredAction[] {
  const candidates = generateCandidateActions(state, syndicateId);
  if (candidates.length === 0) return [];
  const ctx = buildScoringContext(state, syndicateId);
  return candidates.map((action) => scoreCandidateAction(state, syndicateId, action, ctx));
}

/**
 * Evaluates and scores all legal candidate actions, sorted by TotalScore descending.
 */
export function evaluateCandidateActions(
  state: GameState,
  syndicateId: string
): ScoredAction[] {
  return scoreAllCandidates(state, syndicateId).sort(compareScoredActions);
}

/**
 * Selects the single highest utility action for a syndicate and produces a logged DecisionTrace.
 * Linear scan with the same comparator as evaluateCandidateActions (identical pick, no full sort).
 */
export function selectBestAIAction(
  state: GameState,
  syndicateId: string
): { action: Action; trace: DecisionTrace } {
  const scored = scoreAllCandidates(state, syndicateId);
  let top: ScoredAction | undefined;
  for (const candidate of scored) {
    if (!top || compareScoredActions(candidate, top) < 0) top = candidate;
  }
  const best = top ?? {
    action: { type: 'PASS' } as Action,
    scores: {
      evScore: 0,
      turfScore: 0,
      heatRiskScore: 0,
      grudgeScore: 0,
      emergencyModifiers: 0,
      coalitionBonus: 0,
      totalScore: 0,
    },
    reasoning: 'No viable action available; passing turn',
  };

  const trace: DecisionTrace = {
    week: state.week,
    syndicateId,
    action: best.action,
    scores: best.scores,
    reasoning: best.reasoning,
  };

  return { action: best.action, trace };
}

/**
 * Appends a trace without mutating the caller's state: pushes onto the fresh clone when the
 * action executed, otherwise returns a shallow copy of the (unchanged) input state.
 */
function appendTrace(nextState: GameState, prevState: GameState, trace: DecisionTrace): GameState {
  if (nextState !== prevState) {
    nextState.decisionTraces.push(trace);
    return nextState;
  }
  return { ...prevState, decisionTraces: [...prevState.decisionTraces, trace] };
}

/**
 * Executes a single AI Action Point (1 AP) for a syndicate via applyAction(),
 * appending the resulting DecisionTrace. Maintains 100% zero-cheat symmetry.
 */
export function executeAIAction(
  state: GameState,
  syndicateId: string
): { state: GameState; trace: DecisionTrace; result: ActionResult } {
  const { action, trace } = selectBestAIAction(state, syndicateId);
  const { state: nextState, result } = applyAction(state, syndicateId, action);
  return { state: appendTrace(nextState, state, trace), trace, result };
}

/**
 * Executes all remaining Action Points for a single syndicate until 0 AP or pass.
 */
export function executeAITurn(
  state: GameState,
  syndicateId: string
): { state: GameState; traces: DecisionTrace[] } {
  let currentState = state;
  const traces: DecisionTrace[] = [];

  while (
    (currentState.syndicates[syndicateId]?.actionPoints ?? 0) > 0 &&
    !currentState.syndicates[syndicateId]?.isEliminated &&
    !currentState.isGameOver
  ) {
    const { action, trace } = selectBestAIAction(currentState, syndicateId);
    const { state: nextState, result } = applyAction(currentState, syndicateId, action);
    currentState = appendTrace(nextState, currentState, trace);
    traces.push(trace);

    // Conclude the turn on PASS or a rejected action. A botched SEIZE is executed
    // (resources spent) but unsuccessful, so the turn continues.
    if (action.type === 'PASS' || !result.executed) {
      break;
    }
  }

  return { state: currentState, traces };
}

/**
 * Executes the full weekly AI Action Phase in descending order of current valuation,
 * executing actions 1 AP at a time until all AI syndicates reach 0 AP or pass.
 */
export function executeAllAITurns(state: GameState): {
  state: GameState;
  traces: DecisionTrace[];
} {
  let currentState = state;
  const allTraces: DecisionTrace[] = [];

  // Identify all living AI syndicates
  const livingAIs = Object.values(currentState.syndicates).filter(
    (s) => !s.isPlayer && !s.isEliminated
  );

  // Sort descending by current Valuation
  livingAIs.sort((a, b) => {
    const valA = calculateSyndicateValuation(a, currentState.rackets);
    const valB = calculateSyndicateValuation(b, currentState.rackets);
    return valB - valA;
  });

  for (const ai of livingAIs) {
    if (currentState.isGameOver) break;
    const { state: updatedState, traces } = executeAITurn(currentState, ai.id);
    currentState = updatedState;
    allTraces.push(...traces);
  }

  return { state: currentState, traces: allTraces };
}
