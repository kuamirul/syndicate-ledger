import { describe, expect, it } from 'vitest';
import { calculateSyndicateAttack } from '../engine/crew';
import { createInitialGameState } from '../engine/reducer';
import { calculateRiskProbabilities } from '../engine/risk';
import type { DecisionTrace, GameState } from '../engine/types';
import { applyAction } from '../engine/reducer';
import {
  buildRacketRows,
  buildSiegeRows,
  buildSundayBill,
  buildTraceRows,
  rollPreview,
  seizeResolveWeek,
} from './viewModel';
import { JOBS_BY_ID, STREET_JOBS } from '../data';

describe('rollPreview', () => {
  it('EXTORT preview matches calculateRiskProbabilities and sums to 100', () => {
    const state = createInitialGameState(1);
    const job = STREET_JOBS[0]!;
    for (const prepTier of [0, 1, 2] as const) {
      const p = rollPreview(state, 'player', { type: 'EXTORT', jobId: job.id, prepTier })!;
      expect(p).toEqual(
        calculateRiskProbabilities(calculateSyndicateAttack(state.syndicates.player!.crew), JOBS_BY_ID[job.id]!.difficultyDef, prepTier)
      );
      expect(p.clean + p.messy + p.botched).toBe(100);
    }
  });

  it('SEIZE preview includes the rival owner\'s crew garrison and assigned guards', () => {
    const base = createInitialGameState(1);
    const racket = base.rackets.fish_market!;
    const state: GameState = {
      ...base,
      rackets: { ...base.rackets, fish_market: { ...racket, ownerId: 'ai_1' } },
      syndicates: {
        ...base.syndicates,
        ai_1: { ...base.syndicates.ai_1!, assignedGuards: { fish_market: 9 } },
      },
    };
    const attack = calculateSyndicateAttack(state.syndicates.player!.crew);
    expect(rollPreview(state, 'player', { type: 'SEIZE', racketId: 'fish_market', prepTier: 1 })).toEqual(
      // M3-T1: ai_1's 4 starting Thugs (12 Defense) guard its only business, plus 9 legacy guards.
      calculateRiskProbabilities(attack, racket.baseDefense + 12 + 9, 1)
    );
  });

  it('returns null for unrolled actions and unknown ids', () => {
    const state = createInitialGameState(1);
    expect(rollPreview(state, 'player', { type: 'PASS' })).toBeNull();
    expect(rollPreview(state, 'player', { type: 'SEIZE', racketId: 'nope', prepTier: 0 })).toBeNull();
    expect(rollPreview(state, 'ghost', { type: 'PASS' })).toBeNull();
  });
});

describe('buildRacketRows', () => {
  it('lists 12 rackets with owner, defense and monopoly flag', () => {
    const base = createInitialGameState(1);
    const rows = buildRacketRows(base);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.ownerName === 'Neutral' && !r.monopoly)).toBe(true);

    const rackets = { ...base.rackets };
    const docks = Object.values(rackets).filter((r) => r.district === 'docks');
    for (const r of docks) rackets[r.id] = { ...r, ownerId: 'player', damagedTurnsRemaining: 1 };
    const owned = buildRacketRows({ ...base, rackets }).filter((r) => r.ownerId === 'player');
    expect(owned.length).toBe(docks.length);
    expect(owned.every((r) => r.monopoly && r.damaged && r.ownerName === 'Player Syndicate')).toBe(true);
  });
});

describe('buildTraceRows', () => {
  it('returns newest first and respects the limit', () => {
    const mk = (week: number): DecisionTrace => ({
      week,
      syndicateId: 'ai_1',
      action: { type: 'PASS' },
      scores: { evScore: 0, turfScore: 0, heatRiskScore: 0, grudgeScore: 0, emergencyModifiers: 0, coalitionBonus: 0, totalScore: week },
      reasoning: 'x',
    });
    const rows = buildTraceRows([mk(1), mk(2), mk(3)], 2);
    expect(rows.map((r) => r.week)).toEqual([3, 2]);
    expect(rows[0]!.action).toBe('PASS');
  });
});

describe('W3-T8b — Active Sieges view', () => {
  /** ai_1 owns fish_market, the player owns dive_bar, ai_2 owns scrap_yard; three sieges queued. */
  function siegeState(): GameState {
    let state = createInitialGameState(4);
    state.rackets.fish_market!.ownerId = 'ai_1';
    state.rackets.dive_bar!.ownerId = 'player';
    state.rackets.scrap_yard!.ownerId = 'ai_2';
    state = applyAction(state, 'player', { type: 'SEIZE', racketId: 'fish_market', prepTier: 0 }).state; // outgoing
    state = applyAction(state, 'ai_1', { type: 'SEIZE', racketId: 'dive_bar', prepTier: 1 }).state; // incoming
    state = applyAction(state, 'ai_3', { type: 'SEIZE', racketId: 'scrap_yard', prepTier: 2 }).state; // rival vs rival
    return state;
  }

  it('always shows incoming and own sieges; hides rival-vs-rival without a wiretap', () => {
    const rows = buildSiegeRows(siegeState(), 'player');
    expect(rows.map((r) => r.direction).sort()).toEqual(['incoming', 'outgoing']);
    const incoming = rows.find((r) => r.direction === 'incoming')!;
    expect(incoming).toMatchObject({ attackerName: 'The Iron Syndicate', racketName: 'Dive Bar', resolveWeek: 3, prepTier: 1 });
    expect(incoming.odds).toMatch(/^Clean \d+% \/ Messy \d+% \/ Botched \d+%$/);
  });

  it('shows rival-vs-rival sieges while wiretapping the attacker or the defender, or in DEV mode', () => {
    const state = siegeState();
    expect(buildSiegeRows(state, 'player', true)).toHaveLength(3);
    for (const tapped of ['ai_3', 'ai_2']) {
      const s = { ...state, syndicates: { ...state.syndicates, player: { ...state.syndicates.player!, wiretapTurnsRemaining: { [tapped]: 2 } } } };
      expect(buildSiegeRows(s, 'player').some((r) => r.direction === 'rival')).toBe(true);
    }
  });

  it('Sunday bill lists Crew Payroll and Turf Upkeep separately', () => {
    const state = createInitialGameState(1);
    for (const id of ['fish_market', 'union_pier', 'bonded_warehouse', 'dive_bar', 'velvet_club']) state.rackets[id]!.ownerId = 'player';
    expect(buildSundayBill(state, 'player')).toMatchObject({ crewPayroll: 1000, turfUpkeep: 2400, ownedRackets: 5, total: 3400 });
    expect(buildSundayBill(state, 'ghost')).toBeNull();
  });

  it('seizeResolveWeek: neutral resolves now, rival-owned at week + 2', () => {
    const state = createInitialGameState(1);
    state.rackets.fish_market!.ownerId = 'ai_1';
    expect(seizeResolveWeek(state, 'union_pier')).toBe(1);
    expect(seizeResolveWeek(state, 'fish_market')).toBe(3);
  });
});
