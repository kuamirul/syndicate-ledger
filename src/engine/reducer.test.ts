import { describe, expect, it } from 'vitest';
import { MAX_WEEKS } from './constants';
import {
  advanceWeek,
  applyAction,
  calculateSyndicateValuation,
  countOwnedRackets,
  createInitialGameState,
  hasDistrictMonopoly,
  projectSundayHeat,
} from './reducer';

describe('Weekly Turn Flow & Reducer Engine', () => {
  describe('Initial Game State Factory', () => {
    it('initializes 4 symmetric syndicates with baseline parameters', () => {
      const state = createInitialGameState(100);

      expect(state.week).toBe(1);
      expect(state.isGameOver).toBe(false);
      expect(state.winnerId).toBeNull();
      expect(Object.keys(state.syndicates)).toHaveLength(4);

      for (const syndicate of Object.values(state.syndicates)) {
        expect(syndicate.dirtyCash).toBe(6000);
        expect(syndicate.cleanCash).toBe(0);
        expect(syndicate.heat).toBe(10);
        expect(syndicate.ricoCounter).toBe(0);
        expect(syndicate.actionPoints).toBe(3);
        expect(syndicate.crew).toEqual({ thug: 4, enforcer: 0, hitman: 0 });
        expect(syndicate.isEliminated).toBe(false);
      }

      expect(state.syndicates.player?.isPlayer).toBe(true);
      expect(state.syndicates.ai_1?.isPlayer).toBe(false);
    });

    it('initializes 12 neutral rackets with zero damage', () => {
      const state = createInitialGameState(100);
      expect(Object.keys(state.rackets)).toHaveLength(12);

      for (const racket of Object.values(state.rackets)) {
        expect(racket.ownerId).toBeNull();
        expect(racket.damagedTurnsRemaining).toBe(0);
      }
    });
  });

  describe('Player & AI Action Phase (applyAction)', () => {
    it('executes EXTORT action and deducts AP and prep cost', () => {
      const state = createInitialGameState(42);
      const { state: nextState, result } = applyAction(state, 'player', {
        type: 'EXTORT',
        jobId: 'shakedown',
        prepTier: 1, // $1,200 prep
      });

      expect(result.success).toBe(true);
      expect(nextState.syndicates.player?.actionPoints).toBe(2);
      // DirtyCash: 6000 - 1200 prep + payout
      expect(nextState.syndicates.player?.dirtyCash).toBeGreaterThanOrEqual(4800);
    });

    it('prevents actions when AP is zero', () => {
      const state = createInitialGameState(42);
      state.syndicates.player!.actionPoints = 0;

      const { result } = applyAction(state, 'player', { type: 'PASS' });
      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/insufficient action points/i);
    });

    it('executes SEIZE action on a neutral racket', () => {
      const state = createInitialGameState(12345);
      const { state: nextState, result } = applyAction(state, 'player', {
        type: 'SEIZE',
        racketId: 'fish_market',
        prepTier: 2, // $2,800 prep + $1,500 assault = $4,300
      });

      expect(nextState.syndicates.player?.actionPoints).toBe(2);
      expect(nextState.syndicates.player?.dirtyCash).toBe(6000 - 4300);

      if (result.success) {
        expect(nextState.rackets.fish_market?.ownerId).toBe('player');
      }
    });

    it('botched SEIZE is executed but unsuccessful: AP, cost and crew are committed', () => {
      let found = false;
      for (let seed = 1; seed <= 500 && !found; seed++) {
        const state = createInitialGameState(seed);
        const { state: next, result } = applyAction(state, 'player', {
          type: 'SEIZE',
          racketId: 'fish_market',
          prepTier: 1,
        });
        if (result.outcome !== 'BOTCHED') continue;
        found = true;

        expect(result.executed).toBe(true);
        expect(result.success).toBe(false);
        expect(next).not.toBe(state);
        expect(next.syndicates.player?.actionPoints).toBe(2);
        expect(next.syndicates.player?.dirtyCash).toBe(6000 - 1500 - 1200);
        expect(result.casualtiesLost).toBe(2);
        expect(next.syndicates.player?.crew.thug).toBe(2);
        expect(next.rackets.fish_market?.ownerId).toBeNull();
        // input untouched
        expect(state.syndicates.player?.actionPoints).toBe(3);
      }
      expect(found).toBe(true);
    });

    it('rejections return executed:false and the same state reference', () => {
      const state = createInitialGameState(42);
      const broke = createInitialGameState(42);
      broke.syndicates.player!.dirtyCash = 0;
      const noAp = createInitialGameState(42);
      noAp.syndicates.player!.actionPoints = 0;

      const cases: Array<[typeof state, Parameters<typeof applyAction>[2], string]> = [
        [noAp, { type: 'PASS' }, 'player'],
        [broke, { type: 'SEIZE', racketId: 'fish_market', prepTier: 0 }, 'player'],
        [state, { type: 'SEIZE', racketId: 'nope', prepTier: 0 }, 'player'],
        [state, { type: 'RECRUIT', tier: 'enforcer', count: 1 }, 'player'],
        [state, { type: 'LAUNDER', amount: 20000 }, 'player'],
        [state, { type: 'BRIBE', useClean: true }, 'player'],
        [state, { type: 'WIRETAP', targetSyndicateId: 'player' }, 'player'],
        [state, { type: 'PASS' }, 'ghost'],
      ];
      for (const [s, action, id] of cases) {
        const { state: next, result } = applyAction(s, id, action);
        expect(result.executed).toBe(false);
        expect(result.success).toBe(false);
        expect(next).toBe(s);
      }
    });

    it('executes RECRUIT action respecting racket thresholds', () => {
      const state = createInitialGameState(42);

      // Thug recruitment (0 rackets required)
      const { state: s1, result: r1 } = applyAction(state, 'player', {
        type: 'RECRUIT',
        tier: 'thug',
        count: 2, // 2 * $800 = $1,600
      });

      expect(r1.success).toBe(true);
      expect(s1.syndicates.player?.crew.thug).toBe(6);
      expect(s1.syndicates.player?.dirtyCash).toBe(6000 - 1600);

      // Enforcer recruitment fails without 2 rackets
      const { result: r2 } = applyAction(s1, 'player', {
        type: 'RECRUIT',
        tier: 'enforcer',
        count: 1,
      });

      expect(r2.success).toBe(false);
      expect(r2.reason).toMatch(/requires at least 2 owned rackets/i);
    });

    it('executes LAUNDER action at 25% fee', () => {
      const state = createInitialGameState(42);
      const { state: nextState, result } = applyAction(state, 'player', {
        type: 'LAUNDER',
        amount: 4000,
      });

      expect(result.success).toBe(true);
      expect(nextState.syndicates.player?.dirtyCash).toBe(2000);
      expect(nextState.syndicates.player?.cleanCash).toBe(3000); // 75% of 4000
    });

    it('executes BRIBE to reduce self Heat or frame a rival', () => {
      const state = createInitialGameState(42);
      state.syndicates.player!.heat = 50;

      // Self bribe using DirtyCash ($4,500 for -22 heat)
      const { state: s1, result: r1 } = applyAction(state, 'player', {
        type: 'BRIBE',
        useClean: false,
      });

      expect(r1.success).toBe(true);
      expect(s1.syndicates.player?.dirtyCash).toBe(1500);
      expect(s1.syndicates.player?.heat).toBe(28); // 50 - 22

      // Frame rival ai_1 (+12 heat to ai_1)
      s1.syndicates.player!.dirtyCash = 5000;
      const { state: s2, result: r2 } = applyAction(s1, 'player', {
        type: 'BRIBE',
        useClean: false,
        targetSyndicateId: 'ai_1',
      });

      expect(r2.success).toBe(true);
      expect(s2.syndicates.ai_1?.heat).toBe(22); // 10 + 12
      expect(s2.syndicates.ai_1?.grudge['player']).toBe(10);
    });

    it('executes WIRETAP against a rival', () => {
      const state = createInitialGameState(42);
      const { state: nextState, result } = applyAction(state, 'player', {
        type: 'WIRETAP',
        targetSyndicateId: 'ai_2',
      });

      expect(result.success).toBe(true);
      expect(nextState.syndicates.player?.dirtyCash).toBe(5000);
      expect(nextState.syndicates.player?.wiretapTurnsRemaining['ai_2']).toBe(3);
    });
  });

  describe('Sunday Ledger Phase (advanceWeek)', () => {
    it('collects dirtyYield with +25% monopoly bonus for district ownership', () => {
      const state = createInitialGameState(42);

      // Grant player all 3 docks rackets (Fish Market, Union Pier, Bonded Warehouse: $1,300 each)
      state.rackets.fish_market!.ownerId = 'player';
      state.rackets.union_pier!.ownerId = 'player';
      state.rackets.bonded_warehouse!.ownerId = 'player';

      expect(hasDistrictMonopoly('player', 'docks', state.rackets)).toBe(true);

      const nextState = advanceWeek(state);
      // Yield without monopoly: 3 * 1,300 = 3,900
      // Yield with monopoly: 3 * Math.floor(1,300 * 1.25) = 3 * 1,625 = 4,875
      // Payroll: 4 thugs * 250 = 1,000
      // Net DirtyCash: 6,000 + 4,875 - 1,000 = 9,875
      expect(nextState.syndicates.player?.dirtyCash).toBe(9875);
    });

    it('deducts payroll from DirtyCash first and overflows into CleanCash', () => {
      const state = createInitialGameState(42);
      state.syndicates.player!.dirtyCash = 400;
      state.syndicates.player!.cleanCash = 2000;

      // Payroll: 4 thugs * 250 = $1,000.
      // DirtyCash pays $400 (reaches $0), CleanCash pays $600 (reaches $1,400).
      const nextState = advanceWeek(state);
      expect(nextState.syndicates.player?.dirtyCash).toBe(0);
      expect(nextState.syndicates.player?.cleanCash).toBe(1400);
    });

    it('forcibly liquidates lowest-value racket to cover payroll debt', () => {
      const state = createInitialGameState(42);
      state.syndicates.player!.dirtyCash = 0;
      state.syndicates.player!.cleanCash = 0;

      // Owns fish_market ($4,000 base value) and grand_casino ($18,000 base value)
      state.rackets.fish_market!.ownerId = 'player';
      state.rackets.grand_casino!.ownerId = 'player';

      // Yields collected: 1300 + 5800 = 7100.
      // To simulate debt after yield, inflate payroll with Hitmen
      state.syndicates.player!.crew = { thug: 0, enforcer: 0, hitman: 10 }; // $13,000 payroll!
      // Yield = 7,100, payroll = 13,000. Deficit = $5,900.
      // Liquidating fish_market (lowest value) yields 50% * 4,000 = $2,000.
      // Still in deficit ($3,900). Liquidating grand_casino yields 50% * 18,000 = $9,000.
      // Deficit covered!

      const nextState = advanceWeek(state);
      expect(nextState.rackets.fish_market?.ownerId).toBeNull();
      expect(nextState.rackets.grand_casino?.ownerId).toBeNull();
      expect(nextState.syndicates.player?.isEliminated).toBe(false);
      expect(nextState.syndicates.player?.cleanCash).toBeGreaterThanOrEqual(0);
    });

    it('eliminates syndicate with INSOLVENT when debt cannot be covered and 0 rackets remain', () => {
      const state = createInitialGameState(42);
      state.syndicates.player!.dirtyCash = 0;
      state.syndicates.player!.cleanCash = 0;
      state.syndicates.player!.crew = { thug: 10, enforcer: 0, hitman: 0 }; // $2,500 payroll, 0 rackets

      const nextState = advanceWeek(state);
      expect(nextState.syndicates.player?.isEliminated).toBe(true);
      expect(nextState.syndicates.player?.eliminationReason).toBe('INSOLVENT');
    });

    it('eliminates syndicate with RICO on 2 consecutive weeks at 100 Heat', () => {
      let state = createInitialGameState(42);
      // Give player 2 Uptown rackets (Penthouse Lounge and City Hall Annex: +4 heat each = +8 heat/wk)
      // Net passive heat = -5 base decay + 8 racket heat = +3, keeping Heat locked at 100
      state.rackets.penthouse_lounge!.ownerId = 'player';
      state.rackets.city_hall_annex!.ownerId = 'player';
      state.syndicates.player!.heat = 100;

      state = advanceWeek(state);
      expect(state.syndicates.player?.heat).toBe(100);
      expect(state.syndicates.player?.ricoCounter).toBe(1);
      expect(state.syndicates.player?.isEliminated).toBe(false);

      // Advance second week; heat stays 100
      state = advanceWeek(state);

      expect(state.syndicates.player?.isEliminated).toBe(true);
      expect(state.syndicates.player?.eliminationReason).toBe('RICO');
      // Owned rackets should be released back to neutral
      expect(state.rackets.penthouse_lounge?.ownerId).toBeNull();
      expect(state.rackets.city_hall_annex?.ownerId).toBeNull();
    });

    it('eliminates syndicate with WIPED_OUT when 0 crew, 0 rackets, and cash < $1,000', () => {
      const state = createInitialGameState(42);
      state.syndicates.player!.crew = { thug: 0, enforcer: 0, hitman: 0 };
      state.syndicates.player!.dirtyCash = 500;
      state.syndicates.player!.cleanCash = 0;

      const nextState = advanceWeek(state);
      expect(nextState.syndicates.player?.isEliminated).toBe(true);
      expect(nextState.syndicates.player?.eliminationReason).toBe('WIPED_OUT');
    });

    it('awards Domination Win when a syndicate owns >= 8 rackets with Heat < 100', () => {
      const state = createInitialGameState(42);
      // Give player 8 rackets
      const racketIds = Object.keys(state.rackets).slice(0, 8);
      for (const id of racketIds) {
        state.rackets[id]!.ownerId = 'player';
      }

      expect(countOwnedRackets('player', state.rackets)).toBe(8);
      const nextState = advanceWeek(state);

      expect(nextState.isGameOver).toBe(true);
      expect(nextState.winnerId).toBe('player');
      expect(nextState.winReason).toBe('DOMINATION');
    });

    it(`awards Week ${MAX_WEEKS} Kingpin Tiebreaker to highest valuation syndicate`, () => {
      const state = createInitialGameState(42);
      state.week = MAX_WEEKS;
      state.syndicates.player!.cleanCash = 50000; // Valuation = 100k + cash

      const nextState = advanceWeek(state);
      expect(nextState.isGameOver).toBe(true);
      expect(nextState.winnerId).toBe('player');
      expect(nextState.winReason).toBe('VALUATION');
    });

    it('appends immutable WeekSnapshot to history and increments week', () => {
      const state = createInitialGameState(42);
      const nextState = advanceWeek(state);

      expect(nextState.week).toBe(2);
      expect(nextState.history).toHaveLength(1);
      expect(nextState.history[0]?.week).toBe(1);
      expect(nextState.history[0]?.syndicates.player?.valuation).toBe(
        calculateSyndicateValuation(nextState.syndicates.player!, nextState.rackets)
      );
    });

    it('is strictly deterministic across identical seeds', () => {
      const state1 = createInitialGameState(999);
      const state2 = createInitialGameState(999);

      const next1 = advanceWeek(state1);
      const next2 = advanceWeek(state2);

      expect(next1).toEqual(next2);
    });
  });

  describe('W3-T8a — projectSundayHeat & LAST_STANDING', () => {
    it('projectSundayHeat matches the heat advanceWeek actually applies', () => {
      const cases: Array<{ heat: number; rackets: string[] }> = [
        { heat: 10, rackets: [] },
        { heat: 2, rackets: [] }, // clamps at 0
        { heat: 40, rackets: ['fish_market', 'dive_bar'] },
        { heat: 60, rackets: ['grand_casino', 'penthouse_lounge', 'city_hall_annex', 'scrap_yard', 'trucking_depot'] },
        { heat: 97, rackets: ['grand_casino', 'penthouse_lounge', 'city_hall_annex'] }, // clamps at 100
      ];
      for (const c of cases) {
        const state = createInitialGameState(5);
        state.syndicates.player!.heat = c.heat;
        state.syndicates.player!.dirtyCash = 100000; // keep payroll/raids irrelevant to heat
        for (const id of c.rackets) state.rackets[id]!.ownerId = 'player';
        const expected = projectSundayHeat('player', c.heat, state.rackets);
        expect(advanceWeek(state).syndicates.player!.heat).toBe(expected);
      }
      const docks = createInitialGameState(5);
      expect(projectSundayHeat('player', 2, docks.rackets)).toBe(0);
    });

    it('labels a sole survivor LAST_STANDING, not DOMINATION', () => {
      const state = createInitialGameState(42);
      for (const id of ['ai_1', 'ai_2', 'ai_3']) {
        state.syndicates[id]!.isEliminated = true;
        state.syndicates[id]!.eliminationReason = 'INSOLVENT';
      }
      const next = advanceWeek(state);
      expect(next.isGameOver).toBe(true);
      expect(next.winnerId).toBe('player');
      expect(next.winReason).toBe('LAST_STANDING');
    });
  });
});
