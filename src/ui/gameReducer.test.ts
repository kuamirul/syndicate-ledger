import { describe, expect, it } from 'vitest';
import { gameReducer, initUiState } from './gameReducer';

describe('gameReducer', () => {
  it('END_WEEK runs the AI phase, advances the week, resets AP and appends traces', () => {
    const s0 = initUiState(5);
    const s1 = gameReducer(s0, { type: 'END_WEEK' });
    expect(s1.game.week).toBe(2);
    expect(s1.game.decisionTraces.length).toBeGreaterThan(0);
    expect(s1.game.history).toHaveLength(1);
    for (const s of Object.values(s1.game.syndicates)) {
      if (!s.isEliminated) expect(s.actionPoints).toBe(3);
    }
    // input untouched
    expect(s0.game.week).toBe(1);
    expect(s0.game.decisionTraces).toHaveLength(0);
  });

  it('rejected player action leaves game unchanged and surfaces the reason', () => {
    const s0 = initUiState(5);
    const s1 = gameReducer(s0, { type: 'ACTION', action: { type: 'LAUNDER', amount: 50000 } });
    expect(s1.game).toBe(s0.game);
    expect(s1.message).toMatch(/^Rejected: /);
  });

  it('executed player action spends AP and reports the outcome', () => {
    const s1 = gameReducer(initUiState(5), { type: 'ACTION', action: { type: 'PASS' } });
    expect(s1.game.syndicates.player!.actionPoints).toBe(2);
    expect(s1.message).toContain('PASS');
  });

  it('is deterministic for identical seed and action sequence', () => {
    const run = () => {
      let s = initUiState(77);
      s = gameReducer(s, { type: 'ACTION', action: { type: 'EXTORT', jobId: 'x', prepTier: 0 } });
      s = gameReducer(s, { type: 'END_WEEK' });
      s = gameReducer(s, { type: 'END_WEEK' });
      return s.game;
    };
    expect(run()).toEqual(run());
  });

  it('END_WEEK is a no-op once the game is over; NEW_GAME resets', () => {
    const over = { ...initUiState(1), game: { ...initUiState(1).game, isGameOver: true } };
    expect(gameReducer(over, { type: 'END_WEEK' })).toBe(over);
    const fresh = gameReducer(over, { type: 'NEW_GAME', seed: 9 });
    expect(fresh.game.week).toBe(1);
    expect(fresh.seed).toBe(9);
    expect(fresh.game.isGameOver).toBe(false);
  });
});
