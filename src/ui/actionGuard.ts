// Unspent-Action guard helpers (M2-T4). Pure, no React / store imports.
// "Affordable and unlocked" is decided by a dry run through the engine's own applyAction (which
// never mutates its input), filtered by the Guided Intro verb locks. So legality and cash always
// match what a click would actually do.

import { CITY_RACKETS, STREET_JOBS } from '../data';
import { applyAction } from '../engine/reducer';
import type { Action, GameState } from '../engine/types';
import { verbForAction, verbLock } from './guidedIntro';
import { isRunLive } from './matchSummary';

/** Cheapest representative of each player verb; enough to prove some action can be taken. */
export function candidateActions(state: GameState, playerId: string): Action[] {
  const out: Action[] = [];
  for (const job of STREET_JOBS) out.push({ type: 'EXTORT', jobId: job.id, prepTier: 0 });
  for (const r of CITY_RACKETS) out.push({ type: 'SEIZE', racketId: r.id, prepTier: 0 });
  out.push({ type: 'RECRUIT', tier: 'thug', count: 1 });
  out.push({ type: 'RECRUIT', tier: 'enforcer', count: 1 });
  out.push({ type: 'RECRUIT', tier: 'hitman', count: 1 });
  out.push({ type: 'LAUNDER', amount: 1000 });
  out.push({ type: 'BRIBE', useClean: true });
  out.push({ type: 'BRIBE', useClean: false });
  for (const s of Object.values(state.syndicates)) {
    if (s.id === playerId || s.isEliminated) continue;
    out.push({ type: 'WIRETAP', targetSyndicateId: s.id });
    out.push({ type: 'BRIBE', useClean: true, targetSyndicateId: s.id });
    out.push({ type: 'BRIBE', useClean: false, targetSyndicateId: s.id });
  }
  return out;
}

/** Action Points the player could still spend; 0 once the run is over. */
export function unspentActions(state: GameState, playerId: string): number {
  if (!isRunLive(state, playerId)) return 0;
  return state.syndicates[playerId]?.actionPoints ?? 0;
}

/**
 * True when the run is live, the player has Action Points left, and at least one currently
 * unlocked action would actually execute. Note: Corner Shakedown at prep $0 is legal even at 0
 * crew and $0 cash, so during a live turn with AP left this is effectively always true.
 */
export function hasAffordableUnlockedAction(state: GameState, playerId: string, guidedIntro: boolean): boolean {
  if (unspentActions(state, playerId) < 1) return false;
  for (const action of candidateActions(state, playerId)) {
    const ownerId = action.type === 'SEIZE' ? (state.rackets[action.racketId]?.ownerId ?? null) : null;
    const verb = verbForAction(action, ownerId);
    if (verb && verbLock(verb, state.week, guidedIntro).locked) continue;
    if (applyAction(state, playerId, action).result.executed) return true;
  }
  return false;
}

