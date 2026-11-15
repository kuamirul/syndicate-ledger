import { describe, expect, it } from 'vitest';
import { calculateSyndicateAttack } from '../engine/crew';
import { createInitialGameState } from '../engine/reducer';
import { calculateRiskProbabilities } from '../engine/risk';
import type { DecisionTrace, GameState } from '../engine/types';
import { buildRacketRows, buildTraceRows, rollPreview } from './viewModel';
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

  it('SEIZE preview includes the rival owner\'s assigned guards', () => {
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
      calculateRiskProbabilities(attack, racket.baseDefense + 9, 1)
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
