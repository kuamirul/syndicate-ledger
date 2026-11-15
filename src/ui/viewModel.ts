// Pure view-model helpers for the greybox UI (no React, no DOM).

import { CREW_TIERS, JOBS_BY_ID } from '../data';
import { calculateSyndicateAttack } from '../engine/crew';
import { calculateRiskProbabilities } from '../engine/risk';
import { hasDistrictMonopoly } from '../engine/reducer';
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
    const racket = state.rackets[action.racketId];
    if (!racket) return null;
    let defense = racket.baseDefense;
    const owner = racket.ownerId ? state.syndicates[racket.ownerId] : undefined;
    if (owner) defense += owner.assignedGuards[racket.id] ?? 0;
    return calculateRiskProbabilities(attack, defense, action.prepTier);
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
    const guards = owner?.assignedGuards[r.id] ?? 0;
    return {
      id: r.id,
      name: r.name,
      district: r.district,
      ownerId: r.ownerId,
      ownerName: owner ? owner.name : 'Neutral',
      dirtyYield: r.dirtyYield,
      defense: r.baseDefense + guards,
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
