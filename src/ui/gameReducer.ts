// React-side game reducer: thin wrapper over the pure engine (kept outside /src/engine).

import { executeAllAITurns } from '../engine/ai';
import { advanceWeek, applyAction, createInitialGameState } from '../engine/reducer';
import type { Action, GameState } from '../engine/types';
import { PLAYER_ID } from './viewModel';

export const DEFAULT_SEED = 42;

export interface UiState {
  game: GameState;
  seed: number;
  /** Feedback for the last player action (rejection reason or outcome). */
  message: string;
  /** UI-only staged unlock of player verbs (M2-T0): locked buttons are disabled in GreyboxApp.
   * Never consulted by the engine or the AI; applyAction stays the only legality check. */
  guidedIntro: boolean;
}

export type UiAction =
  | { type: 'ACTION'; action: Action }
  | { type: 'END_WEEK' }
  | { type: 'NEW_GAME'; seed: number }
  | { type: 'SET_GUIDED_INTRO'; on: boolean };

export function initUiState(seed: number = DEFAULT_SEED, guidedIntro = true): UiState {
  return { game: createInitialGameState(seed), seed, message: '', guidedIntro };
}

export function gameReducer(state: UiState, ua: UiAction): UiState {
  switch (ua.type) {
    case 'NEW_GAME':
      return initUiState(ua.seed, state.guidedIntro);

    case 'SET_GUIDED_INTRO':
      return { ...state, guidedIntro: ua.on };

    case 'ACTION': {
      const { state: game, result } = applyAction(state.game, PLAYER_ID, ua.action);
      if (!result.executed) {
        return { ...state, message: `Rejected: ${result.reason ?? 'unknown reason'}` };
      }
      if (result.queued) {
        return {
          ...state,
          game,
          message: `${ua.action.type} queued as siege — resolves at the start of week ${result.resolveWeek ?? '?'}`,
        };
      }
      const bits = [result.outcome, result.roll !== undefined ? `roll ${result.roll}` : undefined]
        .filter(Boolean)
        .join(', ');
      const message = `${ua.action.type} ${result.success ? 'succeeded' : 'failed'}${bits ? ` (${bits})` : ''}`;
      return { ...state, game, message };
    }

    case 'END_WEEK': {
      if (state.game.isGameOver) return state;
      const { state: afterAI } = executeAllAITurns(state.game);
      const game = advanceWeek(afterAI);
      return { ...state, game, message: `Week ${state.game.week} ended.` };
    }
  }
}
