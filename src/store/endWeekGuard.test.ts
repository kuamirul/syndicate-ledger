import { describe, expect, it } from 'vitest';
import { cloneGameState } from '../engine/reducer';
import { PLAYER_ID } from '../ui/viewModel';
import { createGameStore, randomSeed } from './gameStore';

function setup() {
  return createGameStore(5);
}
function mutate(store: ReturnType<typeof setup>, f: (s: ReturnType<typeof cloneGameState>) => void) {
  const g = cloneGameState(store.getState().gameState);
  f(g);
  store.setState({ gameState: g });
}

describe('End Week guard', () => {
  it('asks first when the player still has an affordable action', () => {
    const store = setup();
    store.getState().requestEndWeek();
    expect(store.getState().endWeekPromptOpen).toBe(true);
    expect(store.getState().gameState.week).toBe(1);
  });

  it('Keep Playing closes the prompt without ending the week', () => {
    const store = setup();
    store.getState().requestEndWeek();
    store.getState().cancelEndWeek();
    expect(store.getState()).toMatchObject({ endWeekPromptOpen: false });
    expect(store.getState().gameState.week).toBe(1);
  });

  it('End Week Anyway advances the week and keeps asking next time', () => {
    const store = setup();
    store.getState().requestEndWeek();
    store.getState().confirmEndWeek(false);
    expect(store.getState().gameState.week).toBe(2);
    expect(store.getState()).toMatchObject({ endWeekPromptOpen: false, skipUnspentApWarning: false });
    store.getState().requestEndWeek();
    expect(store.getState().endWeekPromptOpen).toBe(true);
  });

  it("'Don't warn again' ends the week and skips future prompts for the session", () => {
    const store = setup();
    store.getState().requestEndWeek();
    store.getState().confirmEndWeek(true);
    expect(store.getState().skipUnspentApWarning).toBe(true);
    store.getState().requestEndWeek();
    expect(store.getState()).toMatchObject({ endWeekPromptOpen: false });
    expect(store.getState().gameState.week).toBe(3);
  });

  it('ends the week in one step with 0 Action Points left', () => {
    const store = setup();
    mutate(store, (g) => (g.syndicates[PLAYER_ID]!.actionPoints = 0));
    store.getState().requestEndWeek();
    expect(store.getState().endWeekPromptOpen).toBe(false);
    expect(store.getState().gameState.week).toBe(2);
  });
});

describe('match over', () => {
  it('locks End Week once the player is eliminated and keeps the board as it was', () => {
    const store = setup();
    mutate(store, (g) => {
      const p = g.syndicates[PLAYER_ID]!;
      p.isEliminated = true;
      p.eliminationReason = 'RICO';
      p.eliminatedWeek = 1;
    });
    const before = JSON.stringify(store.getState().gameState);
    store.getState().requestEndWeek();
    store.getState().endWeek();
    store.getState().confirmEndWeek(false);
    expect(JSON.stringify(store.getState().gameState)).toBe(before);
    expect(store.getState().endWeekPromptOpen).toBe(false);
  });

  it('summary can be dismissed, reopened, and resets on a new run', () => {
    const store = setup();
    expect(store.getState().summaryDismissed).toBe(false);
    store.getState().dismissSummary();
    expect(store.getState().summaryDismissed).toBe(true);
    store.getState().reopenSummary();
    expect(store.getState().summaryDismissed).toBe(false);
    store.getState().dismissSummary();
    store.getState().startNewGame(9);
    expect(store.getState().summaryDismissed).toBe(false);
  });

  it('Retry Exact Seed reproduces the identical starting board', () => {
    const store = setup();
    const start = JSON.stringify(store.getState().gameState);
    store.getState().performAction({ type: 'EXTORT', jobId: 'shakedown', prepTier: 0 });
    store.getState().endWeek();
    expect(JSON.stringify(store.getState().gameState)).not.toBe(start);
    store.getState().startNewGame(store.getState().seed);
    expect(JSON.stringify(store.getState().gameState)).toBe(start);
  });

  it('New Run (Random Seed) starts a fresh run with a valid new seed', () => {
    const store = setup();
    store.getState().endWeek();
    store.getState().startRandomGame();
    expect(store.getState().gameState.week).toBe(1);
    expect(Number.isInteger(store.getState().seed)).toBe(true);
    expect(store.getState().seed).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 200; i++) {
      const n = randomSeed();
      expect(n >= 1 && n <= 2_147_483_647 && Number.isInteger(n)).toBe(true);
    }
  });
});
