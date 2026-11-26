// Fog-of-war aware raid (siege) view-model for the Businesses & Raids tab (M2-T3).
// No React / store imports. Rules: raids against the viewer's businesses and the viewer's own raids
// are always visible; rival-vs-rival raids need an active Spy on the attacker or the defender, or DEV.
// M3-T1 Crew Defense: a business's guard defense is private to its owner. The viewer sees exact
// guards on its own businesses, neutral ones (0) and those of a Spied owner (or DEV); otherwise odds
// use the public base defense only and the row is flagged `guardsHidden`. Attacker odds keep the
// existing M2-T3 rule (the attacker's current crew).

import { MAX_OUTGOING_SIEGES } from '../engine/constants';
import { calculateSyndicateAttack } from '../engine/crew';
import { racketDefenseBreakdown } from '../engine/reducer';
import { calculateRiskProbabilities } from '../engine/risk';
import type { GameState, PrepTier, RiskProbabilities } from '../engine/types';

export type RaidDirection = 'incoming' | 'outgoing' | 'rival';

export interface VisibleSiege {
  id: string;
  direction: RaidDirection;
  attackerId: string;
  attackerName: string;
  racketId: string;
  racketName: string;
  ownerId: string | null;
  ownerName: string;
  prepTier: PrepTier;
  telegraphedWeek: number;
  /** Start of this week the raid resolves. */
  resolveWeek: number;
  /** Attacker's odds against the business as it stands now (the roll happens at resolve). */
  odds: RiskProbabilities;
  /** Defense behind `odds`, as far as the viewer may know it. */
  defense: VisibleDefense;
}

export interface VisibleDefense {
  baseDefense: number;
  /** Owner's crew guard defense, or null while hidden by Fog-of-War. */
  guardDefense: number | null;
  /** baseDefense + guardDefense (base only while guards are hidden). */
  total: number;
  guardsHidden: boolean;
}

export interface VisibleSieges {
  incoming: VisibleSiege[];
  outgoing: VisibleSiege[];
  rivalVsRival: VisibleSiege[];
  outgoingSlots: { used: number; max: number };
}

export function isSpied(state: GameState, viewerId: string, targetId: string): boolean {
  return (state.syndicates[viewerId]?.wiretapTurnsRemaining[targetId] ?? 0) > 0;
}

/** Raid defense of `racketId` as `viewerId` may know it (see the file header). */
export function visibleRaidDefense(
  state: GameState,
  viewerId: string,
  racketId: string,
  devOmniscient: boolean
): VisibleDefense {
  const exact = racketDefenseBreakdown(state, racketId);
  const ownerId = state.rackets[racketId]?.ownerId ?? null;
  const known = ownerId === null || ownerId === viewerId || devOmniscient || isSpied(state, viewerId, ownerId);
  return known
    ? { baseDefense: exact.baseDefense, guardDefense: exact.guardDefense, total: exact.total, guardsHidden: false }
    : { baseDefense: exact.baseDefense, guardDefense: null, total: exact.baseDefense, guardsHidden: true };
}

export function selectVisibleSieges(state: GameState, viewerId: string, devOmniscient: boolean): VisibleSieges {
  const incoming: VisibleSiege[] = [];
  const outgoing: VisibleSiege[] = [];
  const rivalVsRival: VisibleSiege[] = [];
  let used = 0;

  for (const siege of state.activeSieges) {
    const racket = state.rackets[siege.racketId];
    const attacker = state.syndicates[siege.attackerId];
    if (!racket || !attacker) continue;
    if (siege.attackerId === viewerId) used++;

    const ownerId = racket.ownerId;
    const direction: RaidDirection =
      ownerId === viewerId ? 'incoming' : siege.attackerId === viewerId ? 'outgoing' : 'rival';
    if (
      direction === 'rival' &&
      !devOmniscient &&
      !isSpied(state, viewerId, siege.attackerId) &&
      !(ownerId !== null && isSpied(state, viewerId, ownerId))
    ) {
      continue;
    }
    const owner = ownerId ? state.syndicates[ownerId] : undefined;
    const defense = visibleRaidDefense(state, viewerId, racket.id, devOmniscient);
    const row: VisibleSiege = {
      id: siege.id,
      direction,
      attackerId: attacker.id,
      attackerName: attacker.name,
      racketId: racket.id,
      racketName: racket.name,
      ownerId,
      ownerName: owner ? owner.name : 'Unowned',
      prepTier: siege.prepTier,
      telegraphedWeek: siege.telegraphedWeek,
      resolveWeek: siege.resolveWeek,
      odds: calculateRiskProbabilities(calculateSyndicateAttack(attacker.crew), defense.total, siege.prepTier),
      defense,
    };
    (direction === 'incoming' ? incoming : direction === 'outgoing' ? outgoing : rivalVsRival).push(row);
  }

  const order = (a: VisibleSiege, b: VisibleSiege) => a.resolveWeek - b.resolveWeek || a.id.localeCompare(b.id);
  return {
    incoming: incoming.sort(order),
    outgoing: outgoing.sort(order),
    rivalVsRival: rivalVsRival.sort(order),
    outgoingSlots: { used, max: MAX_OUTGOING_SIEGES },
  };
}
