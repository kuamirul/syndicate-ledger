// Pure view-model for the Rivals & Spying tab (M2-T3). No React / store imports.
// Fog of war: a rival's private numbers are `null` unless the viewer has an active Spy on them or
// DEV is on, so the UI cannot leak them by accident.

import { ARCHETYPES_BY_ID, JOBS_BY_ID, RACKETS_BY_ID } from '../data';
import { evaluateCandidateActions } from '../engine/ai';
import { calculateTotalCrewCount } from '../engine/crew';
import { calculateSyndicateValuation, countOwnedRackets } from '../engine/reducer';
import type { Action, ArchetypeWeights, DecisionTraceScores, GameState, SyndicateCrew } from '../engine/types';
import { verbLock, type VerbLock } from './guidedIntro';
import { buildSnitchOptions, buildSpyOption, type SnitchOption, type SpyOption } from './operationsModel';
import { isSpied } from './siegeModel';
import { ARCHETYPE_TAGS, OUTCOME_LABELS, SCORE_COMPONENTS, VERBS } from './terms';

export interface StandingRow {
  id: string;
  name: string;
  isPlayer: boolean;
  rank: number;
  archetypeLabel: string | null;
  /** One-line playstyle summary, e.g. "Aggressive Expansion". */
  tag: string | null;
  businesses: number;
  netWorth: number;
  isEliminated: boolean;
  /** Plain-English elimination reason, null while alive. */
  eliminationLabel: string | null;
}

/** Plain-English one-liner for an action (used by the Decision Sheet). */
export function plainActionLabel(action: Action, state?: GameState): string {
  const name = (id: string) => state?.syndicates[id]?.name ?? id;
  switch (action.type) {
    case 'EXTORT':
      return `${VERBS.runJob.label}: ${JOBS_BY_ID[action.jobId]?.name ?? action.jobId} (guards tier ${action.prepTier})`;
    case 'SEIZE':
      return `Take ${RACKETS_BY_ID[action.racketId]?.name ?? action.racketId} (guards tier ${action.prepTier})`;
    case 'RECRUIT':
      return `Hire ${action.count}x ${action.tier}`;
    case 'LAUNDER':
      return `Bank $${action.amount.toLocaleString('en-US')} Safe Cash`;
    case 'BRIBE':
      return action.targetSyndicateId ? `Snitch on ${name(action.targetSyndicateId)}` : 'Pay Off Cops';
    case 'WIRETAP':
      return `Spy on ${name(action.targetSyndicateId)}`;
    case 'PASS':
      return 'Pass';
  }
}

export interface ScoreRow {
  label: string;
  raw: number;
  weight: number | null;
  /** Signed contribution to the total (raw x weight x sign), one decimal. */
  contribution: number;
}

export interface DecisionRow {
  action: Action;
  label: string;
  rows: ScoreRow[];
  /** Emergency modifiers (added unweighted; -999 means the liquidity clamp fired). */
  emergency: number;
  /** Anti-Leader coalition bonus (added unweighted). */
  coalition: number;
  total: number;
  reasoning: string;
}

export function buildDecisionRow(
  action: Action,
  scores: DecisionTraceScores,
  reasoning: string,
  weights: ArchetypeWeights | null,
  state?: GameState
): DecisionRow {
  const rows: ScoreRow[] = SCORE_COMPONENTS.map((c) => {
    const w = weights ? weights[c.weight] : null;
    const raw = scores[c.key];
    return { label: c.label, raw, weight: w, contribution: Math.round(raw * (w ?? 1) * c.sign * 10) / 10 };
  });
  return {
    action,
    label: plainActionLabel(action, state),
    rows,
    emergency: scores.emergencyModifiers,
    coalition: scores.coalitionBonus,
    total: scores.totalScore,
    reasoning,
  };
}

export interface PrivateIntel {
  dirtyCash: number;
  cleanCash: number;
  crew: SyndicateCrew;
  totalCrew: number;
  heat: number;
  ricoCounter: number;
  /** The rival's grudge toward the viewer, 0-100. */
  grudgeToViewer: number;
  weights: ArchetypeWeights | null;
  /** Week of the rival's most recent logged turn, null if it has not acted yet. */
  lastTurnWeek: number | null;
  /** That turn's chosen actions (one per Action Point), as actually executed. */
  lastTurn: DecisionRow[];
  /** What the rival would pick next if the week ended now (top 3 by score). */
  nextTop3: DecisionRow[];
}

export interface RivalIntel extends StandingRow {
  isRevealed: boolean;
  revealSource: 'spy' | 'dev' | null;
  spyWeeksLeft: number;
  spyLock: VerbLock;
  snitchLock: VerbLock;
  spy: SpyOption | null;
  snitch: SnitchOption[];
  intel: PrivateIntel | null;
}

export interface RivalIntelView {
  standings: StandingRow[];
  rivals: RivalIntel[];
}

function standingFor(state: GameState, id: string, rank: number): StandingRow {
  const s = state.syndicates[id]!;
  const arch = s.archetypeId ? ARCHETYPES_BY_ID[s.archetypeId] : undefined;
  return {
    id,
    name: s.name,
    isPlayer: s.isPlayer,
    rank,
    archetypeLabel: arch ? arch.name : null,
    tag: s.archetypeId ? (ARCHETYPE_TAGS[s.archetypeId] ?? null) : null,
    businesses: countOwnedRackets(id, state.rackets),
    netWorth: calculateSyndicateValuation(s, state.rackets),
    isEliminated: s.isEliminated,
    eliminationLabel: s.eliminationReason ? (OUTCOME_LABELS[s.eliminationReason] ?? s.eliminationReason) : null,
  };
}

export function selectRivalIntel(
  state: GameState,
  playerId: string,
  guidedIntro: boolean,
  devOmniscient: boolean
): RivalIntelView {
  const order = Object.values(state.syndicates)
    .map((s) => ({ id: s.id, dead: s.isEliminated, worth: calculateSyndicateValuation(s, state.rackets) }))
    .sort((a, b) => Number(a.dead) - Number(b.dead) || b.worth - a.worth || a.id.localeCompare(b.id));
  const standings = order.map((o, i) => standingFor(state, o.id, i + 1));

  const rivals: RivalIntel[] = standings
    .filter((row) => row.id !== playerId)
    .map((row) => {
      const s = state.syndicates[row.id]!;
      const spyWeeksLeft = state.syndicates[playerId]?.wiretapTurnsRemaining[row.id] ?? 0;
      const revealSource = isSpied(state, playerId, row.id) ? 'spy' : devOmniscient ? 'dev' : null;

      let intel: PrivateIntel | null = null;
      if (revealSource) {
        const weights = s.archetypeId ? ARCHETYPES_BY_ID[s.archetypeId].weights : null;
        const mine = state.decisionTraces.filter((t) => t.syndicateId === row.id);
        const lastWeek = mine.reduce<number | null>((m, t) => (m === null || t.week > m ? t.week : m), null);
        const lastTurn = mine
          .filter((t) => t.week === lastWeek)
          .map((t) => buildDecisionRow(t.action, t.scores, t.reasoning, weights, state));
        const nextTop3 = s.isEliminated
          ? []
          : evaluateCandidateActions(state, row.id)
              .slice(0, 3)
              .map((c) => buildDecisionRow(c.action, c.scores, c.reasoning, weights, state));
        intel = {
          dirtyCash: s.dirtyCash,
          cleanCash: s.cleanCash,
          crew: { ...s.crew },
          totalCrew: calculateTotalCrewCount(s.crew),
          heat: s.heat,
          ricoCounter: s.ricoCounter,
          grudgeToViewer: s.grudge[playerId] ?? 0,
          weights,
          lastTurnWeek: lastWeek,
          lastTurn,
          nextTop3,
        };
      }

      return {
        ...row,
        isRevealed: revealSource !== null,
        revealSource,
        spyWeeksLeft,
        spyLock: verbLock('spy', state.week, guidedIntro),
        snitchLock: verbLock('snitch', state.week, guidedIntro),
        spy: s.isEliminated ? null : buildSpyOption(state, playerId, row.id),
        snitch: s.isEliminated ? [] : buildSnitchOptions(state, playerId, row.id),
        intel,
      };
    });

  return { standings, rivals };
}
