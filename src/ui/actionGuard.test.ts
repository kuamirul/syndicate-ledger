import { describe, expect, it } from 'vitest';
import { applyAction, cloneGameState, createInitialGameState } from '../engine/reducer';
import type { GameState } from '../engine/types';
import { candidateActions, hasAffordableUnlockedAction, unspentActions } from './actionGuard';
import { PLAYER_ID } from './viewModel';

function fresh(mut?: (s: GameState) => void): GameState {
  const s = cloneGameState(createInitialGameState(5));
  mut?.(s);
  return s;
}
const me = (s: GameState) => s.syndicates[PLAYER_ID]!;

describe('hasAffordableUnlockedAction', () => {
  it('is true on a fresh live turn (Guided Intro on and off)', () => {
    expect(hasAffordableUnlockedAction(fresh(), PLAYER_ID, true)).toBe(true);
    expect(hasAffordableUnlockedAction(fresh(), PLAYER_ID, false)).toBe(true);
  });

  it('is false at 0 Action Points, even with plenty of cash', () => {
    const s = fresh((x) => {
      me(x).actionPoints = 0;
      me(x).dirtyCash = 99999;
    });
    expect(hasAffordableUnlockedAction(s, PLAYER_ID, false)).toBe(false);
    expect(unspentActions(s, PLAYER_ID)).toBe(0);
  });

  it('stays true at $0 cash and 0 crew: Corner Shakedown at prep $0 is always legal', () => {
    const s = fresh((x) => {
      me(x).dirtyCash = 0;
      me(x).cleanCash = 0;
      me(x).crew = { thug: 0, enforcer: 0, hitman: 0 };
    });
    // The engine really accepts it (so the guard is not just assuming).
    const shakedown = applyAction(s, PLAYER_ID, { type: 'EXTORT', jobId: 'shakedown', prepTier: 0 });
    expect(shakedown.result.executed).toBe(true);
    expect(hasAffordableUnlockedAction(s, PLAYER_ID, true)).toBe(true);
  });

  it('is false once the match is over or the player is eliminated', () => {
    expect(hasAffordableUnlockedAction(fresh((x) => (x.isGameOver = true)), PLAYER_ID, false)).toBe(false);
    expect(hasAffordableUnlockedAction(fresh((x) => (me(x).isEliminated = true)), PLAYER_ID, false)).toBe(false);
    expect(unspentActions(fresh((x) => (x.isGameOver = true)), PLAYER_ID)).toBe(0);
  });

  it('counts the real Action Points left', () => {
    expect(unspentActions(fresh(), PLAYER_ID)).toBe(3);
    expect(unspentActions(fresh((x) => (me(x).actionPoints = 1)), PLAYER_ID)).toBe(1);
  });

  it('never mutates the state it inspects (dry run only)', () => {
    const s = fresh();
    const before = JSON.stringify(s);
    hasAffordableUnlockedAction(s, PLAYER_ID, true);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('candidateActions', () => {
  it('covers every player verb and skips the player and eliminated rivals as targets', () => {
    const s = fresh((x) => (x.syndicates.ai_3!.isEliminated = true));
    const types = new Set(candidateActions(s, PLAYER_ID).map((a) => a.type));
    expect(types).toEqual(new Set(['EXTORT', 'SEIZE', 'RECRUIT', 'LAUNDER', 'BRIBE', 'WIRETAP']));
    const targets = candidateActions(s, PLAYER_ID).flatMap((a) =>
      'targetSyndicateId' in a && a.targetSyndicateId ? [a.targetSyndicateId] : []
    );
    expect(new Set(targets)).toEqual(new Set(['ai_1', 'ai_2']));
  });
});
