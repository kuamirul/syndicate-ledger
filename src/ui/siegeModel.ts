// Fog-of-war aware raid (siege) view-model for the Businesses & Raids tab (M2-T3).
// No React / store imports. Rules: raids against the viewer's businesses and the viewer's own raids
// are always visible; rival-vs-rival raids need an active Spy on the attacker or the defender, or DEV.

import { MAX_OUTGOING_SIEGES } from '../engine/constants';
import { calculateSyndicateAttack } from '../engine/crew';
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
    const defense = racket.baseDefense + (owner?.assignedGuards[racket.id] ?? 0);
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
      odds: calculateRiskProbabilities(calculateSyndicateAttack(attacker.crew), defense, siege.prepTier),
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
