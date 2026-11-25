// Pure post-run summary selectors (M2-T4). No React / store imports. Lifts fog of war: once the run
// is over for the player, every syndicate's numbers are shown. All text is plain English.

import { ARCHETYPES_BY_ID } from '../data';
import { calculateSyndicateValuation, countOwnedRackets } from '../engine/reducer';
import type { GameState, SyndicateState } from '../engine/types';
import { MATCH_OUTCOME_LABELS, SUMMARY_TERMS } from './terms';

/** The player's run is live while the match is not over and the player has not been eliminated. */
export function isRunLive(state: GameState, playerId: string): boolean {
  const p = state.syndicates[playerId];
  return !state.isGameOver && !!p && !p.isEliminated;
}

export type OutcomeTone = 'win' | 'out' | 'neutral';

export interface StandingLine {
  id: string;
  name: string;
  isPlayer: boolean;
  rank: number;
  archetypeLabel: string | null;
  businesses: number;
  streetCash: number;
  safeCash: number;
  /** Safe Cash counts double toward Net Worth. */
  safeCashScore: number;
  businessesValue: number;
  netWorth: number;
  outcome: string;
  tone: OutcomeTone;
}

export interface MatchSummary {
  result: 'victory' | 'defeat';
  /** `gameOver`: the match ended. `playerOut`: the player fell but rivals are still playing. */
  ended: 'gameOver' | 'playerOut';
  title: string;
  decisiveFactor: string;
  standings: StandingLine[];
  /** Week the run ended for the player (last played week, or the week of elimination). */
  week: number;
}

function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
}

function businessesValue(state: GameState, id: string): number {
  let sum = 0;
  for (const r of Object.values(state.rackets)) if (r.ownerId === id) sum += r.baseValue;
  return sum;
}

function outcomeFor(state: GameState, s: SyndicateState): { label: string; tone: OutcomeTone } {
  if (state.isGameOver && state.winnerId === s.id) {
    if (state.winReason === 'DOMINATION') return { label: MATCH_OUTCOME_LABELS.winnerDomination, tone: 'win' };
    if (state.winReason === 'LAST_STANDING') return { label: MATCH_OUTCOME_LABELS.winnerLastStanding, tone: 'win' };
    return { label: MATCH_OUTCOME_LABELS.winnerNetWorth, tone: 'win' };
  }
  if (s.isEliminated) {
    if (s.eliminationReason === 'RICO') return { label: MATCH_OUTCOME_LABELS.arrested, tone: 'out' };
    if (s.eliminationReason === 'INSOLVENT') return { label: MATCH_OUTCOME_LABELS.bankrupt, tone: 'out' };
    return { label: MATCH_OUTCOME_LABELS.wipedOut, tone: 'out' };
  }
  return { label: MATCH_OUTCOME_LABELS.stillStanding, tone: 'neutral' };
}

function eliminationSentence(s: SyndicateState): string {
  const week = s.eliminatedWeek ?? 0;
  switch (s.eliminationReason) {
    case 'RICO':
      return `Your Police Heat sat at 100% for two weeks in a row and you were arrested in Week ${week}.`;
    case 'INSOLVENT':
      return `You could not cover the Sunday bills with no businesses left to sell, and went bankrupt in Week ${week}.`;
    default:
      return `You ran out of crew, businesses and cash and were wiped out in Week ${week}.`;
  }
}

function buildStandings(state: GameState): StandingLine[] {
  const lines = Object.values(state.syndicates).map((s) => {
    const netWorth = calculateSyndicateValuation(s, state.rackets);
    const outcome = outcomeFor(state, s);
    const arch = s.archetypeId ? ARCHETYPES_BY_ID[s.archetypeId] : undefined;
    return {
      s,
      line: {
        id: s.id,
        name: s.name,
        isPlayer: s.isPlayer,
        rank: 0,
        archetypeLabel: arch ? arch.name : null,
        businesses: countOwnedRackets(s.id, state.rackets),
        streetCash: s.dirtyCash,
        safeCash: s.cleanCash,
        safeCashScore: s.cleanCash * 2,
        businessesValue: businessesValue(state, s.id),
        netWorth,
        outcome: outcome.label,
        tone: outcome.tone,
      } satisfies StandingLine,
    };
  });
  // Winner first, then syndicates still standing by Net Worth, then the eliminated by Net Worth.
  const group = (x: { s: SyndicateState }) => (state.winnerId === x.s.id ? 0 : x.s.isEliminated ? 2 : 1);
  lines.sort((a, b) => group(a) - group(b) || b.line.netWorth - a.line.netWorth || a.line.id.localeCompare(b.line.id));
  return lines.map((x, i) => ({ ...x.line, rank: i + 1 }));
}

function decisiveFactor(state: GameState, playerId: string, standings: StandingLine[]): string {
  const me = state.syndicates[playerId]!;
  if (me.isEliminated) return eliminationSentence(me);

  const winner = state.winnerId ? state.syndicates[state.winnerId] : undefined;
  if (!winner) return 'Every syndicate was knocked out, so nobody won.';
  const iWon = winner.id === playerId;
  const winnerLine = standings.find((l) => l.id === winner.id)!;

  if (state.winReason === 'DOMINATION') {
    return iWon
      ? `You took over ${winnerLine.businesses} businesses by Week ${state.week} and won the city early.`
      : `${winner.name} took over ${winnerLine.businesses} businesses by Week ${state.week} and won the city early.`;
  }
  if (state.winReason === 'LAST_STANDING') {
    return iWon
      ? `Every rival was knocked out, leaving your crew standing in Week ${state.week}.`
      : `${winner.name} was the last crew standing in Week ${state.week}.`;
  }

  // Net Worth finish. Compare the winner to the best living rival (or to the player when they lost).
  const living = standings.filter((l) => l.id !== winner.id && !state.syndicates[l.id]!.isEliminated);
  const rival = iWon ? living[0] : standings.find((l) => l.id === playerId)!;
  if (!rival) return `${iWon ? 'You' : winner.name} won on Net Worth.`;
  const margin = winnerLine.netWorth - rival.netWorth;
  // Margin if Safe Cash had counted once instead of twice.
  const plainMargin = margin - (winnerLine.safeCash - rival.safeCash);
  if (iWon) {
    const decided = plainMargin <= 0 ? ' Safe Cash counting double decided it.' : '';
    return `You won on Net Worth by ${money(margin)} over ${rival.name}.${decided}`;
  }
  const decided = plainMargin <= 0 ? ' Their Safe Cash counting double decided it.' : '';
  return `${winner.name} beat you on Net Worth by ${money(margin)}.${decided}`;
}

/** Full 4-syndicate summary once the player's run is over; `null` while it is live. */
export function selectMatchSummary(state: GameState, playerId: string): MatchSummary | null {
  const me = state.syndicates[playerId];
  if (!me || isRunLive(state, playerId)) return null;
  const standings = buildStandings(state);
  const result = state.isGameOver && state.winnerId === playerId ? 'victory' : 'defeat';
  return {
    result,
    ended: state.isGameOver ? 'gameOver' : 'playerOut',
    title: result === 'victory' ? SUMMARY_TERMS.victory : SUMMARY_TERMS.defeat,
    decisiveFactor: decisiveFactor(state, playerId, standings),
    standings,
    week: me.isEliminated ? (me.eliminatedWeek ?? state.week) : state.week,
  };
}
