// W3-T8b — 2-turn Siege telegraph, siege/frame caps, grudge clamp + decay, Progressive Empire Overhead.

import { describe, expect, it } from 'vitest';
import {
  ASSAULT_BASE_COST,
  BRIBE_DIRTY_COST,
  GRUDGE_MAX,
  MAX_FRAMES_PER_WEEK,
  MAX_OUTGOING_SIEGES,
  MAX_WEEKS,
  SIEGE_LEAD_WEEKS,
} from './constants';
import {
  addGrudge,
  advanceWeek,
  applyAction,
  calculateProjectedRacketYield,
  cloneGameState,
  countOwnedRackets,
  createInitialGameState,
  decayGrudge,
  projectSundayHeat,
  turfUpkeep,
} from './reducer';
import type { Action, GameState } from './types';

/** Fresh state with `owner` holding the given rackets. */
function withRackets(owner: string, racketIds: string[], seed = 7): GameState {
  const state = createInitialGameState(seed);
  for (const id of racketIds) state.rackets[id]!.ownerId = owner;
  return state;
}

const seize = (racketId: string, prepTier: 0 | 1 | 2 = 0): Action => ({ type: 'SEIZE', racketId, prepTier });

describe('W3-T8b — rival SEIZE is a queued 2-turn siege', () => {
  it('queues instead of rolling: cost and AP spent, ownership and RNG untouched', () => {
    const state = withRackets('ai_1', ['fish_market']);
    const { state: next, result } = applyAction(state, 'player', seize('fish_market', 1));

    expect(result.executed).toBe(true);
    expect(result.queued).toBe(true);
    expect(result.resolveWeek).toBe(state.week + SIEGE_LEAD_WEEKS);
    expect(result.outcome).toBeUndefined();
    expect(next.syndicates.player!.dirtyCash).toBe(6000 - ASSAULT_BASE_COST - 1200);
    expect(next.syndicates.player!.actionPoints).toBe(2);
    expect(next.rackets.fish_market!.ownerId).toBe('ai_1');
    expect(next.rngState).toBe(state.rngState);
    expect(next.activeSieges).toEqual([
      {
        id: `1:player:fish_market`,
        attackerId: 'player',
        racketId: 'fish_market',
        prepTier: 1,
        telegraphedWeek: 1,
        resolveWeek: 1 + SIEGE_LEAD_WEEKS,
      },
    ]);
    // Input state is not mutated.
    expect(state.activeSieges).toEqual([]);
  });

  it('a neutral SEIZE still resolves instantly', () => {
    const state = createInitialGameState(7);
    const { state: next, result } = applyAction(state, 'player', seize('fish_market'));
    expect(result.queued).toBeUndefined();
    expect(result.outcome).toBeDefined();
    expect(next.rngState).not.toBe(state.rngState);
    expect(next.activeSieges).toEqual([]);
  });

  it('resolves at the start of week + 2 (not before), consuming RNG only then', () => {
    const queued = applyAction(withRackets('ai_1', ['fish_market']), 'player', seize('fish_market')).state;

    const week2 = advanceWeek(queued);
    expect(week2.week).toBe(2);
    expect(week2.activeSieges).toHaveLength(1);
    expect(week2.rngState).toBe(queued.rngState); // Heat is low: no raid rolls, no siege roll yet.

    const week3 = advanceWeek(week2);
    expect(week3.week).toBe(3);
    expect(week3.activeSieges).toEqual([]);
    expect(week3.rngState).not.toBe(week2.rngState);
    const event = week3.history.at(-1)!.events.find((e) => e.includes('siege on Fish Market'));
    expect(event).toMatch(/^Start of week 3: Player Syndicate's siege on Fish Market (took the racket|failed) \((CLEAN|MESSY|BOTCHED), roll \d+/);
    const took = event!.includes('took the racket');
    expect(week3.rackets.fish_market!.ownerId).toBe(took ? 'player' : 'ai_1');
  });

  it('is deterministic: same seed and actions give an identical state', () => {
    const run = () => {
      let s = applyAction(withRackets('ai_1', ['fish_market', 'union_pier'], 99), 'player', seize('fish_market', 2)).state;
      s = applyAction(s, 'ai_2', seize('union_pier')).state;
      s = advanceWeek(s);
      return advanceWeek(s);
    };
    expect(run()).toEqual(run());
  });

  it('is called off (no refund, no roll) if the attacker is eliminated before it resolves', () => {
    const queued = applyAction(withRackets('ai_1', ['fish_market']), 'player', seize('fish_market')).state;
    const week2 = cloneGameState(advanceWeek(queued));
    week2.syndicates.player!.isEliminated = true;
    const week3 = advanceWeek(week2);
    expect(week3.activeSieges).toEqual([]);
    expect(week3.rngState).toBe(week2.rngState);
    expect(week3.rackets.fish_market!.ownerId).toBe('ai_1');
    expect(week3.history.at(-1)!.events.some((e) => e.includes('called off (attacker eliminated)'))).toBe(true);
  });

  it('is called off if the attacker already owns the racket when it resolves', () => {
    const queued = applyAction(withRackets('ai_1', ['fish_market']), 'player', seize('fish_market')).state;
    const week2 = cloneGameState(advanceWeek(queued));
    week2.rackets.fish_market!.ownerId = 'player';
    const week3 = advanceWeek(week2);
    expect(week3.activeSieges).toEqual([]);
    expect(week3.history.at(-1)!.events.some((e) => e.includes('called off (already theirs)'))).toBe(true);
  });

  it(`rejects a siege that would resolve after week ${MAX_WEEKS} (neutral SEIZE still allowed)`, () => {
    const state = withRackets('ai_1', ['fish_market']);
    state.week = MAX_WEEKS - 1;
    const rival = applyAction(state, 'player', seize('fish_market'));
    expect(rival.result.executed).toBe(false);
    expect(rival.result.reason).toMatch(/Too late/);
    expect(applyAction(state, 'player', seize('union_pier')).result.executed).toBe(true);
  });
});

describe('W3-T8b — symmetric siege cap', () => {
  it(`allows at most ${MAX_OUTGOING_SIEGES} queued sieges and one per racket, for player and AI alike`, () => {
    for (const attacker of ['player', 'ai_2']) {
      let state = withRackets('ai_1', ['fish_market', 'union_pier', 'bonded_warehouse']);
      state.syndicates[attacker]!.dirtyCash = 50000;

      state = applyAction(state, attacker, seize('fish_market')).state;
      const dup = applyAction(state, attacker, seize('fish_market'));
      expect(dup.result.executed).toBe(false);
      expect(dup.result.reason).toBe('Already besieging this racket');

      state = applyAction(state, attacker, seize('union_pier')).state;
      expect(state.activeSieges.filter((s) => s.attackerId === attacker)).toHaveLength(MAX_OUTGOING_SIEGES);

      const third = applyAction(state, attacker, seize('bonded_warehouse'));
      expect(third.result.executed).toBe(false);
      expect(third.result.reason).toMatch(/Too many sieges underway/);
    }
  });

  it('frees a slot once a siege resolves', () => {
    let state = withRackets('ai_1', ['fish_market', 'union_pier']);
    state.rackets.scrap_yard!.ownerId = 'ai_3'; // untouched by the first two sieges
    state.syndicates.player!.dirtyCash = 50000;
    state = applyAction(state, 'player', seize('fish_market')).state;
    state = applyAction(state, 'player', seize('union_pier')).state;
    expect(applyAction(state, 'player', seize('scrap_yard')).result.executed).toBe(false);
    state = advanceWeek(advanceWeek(state));
    expect(state.activeSieges).toEqual([]);
    expect(state.rackets.scrap_yard!.ownerId).toBe('ai_3');
    expect(applyAction(state, 'player', seize('scrap_yard')).result.queued).toBe(true);
  });
});

describe('W3-T8b — frame cap', () => {
  it(`limits BRIBE (Frame) to ${MAX_FRAMES_PER_WEEK} per syndicate per week; self-BRIBE is unlimited; resets on Sunday`, () => {
    let state = createInitialGameState(3);
    state.syndicates.player!.dirtyCash = 50000;
    const frame = (target: string): Action => ({ type: 'BRIBE', useClean: false, targetSyndicateId: target });

    state = applyAction(state, 'player', frame('ai_1')).state;
    expect(state.syndicates.player!.framesThisWeek).toBe(1);
    const second = applyAction(state, 'player', frame('ai_2'));
    expect(second.result.executed).toBe(false);
    expect(second.result.reason).toMatch(/Frame limit reached/);
    expect(second.state.syndicates.player!.dirtyCash).toBe(50000 - BRIBE_DIRTY_COST); // nothing charged

    const self = applyAction(state, 'player', { type: 'BRIBE', useClean: false });
    expect(self.result.executed).toBe(true);

    const nextWeek = advanceWeek(state);
    expect(nextWeek.syndicates.player!.framesThisWeek).toBe(0);
    expect(applyAction(nextWeek, 'player', frame('ai_2')).result.executed).toBe(true);
  });
});

describe('W3-T8b — grudge clamp and Sunday decay', () => {
  it('clamps stored grudge to 0..GRUDGE_MAX', () => {
    const state = createInitialGameState(1);
    const holder = state.syndicates.ai_1!;
    holder.grudge.player = 90;
    addGrudge(holder, 'player', 25);
    expect(holder.grudge.player).toBe(GRUDGE_MAX);
    addGrudge(holder, 'player', -500);
    expect(holder.grudge.player).toBe(0);
  });

  it('a frame cannot push grudge past the cap', () => {
    const state = createInitialGameState(1);
    state.syndicates.ai_1!.grudge.player = 95;
    const next = applyAction(state, 'player', { type: 'BRIBE', useClean: false, targetSyndicateId: 'ai_1' }).state;
    expect(next.syndicates.ai_1!.grudge.player).toBe(GRUDGE_MAX);
  });

  it('cools grudge by 10% (floored) every Sunday until it reaches 0', () => {
    expect([100, 50, 9, 1, 0].map(decayGrudge)).toEqual([90, 45, 8, 0, 0]);
    const state = createInitialGameState(1);
    state.syndicates.ai_1!.grudge = { player: 50, ai_2: 9, ai_3: 1 };
    expect(advanceWeek(state).syndicates.ai_1!.grudge).toEqual({ player: 45, ai_2: 8, ai_3: 0 });
  });
});

describe('W3-T8b — Progressive Empire Overhead', () => {
  it('Turf Upkeep = 600 * max(0, owned - 3)^2', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(turfUpkeep)).toEqual([0, 0, 0, 0, 600, 2400, 5400, 9600, 15000]);
  });

  it('charges Turf Upkeep with Crew Payroll on Sunday and logs it as its own line', () => {
    const state = withRackets('player', ['fish_market', 'union_pier', 'bonded_warehouse', 'dive_bar']);
    const yieldTotal = calculateProjectedRacketYield('player', state.rackets);
    const next = advanceWeek(state);
    expect(next.syndicates.player!.dirtyCash).toBe(6000 + yieldTotal - 1000 - 600);
    expect(next.history.at(-1)!.events).toContain('Player Syndicate paid $1000 Crew Payroll + $600 Turf Upkeep (4 rackets).');
  });

  it('logs no upkeep line at 3 or fewer rackets', () => {
    const next = advanceWeek(withRackets('player', ['fish_market', 'union_pier', 'bonded_warehouse']));
    expect(next.history.at(-1)!.events.some((e) => e.includes('Turf Upkeep'))).toBe(false);
  });

  it('forces liquidation (lowest value first) when payroll + upkeep exceed cash and yield', () => {
    const owned = ['fish_market', 'union_pier', 'bonded_warehouse', 'dive_bar', 'velvet_club', 'sportsbook_parlor', 'scrap_yard', 'trucking_depot'];
    const state = withRackets('player', owned);
    state.syndicates.player!.dirtyCash = 0;
    for (const id of owned) state.rackets[id]!.damagedTurnsRemaining = 1; // halve yield
    // Yield 10,736 vs bill 1,000 + 15,000: short 5,264 -> three Docks rackets sold at $2,000 each.
    expect(calculateProjectedRacketYield('player', state.rackets)).toBe(10736);
    const next = advanceWeek(state);
    const sold = next.history.at(-1)!.events.filter((e) => e.startsWith('Player Syndicate liquidated'));
    expect(sold).toHaveLength(3);
    expect(['fish_market', 'union_pier', 'bonded_warehouse'].every((id) => next.rackets[id]!.ownerId === null)).toBe(true);
    expect(countOwnedRackets('player', next.rackets)).toBe(5);
    expect(next.syndicates.player!.cleanCash).toBe(736);
    expect(next.syndicates.player!.isEliminated).toBe(false);
  });

  it('Empire Heat is +5 per racket above 3', () => {
    const state = withRackets('player', ['fish_market', 'union_pier', 'bonded_warehouse', 'dive_bar', 'velvet_club']);
    // 10 - 5 + passive (1+1+1+2+2) + (5-3)*5
    expect(projectSundayHeat('player', 10, state.rackets)).toBe(22);
  });
});
