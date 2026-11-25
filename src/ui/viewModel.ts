// Pure view-model helpers for the greybox UI (no React, no DOM).

import { CREW_TIERS, JOBS_BY_ID } from '../data';
import { SIEGE_LEAD_WEEKS } from '../engine/constants';
import { calculateSyndicateAttack, calculateSyndicatePayroll } from '../engine/crew';
import { calculateRiskProbabilities } from '../engine/risk';
import {
  calculateProjectedRacketYield,
  countOwnedRackets,
  hasDistrictMonopoly,
  racketDefenseBreakdown,
  turfUpkeep,
} from '../engine/reducer';
import type {
  Action,
  DecisionTrace,
  GameState,
  RiskProbabilities,
} from '../engine/types';

export const PLAYER_ID = 'player';

/**
 * Live roll preview for risk-rolled actions (EXTORT / SEIZE), mirroring applyAction's math.
 * Returns null for actions that have no roll or reference unknown ids.
 */
export function rollPreview(state: GameState, syndicateId: string, action: Action): RiskProbabilities | null {
  const actor = state.syndicates[syndicateId];
  if (!actor) return null;
  const attack = calculateSyndicateAttack(actor.crew);

  if (action.type === 'EXTORT') {
    const job = JOBS_BY_ID[action.jobId];
    return job ? calculateRiskProbabilities(attack, job.difficultyDef, action.prepTier) : null;
  }
  if (action.type === 'SEIZE') {
    if (!state.rackets[action.racketId]) return null;
    // Exact engine defense incl. the owner's crew garrison (M3-T1). Greybox / dev view only; the
    // shadcn ledger uses the fog-aware siegeModel.visibleRaidDefense instead.
    return calculateRiskProbabilities(attack, racketDefenseBreakdown(state, action.racketId).total, action.prepTier);
  }
  return null;
}

export function formatPreview(p: RiskProbabilities | null): string {
  return p ? `Clean ${p.clean}% / Messy ${p.messy}% / Botched ${p.botched}%` : '—';
}

export interface RacketRow {
  id: string;
  name: string;
  district: string;
  ownerId: string | null;
  ownerName: string;
  dirtyYield: number;
  defense: number;
  passiveHeat: number;
  damaged: boolean;
  monopoly: boolean;
}

export function buildRacketRows(state: GameState): RacketRow[] {
  return Object.values(state.rackets).map((r) => {
    const owner = r.ownerId ? state.syndicates[r.ownerId] : undefined;
    return {
      id: r.id,
      name: r.name,
      district: r.district,
      ownerId: r.ownerId,
      ownerName: owner ? owner.name : 'Neutral',
      dirtyYield: r.dirtyYield,
      defense: racketDefenseBreakdown(state, r.id).total,
      passiveHeat: r.passiveHeat,
      damaged: r.damagedTurnsRemaining > 0,
      monopoly: r.ownerId !== null && hasDistrictMonopoly(r.ownerId, r.district, state.rackets),
    };
  });
}

export function describeAction(action: Action): string {
  switch (action.type) {
    case 'EXTORT':
      return `EXTORT ${JOBS_BY_ID[action.jobId]?.name ?? action.jobId} (prep ${action.prepTier})`;
    case 'SEIZE':
      return `SEIZE ${action.racketId} (prep ${action.prepTier})`;
    case 'RECRUIT':
      return `RECRUIT ${action.count}x ${action.tier}`;
    case 'LAUNDER':
      return `LAUNDER $${action.amount}`;
    case 'BRIBE':
      return action.targetSyndicateId
        ? `BRIBE (frame ${action.targetSyndicateId}, ${action.useClean ? 'clean' : 'dirty'})`
        : `BRIBE (reduce own heat, ${action.useClean ? 'clean' : 'dirty'})`;
    case 'WIRETAP':
      return `WIRETAP ${action.targetSyndicateId}`;
    case 'PASS':
      return 'PASS';
  }
}

export interface TraceRow {
  key: string;
  week: number;
  syndicateId: string;
  action: string;
  total: number;
  breakdown: string;
  reasoning: string;
}

/** Most recent traces first, capped to `limit`. */
export function buildTraceRows(traces: readonly DecisionTrace[], limit = 60): TraceRow[] {
  const rows: TraceRow[] = [];
  for (let i = traces.length - 1; i >= 0 && rows.length < limit; i--) {
    const t = traces[i]!;
    const s = t.scores;
    rows.push({
      key: `${i}`,
      week: t.week,
      syndicateId: t.syndicateId,
      action: describeAction(t.action),
      total: s.totalScore,
      breakdown: `EV ${s.evScore} / Turf ${s.turfScore} / Heat ${s.heatRiskScore} / Grudge ${s.grudgeScore} / Emerg ${s.emergencyModifiers} / Coal ${s.coalitionBonus}`,
      reasoning: t.reasoning,
    });
  }
  return rows;
}

export function unlockedCrewTiers(ownedRackets: number) {
  return CREW_TIERS.filter((t) => ownedRackets >= t.requiredRackets);
}

export type SiegeDirection = 'incoming' | 'outgoing' | 'rival';

export interface SiegeRow {
  id: string;
  direction: SiegeDirection;
  attackerName: string;
  racketName: string;
  ownerName: string;
  prepTier: number;
  telegraphedWeek: number;
  resolveWeek: number;
  /** Attacker's odds against the racket as things stand now (they are rolled at resolve). */
  odds: string;
}

/**
 * Active sieges visible to `viewerId`: sieges against the viewer's turf and the viewer's own
 * sieges always; rival-vs-rival sieges only while the viewer wiretaps the attacker or the
 * defender, or when `showAll` (DEV) is on.
 */
export function buildSiegeRows(state: GameState, viewerId: string, showAll = false): SiegeRow[] {
  const viewer = state.syndicates[viewerId];
  const rows: SiegeRow[] = [];
  for (const siege of state.activeSieges) {
    const racket = state.rackets[siege.racketId];
    const attacker = state.syndicates[siege.attackerId];
    if (!racket || !attacker) continue;
    const ownerId = racket.ownerId;
    const direction: SiegeDirection =
      ownerId === viewerId ? 'incoming' : siege.attackerId === viewerId ? 'outgoing' : 'rival';
    if (direction === 'rival' && !showAll) {
      const taps = viewer?.wiretapTurnsRemaining ?? {};
      const tapped = (taps[siege.attackerId] ?? 0) > 0 || (ownerId !== null && (taps[ownerId] ?? 0) > 0);
      if (!tapped) continue;
    }
    const owner = ownerId ? state.syndicates[ownerId] : undefined;
    const defense = racketDefenseBreakdown(state, racket.id).total;
    rows.push({
      id: siege.id,
      direction,
      attackerName: attacker.name,
      racketName: racket.name,
      ownerName: owner ? owner.name : 'Neutral',
      prepTier: siege.prepTier,
      telegraphedWeek: siege.telegraphedWeek,
      resolveWeek: siege.resolveWeek,
      odds: formatPreview(calculateRiskProbabilities(calculateSyndicateAttack(attacker.crew), defense, siege.prepTier)),
    });
  }
  return rows.sort((a, b) => a.resolveWeek - b.resolveWeek || a.id.localeCompare(b.id));
}

export interface SundayBill {
  crewPayroll: number;
  turfUpkeep: number;
  ownedRackets: number;
  total: number;
  projectedYield: number;
}

/** What a syndicate owes and earns this Sunday (Crew Payroll + Turf Upkeep vs racket yield). */
export function buildSundayBill(state: GameState, syndicateId: string): SundayBill | null {
  const s = state.syndicates[syndicateId];
  if (!s) return null;
  const ownedRackets = countOwnedRackets(syndicateId, state.rackets);
  const crewPayroll = calculateSyndicatePayroll(s.crew);
  const upkeep = turfUpkeep(ownedRackets);
  return {
    crewPayroll,
    turfUpkeep: upkeep,
    ownedRackets,
    total: crewPayroll + upkeep,
    projectedYield: calculateProjectedRacketYield(syndicateId, state.rackets),
  };
}

/** Week a SEIZE declared now would resolve: this week if neutral, week + 2 if rival-owned. */
export function seizeResolveWeek(state: GameState, racketId: string): number {
  const racket = state.rackets[racketId];
  return racket?.ownerId ? state.week + SIEGE_LEAD_WEEKS : state.week;
}
