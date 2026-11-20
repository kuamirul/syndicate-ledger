import { describe, expect, it } from 'vitest';
import { cloneGameState, advanceWeek, createInitialGameState } from '../engine/reducer';
import type { GameState } from '../engine/types';
import { PLAYER_ID } from '../ui/viewModel';
import { selectCityRank, selectIncomingRaidCount, selectNetWorth, selectSundayProjection } from './selectors';

/** Parity: projected Sunday numbers must equal the real advanceWeek() player result. */
function expectParity(state: GameState) {
  const proj = selectSundayProjection(state, PLAYER_ID)!;
  const next = advanceWeek(state);
  const p = next.syndicates[PLAYER_ID]!;
  if (p.isEliminated || proj.forcedSaleRisk) return proj; // liquidation path is covered separately
  if (state.syndicates[PLAYER_ID]!.heat < 70 && proj.projectedHeat < 70) {
    expect(p.dirtyCash).toBe(proj.projectedStreet);
    expect(p.cleanCash).toBe(proj.projectedSafe);
  }
  expect(p.heat).toBe(proj.projectedHeat);
  return proj;
}

function owned(state: GameState, ids: string[]) {
  for (const id of ids) state.rackets[id]!.ownerId = PLAYER_ID;
}

describe('selectSundayProjection parity with advanceWeek', () => {
  it('matches on a fresh game (no businesses)', () => {
    const s = createInitialGameState(11);
    const proj = expectParity(s);
    expect(proj.income).toBe(0);
    expect(proj.heatDelta).toBe(-5);
  });

  it('matches with a full District monopoly (+25%) and a damaged business (50%)', () => {
    const s = cloneGameState(createInitialGameState(11));
    const ids = Object.values(s.rackets).filter((r) => r.district === Object.values(s.rackets)[0]!.district).map((r) => r.id);
    owned(s, ids);
    const mono = expectParity(s);
    const single = Math.floor(s.rackets[ids[0]!]!.dirtyYield * 1.25);
    expect(mono.income).toBe(single * 3);
    s.rackets[ids[0]!]!.damagedTurnsRemaining = 1;
    const damaged = expectParity(s);
    expect(damaged.income).toBe(Math.floor(single * 0.5) + single * 2);
  });

  it('matches with 5 businesses: Size Tax and Empire Heat', () => {
    const s = cloneGameState(createInitialGameState(11));
    owned(s, Object.keys(s.rackets).slice(0, 5));
    s.syndicates[PLAYER_ID]!.dirtyCash = 50000;
    const proj = expectParity(s);
    expect(proj.sizeTax).toBe(2400);
    expect(proj.net).toBe(proj.income - proj.crewPayroll - 2400);
  });

  it('spills the bill into Safe Cash when Street Cash is short', () => {
    const s = cloneGameState(createInitialGameState(11));
    s.syndicates[PLAYER_ID]!.dirtyCash = 0;
    s.syndicates[PLAYER_ID]!.cleanCash = 5000;
    const proj = expectParity(s);
    expect(proj.projectedStreet).toBe(0);
    expect(proj.projectedSafe).toBe(5000 - proj.crewPayroll);
  });

  it('flags forced-sale risk when total cash would go negative', () => {
    const s = cloneGameState(createInitialGameState(11));
    s.syndicates[PLAYER_ID]!.dirtyCash = 0;
    s.syndicates[PLAYER_ID]!.cleanCash = 0;
    const proj = selectSundayProjection(s, PLAYER_ID)!;
    expect(proj.forcedSaleRisk).toBe(true);
    expect(proj.projectedSafe).toBe(-proj.crewPayroll);
  });

  it('clamps projected heat and raises the raid-risk flag', () => {
    const s = cloneGameState(createInitialGameState(11));
    s.syndicates[PLAYER_ID]!.heat = 98;
    owned(s, Object.keys(s.rackets).slice(0, 6));
    s.syndicates[PLAYER_ID]!.dirtyCash = 100000;
    const proj = selectSundayProjection(s, PLAYER_ID)!;
    expect(proj.projectedHeat).toBe(100);
    expect(proj.raidRisk).toBe(true);
    expect(advanceWeek(s).syndicates[PLAYER_ID]!.heat).toBe(100);
  });

  it('returns null for an unknown syndicate', () => {
    expect(selectSundayProjection(createInitialGameState(1), 'nobody')).toBeNull();
  });
});

describe('other selectors', () => {
  it('computes net worth, rank and incoming raids', () => {
    const s = cloneGameState(createInitialGameState(11));
    expect(selectNetWorth(s, PLAYER_ID)).toBe(6000);
    expect(selectCityRank(s, PLAYER_ID)).toBeGreaterThanOrEqual(1);
    s.syndicates[PLAYER_ID]!.dirtyCash = 10_000_000;
    expect(selectCityRank(s, PLAYER_ID)).toBe(1);
    const id = Object.keys(s.rackets)[0]!;
    s.rackets[id]!.ownerId = PLAYER_ID;
    s.activeSieges.push({ id: 'x', attackerId: 'ai1', racketId: id, prepTier: 0, telegraphedWeek: 1, resolveWeek: 3 });
    expect(selectIncomingRaidCount(s, PLAYER_ID)).toBe(1);
  });
});
