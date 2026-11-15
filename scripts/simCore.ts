// Headless Monte Carlo runner core. Uses only the pure engine; no I/O, no clocks.
// Every seat (including "player") is driven by the same Symmetric Utility AI via applyAction().

import { AI_ARCHETYPES } from '../src/data';
import { executeAITurn } from '../src/engine/ai';
import {
  advanceWeek,
  calculateSyndicateValuation,
  createInitialGameState,
} from '../src/engine/reducer';
import type {
  ArchetypeId,
  EliminationReason,
  GameState,
  WinReason,
} from '../src/engine/types';

export const SEAT_IDS = ['player', 'ai_1', 'ai_2', 'ai_3'] as const;
const MAX_WEEKS = 60; // safety guard; advanceWeek ends the game at week 52

export interface GameSummary {
  seed: number;
  weeks: number;
  winnerId: string | null;
  winnerArchetype: ArchetypeId | null;
  winReason: WinReason | null;
  /** Archetype assigned to each seat for this game. */
  seatArchetypes: Record<string, ArchetypeId>;
  eliminations: Record<string, EliminationReason | undefined>;
}

/**
 * Deterministic archetype rotation: 5 archetypes, 4 seats. Game `index` rotates the pool so every
 * archetype sits out equally often and occupies every seat equally often over multiples of 5 games.
 */
export function assignArchetypes(index: number): Record<string, ArchetypeId> {
  const pool = AI_ARCHETYPES.map((a) => a.id);
  const out: Record<string, ArchetypeId> = {};
  SEAT_IDS.forEach((seat, i) => {
    out[seat] = pool[(index + i) % pool.length]!;
  });
  return out;
}

export function playGame(seed: number, index: number): GameSummary {
  const seatArchetypes = assignArchetypes(index);
  const initial = createInitialGameState(seed);
  let state: GameState = initial;
  state = {
    ...state,
    syndicates: Object.fromEntries(
      Object.entries(state.syndicates).map(([id, s]) => [
        id,
        { ...s, archetypeId: seatArchetypes[id] },
      ])
    ),
  };

  let guard = 0;
  while (!state.isGameOver && guard++ < MAX_WEEKS) {
    const order = Object.values(state.syndicates)
      .filter((s) => !s.isEliminated)
      .sort(
        (a, b) =>
          calculateSyndicateValuation(b, state.rackets) -
          calculateSyndicateValuation(a, state.rackets)
      )
      .map((s) => s.id);
    for (const id of order) {
      if (state.isGameOver) break;
      state = executeAITurn(state, id).state;
    }
    state = advanceWeek(state);
  }

  const eliminations: Record<string, EliminationReason | undefined> = {};
  for (const s of Object.values(state.syndicates)) eliminations[s.id] = s.eliminationReason;

  return {
    seed,
    weeks: state.history.length,
    winnerId: state.winnerId,
    winnerArchetype: state.winnerId ? seatArchetypes[state.winnerId] ?? null : null,
    winReason: state.winReason,
    seatArchetypes,
    eliminations,
  };
}

export interface ArchetypeStats {
  appearances: number;
  wins: number;
  eliminations: Record<EliminationReason, number>;
}

export interface SimReport {
  games: number;
  baseSeed: number;
  avgWeeks: number;
  noWinner: number;
  winReasons: Record<WinReason, number>;
  eliminationReasons: Record<EliminationReason, number>;
  /** Share of games in which at least one syndicate went insolvent (0–100, 1 decimal). */
  gamesWithInsolvency: number;
  /** Share of all syndicate-seats eliminated by insolvency (0–100, 1 decimal). */
  seatInsolvencyRate: number;
  /** Share of all syndicate-seats eliminated as WIPED_OUT (0–100, 1 decimal). */
  seatWipedOutRate: number;
  /** Share of games with at least one INSOLVENT or WIPED_OUT seat (0–100, 1 decimal). */
  gamesWithBankruptcy: number;
  archetypes: Record<string, ArchetypeStats>;
}

const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

export function runSimulation(games: number, baseSeed: number): SimReport {
  const archetypes: Record<string, ArchetypeStats> = {};
  for (const a of AI_ARCHETYPES) {
    archetypes[a.id] = {
      appearances: 0,
      wins: 0,
      eliminations: { RICO: 0, INSOLVENT: 0, WIPED_OUT: 0 },
    };
  }
  const winReasons: Record<WinReason, number> = { DOMINATION: 0, VALUATION: 0, LAST_STANDING: 0 };
  const eliminationReasons: Record<EliminationReason, number> = {
    RICO: 0,
    INSOLVENT: 0,
    WIPED_OUT: 0,
  };
  let totalWeeks = 0;
  let noWinner = 0;
  let insolventGames = 0;
  let bankruptGames = 0;

  for (let i = 0; i < games; i++) {
    const g = playGame((baseSeed + i) | 0, i);
    totalWeeks += g.weeks;
    if (g.winnerId === null) noWinner++;
    if (g.winReason) winReasons[g.winReason]++;
    let hadInsolvency = false;
    let hadBankruptcy = false;
    for (const seat of SEAT_IDS) {
      const arch = g.seatArchetypes[seat]!;
      const stats = archetypes[arch]!;
      stats.appearances++;
      if (g.winnerId === seat) stats.wins++;
      const reason = g.eliminations[seat];
      if (reason) {
        stats.eliminations[reason]++;
        eliminationReasons[reason]++;
        if (reason === 'INSOLVENT') hadInsolvency = true;
        if (reason === 'INSOLVENT' || reason === 'WIPED_OUT') hadBankruptcy = true;
      }
    }
    if (hadInsolvency) insolventGames++;
    if (hadBankruptcy) bankruptGames++;
  }

  return {
    games,
    baseSeed,
    avgWeeks: games === 0 ? 0 : Math.round((totalWeeks / games) * 10) / 10,
    noWinner,
    winReasons,
    eliminationReasons,
    gamesWithInsolvency: pct(insolventGames, games),
    seatInsolvencyRate: pct(eliminationReasons.INSOLVENT, games * SEAT_IDS.length),
    seatWipedOutRate: pct(eliminationReasons.WIPED_OUT, games * SEAT_IDS.length),
    gamesWithBankruptcy: pct(bankruptGames, games),
    archetypes,
  };
}

export function formatReport(r: SimReport, elapsedMs?: number): string {
  const lines: string[] = [];
  lines.push(`Syndicate Ledger sim — ${r.games} games, base seed ${r.baseSeed}`);
  if (elapsedMs !== undefined) lines.push(`Elapsed: ${elapsedMs.toFixed(0)} ms`);
  lines.push(`Avg game length: ${r.avgWeeks} weeks   No-winner games: ${r.noWinner}`);
  lines.push('');
  lines.push('Archetype      Games   Wins   Win%   RICO  Insolv  Wiped');
  for (const [id, s] of Object.entries(r.archetypes)) {
    lines.push(
      `${id.padEnd(13)} ${String(s.appearances).padStart(6)} ${String(s.wins).padStart(6)} ` +
        `${pct(s.wins, s.appearances).toFixed(1).padStart(6)} ${String(s.eliminations.RICO).padStart(6)} ` +
        `${String(s.eliminations.INSOLVENT).padStart(7)} ${String(s.eliminations.WIPED_OUT).padStart(6)}`
    );
  }
  lines.push('');
  lines.push(
    `Win reasons: DOMINATION ${r.winReasons.DOMINATION}, VALUATION ${r.winReasons.VALUATION}, ` +
      `LAST_STANDING ${r.winReasons.LAST_STANDING}`
  );
  lines.push(
    `Eliminations: RICO ${r.eliminationReasons.RICO}, INSOLVENT ${r.eliminationReasons.INSOLVENT}, ` +
      `WIPED_OUT ${r.eliminationReasons.WIPED_OUT}`
  );
  lines.push(
    `Insolvency: ${r.seatInsolvencyRate}% of seats, ${r.gamesWithInsolvency}% of games`
  );
  lines.push(
    `Wiped out: ${r.seatWipedOutRate}% of seats   Any bankruptcy (insolvent or wiped): ${r.gamesWithBankruptcy}% of games`
  );
  return lines.join('\n');
}
