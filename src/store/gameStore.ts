// Zustand store for the ledger UI. Wraps the pure `gameReducer` (so status messages match the
// greybox) and adds tab / toggle state plus the last-change wallet delta.

import { createStore, useStore } from 'zustand';
import type { Action, GameState } from '../engine/types';
import { DEFAULT_SEED, gameReducer, initUiState, type UiState } from '../ui/gameReducer';
import { PLAYER_ID } from '../ui/viewModel';

export type LedgerTab = 'ops' | 'turf' | 'rivals' | 'ledger';

export interface CashDelta {
  street: number;
  safe: number;
}

export interface GameStore {
  gameState: GameState;
  seed: number;
  activeTab: LedgerTab;
  guidedIntro: boolean;
  devOmniscient: boolean;
  lastStatusMessage: string;
  /** Player wallet change caused by the last action / End Week; null when nothing changed. */
  lastCashDelta: CashDelta | null;
  startNewGame: (seed: number) => void;
  performAction: (action: Action) => void;
  endWeek: () => void;
  setActiveTab: (tab: LedgerTab) => void;
  setGuidedIntro: (on: boolean) => void;
  setDevOmniscient: (on: boolean) => void;
}

/** Player Street/Safe cash change between two game states; null if both are unchanged. */
export function computeCashDelta(prev: GameState, next: GameState): CashDelta | null {
  const a = prev.syndicates[PLAYER_ID];
  const b = next.syndicates[PLAYER_ID];
  if (!a || !b) return null;
  const street = b.dirtyCash - a.dirtyCash;
  const safe = b.cleanCash - a.cleanCash;
  return street === 0 && safe === 0 ? null : { street, safe };
}

function toStore(ui: UiState): Pick<GameStore, 'gameState' | 'seed' | 'lastStatusMessage'> {
  return { gameState: ui.game, seed: ui.seed, lastStatusMessage: ui.message };
}

export function createGameStore(seed: number = DEFAULT_SEED) {
  const initial = initUiState(seed, true);
  return createStore<GameStore>()((set, get) => {
    const run = (ua: Parameters<typeof gameReducer>[1]) => {
      const cur = get();
      const ui: UiState = {
        game: cur.gameState,
        seed: cur.seed,
        message: cur.lastStatusMessage,
        guidedIntro: cur.guidedIntro,
      };
      const next = gameReducer(ui, ua);
      if (next.game === cur.gameState) {
        set({ lastStatusMessage: next.message });
        return;
      }
      set({ ...toStore(next), lastCashDelta: computeCashDelta(cur.gameState, next.game) });
    };
    return {
      ...toStore(initial),
      activeTab: 'ops',
      guidedIntro: true,
      devOmniscient: false,
      lastCashDelta: null,
      startNewGame: (s) => {
        const ui = initUiState(s, get().guidedIntro);
        set({ ...toStore(ui), lastCashDelta: null, activeTab: 'ops' });
      },
      performAction: (action) => run({ type: 'ACTION', action }),
      endWeek: () => run({ type: 'END_WEEK' }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setGuidedIntro: (guidedIntro) => set({ guidedIntro }),
      setDevOmniscient: (devOmniscient) => set({ devOmniscient }),
    };
  });
}

export const gameStore = createGameStore();

export function useGameStore<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
