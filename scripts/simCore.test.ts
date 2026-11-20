import { describe, expect, it } from 'vitest';
import { MAX_WEEKS } from '../src/engine/constants';
import { assignArchetypes, formatReport, playGame, runSimulation, SEAT_IDS } from './simCore';

describe('sim core', () => {
  it('assigns 4 distinct archetypes per game and rotates fairly', () => {
    for (let i = 0; i < 10; i++) {
      const a = assignArchetypes(i);
      expect(new Set(Object.values(a)).size).toBe(SEAT_IDS.length);
    }
    const counts: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      for (const arch of Object.values(assignArchetypes(i))) counts[arch] = (counts[arch] ?? 0) + 1;
    }
    expect(Object.values(counts)).toEqual([80, 80, 80, 80, 80]);
  });

  it('playGame is deterministic and terminates with a bounded length', () => {
    const a = playGame(123, 0);
    const b = playGame(123, 0);
    expect(a).toEqual(b);
    expect(a.weeks).toBeGreaterThan(0);
    expect(a.weeks).toBeLessThanOrEqual(MAX_WEEKS);
  });

  it('runSimulation aggregates consistently and is reproducible', () => {
    const r1 = runSimulation(25, 7);
    const r2 = runSimulation(25, 7);
    expect(r1).toEqual(r2);

    const wins = Object.values(r1.archetypes).reduce((s, a) => s + a.wins, 0);
    expect(wins + r1.noWinner).toBe(25);
    expect(
      r1.winReasons.DOMINATION + r1.winReasons.VALUATION + r1.winReasons.LAST_STANDING + r1.noWinner
    ).toBe(25);
    const appearances = Object.values(r1.archetypes).reduce((s, a) => s + a.appearances, 0);
    expect(appearances).toBe(25 * SEAT_IDS.length);
    const elim = Object.values(r1.eliminationReasons).reduce((s, n) => s + n, 0);
    expect(elim).toBe(
      Object.values(r1.archetypes).reduce(
        (s, a) => s + a.eliminations.RICO + a.eliminations.INSOLVENT + a.eliminations.WIPED_OUT,
        0
      )
    );
  });

  it('W3-T8a balance regression: insolvency stays under the M1 gate on a 200-game sample', () => {
    // The full gate is `npm run sim` (1,000 games): < 5% insolvency (seats and games), every
    // archetype 12–32% wins. This smaller sample guards the insolvency side in CI.
    const r = runSimulation(200, 1);
    expect(r.seatInsolvencyRate).toBeLessThan(5);
    expect(r.gamesWithInsolvency).toBeLessThan(5);
    expect(r.noWinner).toBe(0);
  });

  it('formatReport lists every archetype', () => {
    const text = formatReport(runSimulation(5, 1), 12);
    for (const id of ['warlord', 'banker', 'rat', 'opportunist', 'turtle']) {
      expect(text).toContain(id);
    }
  });
});
