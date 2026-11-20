// M2-T0 — 0-crew floor, 0-crew siege cancellation, 1x/week LAUNDER cap, 28-week run.

import { describe, expect, it } from 'vitest';
import { STREET_JOBS } from '../data';
import { generateCandidateActions } from './ai';
import { LAUNDER_MAX, MAX_LAUNDERS_PER_WEEK, MAX_WEEKS, ZERO_CREW_JOB_ID } from './constants';
import { advanceWeek, applyAction, cloneGameState, createInitialGameState } from './reducer';
import type { GameState } from './types';

const NO_CREW = { thug: 0, enforcer: 0, hitman: 0 } as const;

function crewless(id: string, seed = 11): GameState {
  const state = createInitialGameState(seed);
  state.syndicates[id]!.crew = { ...NO_CREW };
  return state;
}

describe('M2-T0 — 0-crew floor (symmetric game rule)', () => {
  it('pins the constants', () => {
    expect(MAX_WEEKS).toBe(28);
    expect(MAX_LAUNDERS_PER_WEEK).toBe(1);
    expect(LAUNDER_MAX).toBe(10000);
    expect(ZERO_CREW_JOB_ID).toBe('shakedown');
  });

  it('allows only the Corner Shakedown with 0 crew, for player and AI alike', () => {
    for (const id of ['player', 'ai_3']) {
      const state = crewless(id);
      const ok = applyAction(state, id, { type: 'EXTORT', jobId: 'shakedown', prepTier: 0 });
      expect(ok.result.executed).toBe(true);
      expect(ok.state.rngState).not.toBe(state.rngState);

      for (const job of STREET_JOBS.filter((j) => j.id !== ZERO_CREW_JOB_ID)) {
        for (const prepTier of [0, 1, 2] as const) {
          const bad = applyAction(state, id, { type: 'EXTORT', jobId: job.id, prepTier });
          expect(bad.result.executed).toBe(false);
          expect(bad.result.reason).toMatch(/only the Corner Shakedown/);
          expect(bad.state).toBe(state); // no AP, cash or RNG spent
        }
      }
    }
  });

  it('rejects neutral claims and rival sieges with 0 crew, without spending anything', () => {
    const state = crewless('player');
    state.rackets.fish_market!.ownerId = 'ai_1';
    for (const racketId of ['union_pier', 'fish_market']) {
      const r = applyAction(state, 'player', { type: 'SEIZE', racketId, prepTier: 2 });
      expect(r.result.executed).toBe(false);
      expect(r.result.reason).toMatch(/No crew/);
      expect(r.state).toBe(state);
    }
    expect(state.activeSieges).toEqual([]);
  });

  it('still lets a crewed syndicate run any job and claim turf', () => {
    const state = createInitialGameState(11);
    expect(applyAction(state, 'player', { type: 'EXTORT', jobId: 'bank_vault', prepTier: 0 }).result.executed).toBe(true);
    expect(applyAction(state, 'player', { type: 'SEIZE', racketId: 'fish_market', prepTier: 0 }).result.executed).toBe(true);
  });

  it('AI candidates contain no SEIZE and no non-shakedown EXTORT at 0 crew', () => {
    const state = crewless('ai_1');
    state.syndicates.ai_1!.dirtyCash = 20000;
    const actions = generateCandidateActions(state, 'ai_1');
    expect(actions.some((a) => a.type === 'SEIZE')).toBe(false);
    expect(actions.some((a) => a.type === 'EXTORT' && a.jobId !== ZERO_CREW_JOB_ID)).toBe(false);
    // Every candidate is legal under applyAction.
    for (const a of actions) expect(applyAction(state, 'ai_1', a).result.executed).toBe(true);
  });
});

describe('M2-T0 — queued siege is called off if the attacker has 0 crew at resolution', () => {
  it('cancels with no refund, no RNG use and a ledger event; racket stays with the defender', () => {
    const state = createInitialGameState(7);
    state.rackets.fish_market!.ownerId = 'ai_1';
    const queued = applyAction(state, 'player', { type: 'SEIZE', racketId: 'fish_market', prepTier: 1 }).state;
    const cashAfterDeclare = queued.syndicates.player!.dirtyCash;

    const week2 = cloneGameState(advanceWeek(queued));
    expect(week2.activeSieges).toHaveLength(1);
    week2.syndicates.player!.crew = { ...NO_CREW };
    week2.syndicates.player!.dirtyCash = 5000; // keep the syndicate alive and solvent

    // Same state with crew intact consumes RNG for the assault roll; the crewless one must not.
    const withCrew = cloneGameState(week2);
    withCrew.syndicates.player!.crew = { thug: 4, enforcer: 0, hitman: 0 };
    const rolled = advanceWeek(withCrew);
    const cancelled = advanceWeek(week2);

    expect(cancelled.week).toBe(3);
    expect(cancelled.activeSieges).toEqual([]);
    expect(cancelled.rackets.fish_market!.ownerId).toBe('ai_1');
    expect(cancelled.history.at(-1)!.events.some((e) => e.includes('called off (no crew left)'))).toBe(true);
    expect(rolled.rngState).not.toBe(cancelled.rngState);
    const noSiege = cloneGameState(week2);
    noSiege.activeSieges = [];
    expect(cancelled.rngState).toBe(advanceWeek(noSiege).rngState);
    expect(cashAfterDeclare).toBeLessThan(state.syndicates.player!.dirtyCash); // cost was not refunded at declare
  });
});

describe('M2-T0 — 1 LAUNDER per syndicate per week', () => {
  it('rejects a second launder in the same week, for player and AI alike, and resets on End Week', () => {
    for (const id of ['player', 'ai_2']) {
      const state = createInitialGameState(5);
      state.syndicates[id]!.dirtyCash = 30000;
      const first = applyAction(state, id, { type: 'LAUNDER', amount: 10000 });
      expect(first.result.executed).toBe(true);
      expect(first.state.syndicates[id]!.laundersThisWeek).toBe(1);
      expect(first.state.syndicates[id]!.cleanCash).toBe(7500);

      const second = applyAction(first.state, id, { type: 'LAUNDER', amount: 1000 });
      expect(second.result.executed).toBe(false);
      expect(second.result.reason).toBe('Launder limit reached (1 per week)');
      expect(second.state).toBe(first.state);

      const nextWeek = advanceWeek(first.state);
      expect(nextWeek.syndicates[id]!.laundersThisWeek).toBe(0);
      expect(applyAction(nextWeek, id, { type: 'LAUNDER', amount: 1000 }).result.executed).toBe(true);
    }
  });

  it('a failed launder does not use up the weekly launder', () => {
    const state = createInitialGameState(5);
    const tooBig = applyAction(state, 'player', { type: 'LAUNDER', amount: LAUNDER_MAX + 1 });
    expect(tooBig.result.executed).toBe(false);
    expect(tooBig.result.reason).toBe('Launder amount must be between $1 and $10,000');
    expect(applyAction(state, 'player', { type: 'LAUNDER', amount: 2000 }).result.executed).toBe(true);
  });

  it('AI offers LAUNDER candidates only while its weekly launder is unused', () => {
    const state = createInitialGameState(5);
    state.syndicates.ai_2!.dirtyCash = 30000;
    expect(generateCandidateActions(state, 'ai_2').some((a) => a.type === 'LAUNDER')).toBe(true);
    const after = applyAction(state, 'ai_2', { type: 'LAUNDER', amount: 10000 }).state;
    expect(generateCandidateActions(after, 'ai_2').some((a) => a.type === 'LAUNDER')).toBe(false);
  });
});

describe(`M2-T0 — ${MAX_WEEKS}-week run`, () => {
  it(`does not end on valuation before week ${MAX_WEEKS}`, () => {
    const state = createInitialGameState(9);
    state.week = MAX_WEEKS - 1;
    const next = advanceWeek(state);
    expect(next.isGameOver).toBe(false);
    expect(next.week).toBe(MAX_WEEKS);
  });

  it(`ends with the Kingpin valuation tiebreaker at the end of week ${MAX_WEEKS}`, () => {
    const state = createInitialGameState(9);
    state.week = MAX_WEEKS;
    state.syndicates.ai_2!.cleanCash = 40000;
    const next = advanceWeek(state);
    expect(next.isGameOver).toBe(true);
    expect(next.winReason).toBe('VALUATION');
    expect(next.winnerId).toBe('ai_2');
    expect(next.week).toBe(MAX_WEEKS); // week counter does not advance past the last week
  });

  it(`a siege declared in week ${MAX_WEEKS - 2} is the last one that can resolve`, () => {
    const state = createInitialGameState(9);
    state.rackets.fish_market!.ownerId = 'ai_1';
    state.week = MAX_WEEKS - 2;
    expect(applyAction(state, 'player', { type: 'SEIZE', racketId: 'fish_market', prepTier: 0 }).result.resolveWeek).toBe(MAX_WEEKS);
    state.week = MAX_WEEKS - 1;
    expect(applyAction(state, 'player', { type: 'SEIZE', racketId: 'fish_market', prepTier: 0 }).result.executed).toBe(false);
  });
});
