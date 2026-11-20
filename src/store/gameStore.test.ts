import { describe, expect, it } from 'vitest';
import { createGameStore, computeCashDelta } from './gameStore';
import { PLAYER_ID } from '../ui/viewModel';

describe('gameStore', () => {
  it('starts with documented defaults', () => {
    const s = createGameStore(7).getState();
    expect(s.activeTab).toBe('ops');
    expect(s.guidedIntro).toBe(true);
    expect(s.devOmniscient).toBe(false);
    expect(s.lastCashDelta).toBeNull();
    expect(s.gameState.week).toBe(1);
  });

  it('tracks the wallet delta after a paid action', () => {
    const store = createGameStore(7);
    const before = store.getState().gameState.syndicates[PLAYER_ID]!;
    store.getState().performAction({ type: 'LAUNDER', amount: 1000 });
    const s = store.getState();
    const after = s.gameState.syndicates[PLAYER_ID]!;
    expect(s.lastCashDelta).toEqual({
      street: after.dirtyCash - before.dirtyCash,
      safe: after.cleanCash - before.cleanCash,
    });
    expect(s.lastCashDelta?.street).toBe(-1000);
    expect(s.lastCashDelta?.safe).toBe(750);
  });

  it('keeps the previous delta and sets a message on a rejected action', () => {
    const store = createGameStore(7);
    store.getState().performAction({ type: 'LAUNDER', amount: 1000 });
    const delta = store.getState().lastCashDelta;
    store.getState().performAction({ type: 'LAUNDER', amount: 1000 });
    expect(store.getState().lastStatusMessage).toMatch(/^Rejected/);
    expect(store.getState().lastCashDelta).toBe(delta);
  });

  it('computes an End Week delta between previous and next player state and resets AP', () => {
    const store = createGameStore(7);
    const prev = store.getState().gameState;
    store.getState().endWeek();
    const s = store.getState();
    expect(s.gameState.week).toBe(2);
    expect(s.lastCashDelta).toEqual(computeCashDelta(prev, s.gameState));
    expect(s.lastStatusMessage).toBe('Week 1 ended.');
  });

  it('startNewGame resets state but keeps the Guided Intro setting', () => {
    const store = createGameStore(7);
    store.getState().setGuidedIntro(false);
    store.getState().endWeek();
    store.getState().startNewGame(99);
    const s = store.getState();
    expect(s.gameState.week).toBe(1);
    expect(s.seed).toBe(99);
    expect(s.guidedIntro).toBe(false);
    expect(s.lastCashDelta).toBeNull();
  });

  it('computeCashDelta returns null when nothing changed', () => {
    const g = createGameStore(7).getState().gameState;
    expect(computeCashDelta(g, g)).toBeNull();
  });
});
