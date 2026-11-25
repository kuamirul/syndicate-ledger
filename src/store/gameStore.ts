// Zustand store for the ledger UI. Wraps the pure `gameReducer` (so status messages match the
// greybox) and adds tab / toggle state plus the last-change wallet delta.

import { createStore, useStore } from 'zustand';
import type { Action, GameState } from '../engine/types';
import { hasAffordableUnlockedAction } from '../ui/actionGuard';
import { DEFAULT_SEED, gameReducer, initUiState, type UiState } from '../ui/gameReducer';
import { isRunLive } from '../ui/matchSummary';
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
  /** The player closed the post-run summary to inspect the final board (reset on every new run). */
  summaryDismissed: boolean;
  /** Session-only: skip the unspent-Action warning when ending the week. */
  skipUnspentApWarning: boolean;
  /** The unspent-Action confirmation is open. */
  endWeekPromptOpen: boolean;
  startNewGame: (seed: number) => void;
  startRandomGame: () => void;
  /** End Week, asking first when the player still has an affordable unlocked action. */
  requestEndWeek: () => void;
  confirmEndWeek: (dontWarnAgain: boolean) => void;
  cancelEndWeek: () => void;
  dismissSummary: () => void;
  reopenSummary: () => void;
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

/** Fresh run seed (UI layer only; the engine itself never draws unseeded randomness). */
export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 2_147_483_646);
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
      summaryDismissed: false,
      skipUnspentApWarning: false,
      endWeekPromptOpen: false,
      startNewGame: (s) => {
        const ui = initUiState(s, get().guidedIntro);
        set({
          ...toStore(ui),
          lastCashDelta: null,
          activeTab: 'ops',
          summaryDismissed: false,
          endWeekPromptOpen: false,
        });
      },
      startRandomGame: () => get().startNewGame(randomSeed()),
      requestEndWeek: () => {
        const cur = get();
        if (!isRunLive(cur.gameState, PLAYER_ID)) return;
        const warn =
          !cur.skipUnspentApWarning && hasAffordableUnlockedAction(cur.gameState, PLAYER_ID, cur.guidedIntro);
        if (warn) set({ endWeekPromptOpen: true });
        else get().endWeek();
      },
      confirmEndWeek: (dontWarnAgain) => {
        set({ endWeekPromptOpen: false, ...(dontWarnAgain ? { skipUnspentApWarning: true } : {}) });
        get().endWeek();
      },
      cancelEndWeek: () => set({ endWeekPromptOpen: false }),
      dismissSummary: () => set({ summaryDismissed: true }),
      reopenSummary: () => set({ summaryDismissed: false }),
      performAction: (action) => run({ type: 'ACTION', action }),
      endWeek: () => {
        if (isRunLive(get().gameState, PLAYER_ID)) run({ type: 'END_WEEK' });
      },
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
