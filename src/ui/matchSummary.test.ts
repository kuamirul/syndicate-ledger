import { describe, expect, it } from 'vitest';
import { advanceWeek, calculateSyndicateValuation, cloneGameState, createInitialGameState } from '../engine/reducer';
import type { GameState } from '../engine/types';
import { isRunLive, selectMatchSummary, type MatchSummary } from './matchSummary';
import { PLAYER_ID } from './viewModel';

function fresh(mut?: (s: GameState) => void): GameState {
  const s = cloneGameState(createInitialGameState(5));
  mut?.(s);
  return s;
}
const me = (s: GameState) => s.syndicates[PLAYER_ID]!;
const FORBIDDEN = /RICO|racket|siege|launder/i;

/** Every user-visible string in a summary, for the plain-English leak check. */
function textOf(m: MatchSummary): string {
  return [m.title, m.decisiveFactor, ...m.standings.flatMap((r) => [r.outcome, r.archetypeLabel ?? '', r.name])].join(' | ');
}

describe('isRunLive', () => {
  it('is live until the match ends or the player is eliminated', () => {
    expect(isRunLive(fresh(), PLAYER_ID)).toBe(true);
    expect(isRunLive(fresh((s) => (s.isGameOver = true)), PLAYER_ID)).toBe(false);
    expect(isRunLive(fresh((s) => (me(s).isEliminated = true)), PLAYER_ID)).toBe(false);
  });
});

describe('selectMatchSummary', () => {
  it('returns null while the run is live', () => {
    expect(selectMatchSummary(fresh(), PLAYER_ID)).toBeNull();
  });

  it('Net Worth win: margin over the best rival, full 4-row standings with fog lifted', () => {
    const end = advanceWeek(
      fresh((s) => {
        s.week = 28;
        me(s).dirtyCash = 10000;
      })
    );
    expect(end).toMatchObject({ isGameOver: true, winnerId: PLAYER_ID, winReason: 'VALUATION' });
    const m = selectMatchSummary(end, PLAYER_ID)!;
    expect(m).toMatchObject({ result: 'victory', ended: 'gameOver', title: 'Victory', week: 28 });
    expect(m.standings).toHaveLength(4);
    expect(m.standings.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(m.standings[0]).toMatchObject({ id: PLAYER_ID, outcome: 'Winner — Net Worth', tone: 'win', netWorth: 9000 });
    expect(m.decisiveFactor).toBe('You won on Net Worth by $4,000 over The Iron Syndicate.');
    // Rival private numbers are shown once the run is over.
    expect(m.standings.every((r) => Number.isInteger(r.streetCash) && r.archetypeLabel !== undefined)).toBe(true);
    expect(m.standings.find((r) => r.id === 'ai_1')).toMatchObject({ streetCash: 5000, outcome: 'Still Standing' });
    expect(textOf(m)).not.toMatch(FORBIDDEN);
  });

  it('standing components add up to the engine valuation', () => {
    const end = advanceWeek(
      fresh((s) => {
        s.week = 28;
        me(s).cleanCash = 3000;
        s.rackets[Object.keys(s.rackets)[0]!]!.ownerId = 'ai_2';
      })
    );
    for (const r of selectMatchSummary(end, PLAYER_ID)!.standings) {
      expect(r.streetCash + r.safeCashScore + r.businessesValue).toBe(r.netWorth);
      expect(r.netWorth).toBe(calculateSyndicateValuation(end.syndicates[r.id]!, end.rackets));
    }
  });

  it('calls out Safe Cash x2 when the doubling decided a Net Worth win', () => {
    const end = advanceWeek(
      fresh((s) => {
        s.week = 28;
        me(s).dirtyCash = 1000;
        me(s).cleanCash = 2900; // after payroll: $0 street + $2,900 safe = 5,800 vs rivals' 5,000
      })
    );
    const m = selectMatchSummary(end, PLAYER_ID)!;
    expect(m.result).toBe('victory');
    expect(m.decisiveFactor).toBe(
      'You won on Net Worth by $800 over The Iron Syndicate. Safe Cash counting double decided it.'
    );
    expect(m.standings[0]).toMatchObject({ safeCash: 2900, safeCashScore: 5800 });
  });

  it('Net Worth loss: names the winner and the exact margin', () => {
    const end = advanceWeek(
      fresh((s) => {
        s.week = 28;
        s.syndicates.ai_1!.dirtyCash = 20000;
      })
    );
    const m = selectMatchSummary(end, PLAYER_ID)!;
    expect(m).toMatchObject({ result: 'defeat', ended: 'gameOver', title: 'Defeat' });
    expect(m.decisiveFactor).toBe('The Iron Syndicate beat you on Net Worth by $14,000.');
    expect(m.standings[0]).toMatchObject({ id: 'ai_1', outcome: 'Winner — Net Worth' });
    expect(m.standings.find((r) => r.isPlayer)).toMatchObject({ outcome: 'Still Standing' });
  });

  it('8+ Business takeover win', () => {
    const end = advanceWeek(
      fresh((s) => {
        s.week = 10;
        me(s).dirtyCash = 100000;
        Object.keys(s.rackets)
          .slice(0, 8)
          .forEach((id) => (s.rackets[id]!.ownerId = PLAYER_ID));
      })
    );
    expect(end.winReason).toBe('DOMINATION');
    const m = selectMatchSummary(end, PLAYER_ID)!;
    expect(m.result).toBe('victory');
    expect(m.standings[0]).toMatchObject({ outcome: 'Winner — 8+ Businesses', businesses: 8 });
    expect(m.decisiveFactor).toBe('You took over 8 businesses by Week 10 and won the city early.');
    expect(textOf(m)).not.toMatch(FORBIDDEN);
  });

  it('a rival Domination win is explained from the loser side', () => {
    const end = advanceWeek(
      fresh((s) => {
        s.week = 12;
        s.syndicates.ai_2!.dirtyCash = 100000;
        Object.keys(s.rackets)
          .slice(0, 8)
          .forEach((id) => (s.rackets[id]!.ownerId = 'ai_2'));
      })
    );
    const m = selectMatchSummary(end, PLAYER_ID)!;
    expect(m.result).toBe('defeat');
    expect(m.decisiveFactor).toBe('Sterling Holdings took over 8 businesses by Week 12 and won the city early.');
  });

  it('last crew standing', () => {
    const end = advanceWeek(
      fresh((s) => {
        for (const id of ['ai_1', 'ai_2', 'ai_3']) {
          s.syndicates[id]!.isEliminated = true;
          s.syndicates[id]!.eliminationReason = 'WIPED_OUT';
          s.syndicates[id]!.eliminatedWeek = 3;
        }
      })
    );
    expect(end.winReason).toBe('LAST_STANDING');
    const m = selectMatchSummary(end, PLAYER_ID)!;
    expect(m.standings[0]).toMatchObject({ isPlayer: true, outcome: 'Winner — Last Crew Standing' });
    expect(m.decisiveFactor).toContain('Every rival was knocked out');
    expect(m.standings.slice(1).every((r) => r.outcome === 'Wiped Out')).toBe(true);
  });

  it.each([
    ['RICO', 'Arrested (Police Heat)', 'you were arrested in Week 6.'],
    ['INSOLVENT', 'Bankrupt', 'went bankrupt in Week 6.'],
    ['WIPED_OUT', 'Wiped Out', 'were wiped out in Week 6.'],
  ] as const)('player eliminated by %s before the match ends', (reason, badge, phrase) => {
    const s = fresh((x) => {
      me(x).isEliminated = true;
      me(x).eliminationReason = reason;
      me(x).eliminatedWeek = 6;
      x.week = 7;
    });
    expect(s.isGameOver).toBe(false);
    const m = selectMatchSummary(s, PLAYER_ID)!;
    expect(m).toMatchObject({ result: 'defeat', ended: 'playerOut', week: 6 });
    expect(m.decisiveFactor).toContain(phrase);
    const mine = m.standings.find((r) => r.isPlayer)!;
    expect(mine).toMatchObject({ outcome: badge, tone: 'out' });
    expect(m.standings.filter((r) => r.outcome === 'Still Standing')).toHaveLength(3);
    expect(m.standings[3]).toBe(mine); // eliminated syndicates rank last
    expect(textOf(m)).not.toMatch(FORBIDDEN);
  });

  it('keeps the exact board of the elimination week (no change when time passes)', () => {
    const s = fresh((x) => {
      me(x).isEliminated = true;
      me(x).eliminationReason = 'RICO';
      me(x).eliminatedWeek = 4;
    });
    expect(selectMatchSummary(s, PLAYER_ID)).toEqual(selectMatchSummary(cloneGameState(s), PLAYER_ID));
  });
});
