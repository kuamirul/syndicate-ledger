// Pure view-model for the Businesses & Raids tab (M2-T3). No React / store imports.
// Marginal numbers reuse the engine's own yield / upkeep / Heat functions, so they cannot drift from
// advanceWeek(). applyAction stays the only legality authority; turfModel.test.ts checks every
// enabled action against it.

import { RACKETS_BY_DISTRICT } from '../data';
import {
  ASSAULT_BASE_COST,
  EMPIRE_FREE_RACKETS,
  EMPIRE_HEAT_PER_RACKET,
  MAX_OUTGOING_SIEGES,
  MAX_WEEKS,
  SIEGE_LEAD_WEEKS,
} from '../engine/constants';
import { calculateTotalCrewCount } from '../engine/crew';
import {
  calculateProjectedRacketYield,
  countOwnedRackets,
  hasDistrictMonopoly,
  turfUpkeep,
} from '../engine/reducer';
import type { DistrictId, GameState, PrepTier, RacketState, RiskOutcome } from '../engine/types';
import { verbLock } from './guidedIntro';
import { buildPrepTierOptions, canAct, noActionReason, type OutcomeConsequence, type PrepTierOption } from './operationsModel';
import { selectVisibleSieges } from './siegeModel';
import { DISTRICT_NAMES, SPEND_TERMS, TURF_TERMS } from './terms';
import { rollPreview } from './viewModel';

export const DISTRICT_ORDER: readonly DistrictId[] = ['docks', 'neon_strip', 'industrial', 'uptown'];

export interface MarginalImpact {
  /** Weekly income the business adds (includes any +25% District Bonus it completes). */
  grossGain: number;
  /** Part of `grossGain` that comes from completing a District monopoly. */
  monopolyDelta: number;
  /** Extra Size Tax (Turf Upkeep) per Sunday from owning one more business. */
  sizeTaxDelta: number;
  /** grossGain - sizeTaxDelta. */
  netWeekly: number;
  /** Extra Police Heat per Sunday (business passive Heat + Empire Heat step). */
  heatDelta: number;
  ownedAfter: number;
  /** Net income is negative: the business loses money every Sunday. */
  exceedsIncome: boolean;
}

/** Marginal weekly effect of `racketId` joining `syndicateId`'s empire (clean, undamaged take). */
export function marginalImpact(state: GameState, syndicateId: string, racketId: string): MarginalImpact | null {
  const racket = state.rackets[racketId];
  if (!racket) return null;
  const before = countOwnedRackets(syndicateId, state.rackets);
  const after = before + (racket.ownerId === syndicateId ? 0 : 1);
  const hypothetical: Record<string, RacketState> = { ...state.rackets, [racketId]: { ...racket, ownerId: syndicateId, damagedTurnsRemaining: 0 } };
  const grossGain =
    calculateProjectedRacketYield(syndicateId, hypothetical) - calculateProjectedRacketYield(syndicateId, state.rackets);
  const sizeTaxDelta = turfUpkeep(after) - turfUpkeep(before);
  const empireStep = (n: number) => Math.max(0, (n - EMPIRE_FREE_RACKETS) * EMPIRE_HEAT_PER_RACKET);
  const netWeekly = grossGain - sizeTaxDelta;
  return {
    grossGain,
    monopolyDelta: grossGain - racket.dirtyYield,
    sizeTaxDelta,
    netWeekly,
    heatDelta: racket.passiveHeat + empireStep(after) - empireStep(before),
    ownedAfter: after,
    exceedsIncome: netWeekly < 0,
  };
}

export type CardKind = 'claim' | 'raid' | 'yours';

export interface BusinessCard {
  id: string;
  name: string;
  district: DistrictId;
  kind: CardKind;
  ownerId: string | null;
  /** "Unowned", "Yours" or the rival's name. */
  ownerLabel: string;
  baseValue: number;
  defense: number;
  /** Weekly income this business pays its owner right now (damaged = half). */
  grossWeekly: number;
  damaged: boolean;
  impact: MarginalImpact | null;
  /** Prep tier table (claim / raid only); empty for owned businesses. */
  tiers: PrepTierOption[];
  /** Why the action is unavailable regardless of prep tier (cash is per tier), else null. */
  disabledReason: string | null;
  /** Guided Intro lock badge ("Unlocks Week 4") when the raid verb is locked. */
  lockBadge: string | null;
  /** True when the free ($0 prep) action can be clicked now. */
  canRunFree: boolean;
  resolveWeek: number;
  /** A raid on this business that the viewer can see, e.g. "Iron Syndicate raid lands Week 6". */
  raidNote: string | null;
}

export interface DistrictCard {
  id: DistrictId;
  name: string;
  playerOwned: number;
  total: number;
  monopoly: boolean;
  /** "1 away from +25% District Bonus" when exactly one business is missing and none is a rival's. */
  awayHint: string | null;
  cards: BusinessCard[];
}

/** Why `syndicateId` cannot start `kind` on `racket` for any prep tier (null = cash decides). */
export function turfDisabledReason(
  state: GameState,
  syndicateId: string,
  racket: RacketState,
  guidedIntro: boolean
): string | null {
  const actor = state.syndicates[syndicateId];
  if (!actor) return 'Syndicate not found';
  if (racket.ownerId === syndicateId) return 'You already own this business';
  const isRaid = racket.ownerId !== null;
  if (isRaid) {
    const lock = verbLock('stageRaid', state.week, guidedIntro);
    if (lock.locked) return lock.badge ?? TURF_TERMS.raidLock;
  }
  if (!canAct(state, syndicateId)) return noActionReason(state, syndicateId);
  if (calculateTotalCrewCount(actor.crew) === 0) return SPEND_TERMS.requiresCrew;
  if (isRaid) {
    if (state.week + SIEGE_LEAD_WEEKS > MAX_WEEKS) return `Too late: a raid must land by Week ${MAX_WEEKS}`;
    const outgoing = state.activeSieges.filter((s) => s.attackerId === syndicateId);
    if (outgoing.some((s) => s.racketId === racket.id)) return 'Already raiding this business';
    if (outgoing.length >= MAX_OUTGOING_SIEGES) return `All ${MAX_OUTGOING_SIEGES} raid slots in use`;
  }
  return null;
}

export function selectDistrictCards(
  state: GameState,
  playerId: string,
  guidedIntro: boolean,
  devOmniscient: boolean
): DistrictCard[] {
  const visible = selectVisibleSieges(state, playerId, devOmniscient);
  const allVisible = [...visible.incoming, ...visible.outgoing, ...visible.rivalVsRival];

  return DISTRICT_ORDER.map((district) => {
    const defs = RACKETS_BY_DISTRICT[district];
    const rackets = defs.map((d) => state.rackets[d.id]).filter((r): r is RacketState => !!r);
    const playerOwned = rackets.filter((r) => r.ownerId === playerId).length;
    const rivalHeld = rackets.some((r) => r.ownerId !== null && r.ownerId !== playerId);
    const monopoly = hasDistrictMonopoly(playerId, district, state.rackets);

    const cards = rackets.map((racket): BusinessCard => {
      const owner = racket.ownerId ? state.syndicates[racket.ownerId] : undefined;
      const kind: CardKind = racket.ownerId === playerId ? 'yours' : racket.ownerId ? 'raid' : 'claim';
      const defense = racket.baseDefense + (owner?.assignedGuards[racket.id] ?? 0);
      const damaged = racket.damagedTurnsRemaining > 0;
      const ownerMonopoly = racket.ownerId ? hasDistrictMonopoly(racket.ownerId, district, state.rackets) : false;
      const baseYield = ownerMonopoly ? Math.floor(racket.dirtyYield * 1.25) : racket.dirtyYield;
      const grossWeekly = damaged ? Math.floor(baseYield * 0.5) : baseYield;

      const disabledReason = kind === 'yours' ? null : turfDisabledReason(state, playerId, racket, guidedIntro);
      const tiers =
        kind === 'yours'
          ? []
          : buildPrepTierOptions(state, playerId, ASSAULT_BASE_COST, (tier: PrepTier) =>
              rollPreview(state, playerId, { type: 'SEIZE', racketId: racket.id, prepTier: tier })
            );
      const free = tiers.find((t) => t.tier === 0);
      const lock = kind === 'raid' ? verbLock('stageRaid', state.week, guidedIntro) : { locked: false };
      const raid = allVisible.find((s) => s.racketId === racket.id);

      return {
        id: racket.id,
        name: racket.name,
        district,
        kind,
        ownerId: racket.ownerId,
        ownerLabel: kind === 'yours' ? 'Yours' : owner ? owner.name : 'Unowned',
        baseValue: racket.baseValue,
        defense,
        grossWeekly,
        damaged,
        impact: kind === 'yours' ? null : marginalImpact(state, playerId, racket.id),
        tiers,
        disabledReason,
        lockBadge: lock.locked ? (lock.badge ?? TURF_TERMS.raidLock) : null,
        canRunFree: disabledReason === null && !!free && free.disabledReason === null,
        resolveWeek: kind === 'raid' ? state.week + SIEGE_LEAD_WEEKS : state.week,
        raidNote: raid ? `${raid.attackerName} raid lands start of Week ${raid.resolveWeek}` : null,
      };
    });

    return {
      id: district,
      name: DISTRICT_NAMES[district] ?? district,
      playerOwned,
      total: rackets.length,
      monopoly,
      awayHint:
        !monopoly && !rivalHeld && playerOwned === rackets.length - 1
          ? `1 away from ${TURF_TERMS.monopolyActive.replace(' Active', '')}`
          : null,
      cards,
    };
  });
}

/** Per-outcome consequences for a claim (instant) or raid (queued). Takeovers add no Police Heat. */
export function turfConsequences(card: BusinessCard, totalCrew: number): Record<RiskOutcome, OutcomeConsequence> {
  const raid = card.kind === 'raid';
  return {
    CLEAN: { gain: 'Take the business', crewLost: 0, heat: 0 },
    MESSY: {
      gain: `Take it, damaged: half income for 1 week${raid ? '; rival grudge +15' : ''}`,
      crewLost: Math.min(1, totalCrew),
      heat: 0,
    },
    BOTCHED: {
      gain: `Takeover fails${raid ? '; rival grudge +25' : ''}`,
      crewLost: Math.min(2, totalCrew),
      heat: 0,
    },
  };
}
