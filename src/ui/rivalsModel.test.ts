import { describe, expect, it } from 'vitest';
import { RACKETS_BY_DISTRICT } from '../data';
import { evaluateCandidateActions } from '../engine/ai';
import { applyAction, cloneGameState, createInitialGameState } from '../engine/reducer';
import type { DecisionTrace, GameState } from '../engine/types';
import { buildDecisionRow, plainActionLabel, selectRivalIntel } from './rivalsModel';
import { PLAYER_ID } from './viewModel';

function fresh(mut?: (s: GameState) => void): GameState {
  const s = cloneGameState(createInitialGameState(5));
  mut?.(s);
  return s;
}
const intel = (s: GameState, guided = false, dev = false) => selectRivalIntel(s, PLAYER_ID, guided, dev);
const rival = (s: GameState, id: string, guided = false, dev = false) =>
  intel(s, guided, dev).rivals.find((r) => r.id === id)!;

const trace = (week: number, syndicateId: string): DecisionTrace => ({
  week,
  syndicateId,
  action: { type: 'PASS' },
  scores: { evScore: 10, turfScore: 20, heatRiskScore: 5, grudgeScore: 0, emergencyModifiers: 0, coalitionBonus: 0, totalScore: 0 },
  reasoning: `week ${week}`,
});

describe('selectRivalIntel redaction', () => {
  it('shows only public standings for an un-spied rival', () => {
    const r = rival(fresh(), 'ai_1');
    expect(r).toMatchObject({
      isRevealed: false,
      revealSource: null,
      intel: null,
      archetypeLabel: 'The Warlord',
      tag: 'Aggressive Expansion',
      businesses: 0,
    });
    expect(JSON.stringify(r)).not.toContain('dirtyCash');
  });

  it('reveals exact private stats while a Spy timer is running', () => {
    const s = fresh((x) => {
      x.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_1 = 3;
      x.syndicates.ai_1!.grudge[PLAYER_ID] = 42;
      x.syndicates.ai_1!.heat = 33;
    });
    const r = rival(s, 'ai_1');
    expect(r).toMatchObject({ isRevealed: true, revealSource: 'spy', spyWeeksLeft: 3 });
    expect(r.intel).toMatchObject({ dirtyCash: 6000, cleanCash: 0, totalCrew: 4, heat: 33, ricoCounter: 0, grudgeToViewer: 42 });
    expect(r.intel!.weights).toEqual({ greed: 0.9, aggression: 1.4, caution: 1, revenge: 1.5 });
  });

  it('hides the rival again when the Spy runs out, and only the spied rival is revealed', () => {
    const s = fresh((x) => (x.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_1 = 0));
    expect(rival(s, 'ai_1').intel).toBeNull();
    const one = fresh((x) => (x.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_2 = 1));
    expect(rival(one, 'ai_2').intel).not.toBeNull();
    expect(rival(one, 'ai_1').intel).toBeNull();
    expect(rival(one, 'ai_3').intel).toBeNull();
  });

  it('DEV reveals everyone without a Spy and labels the source', () => {
    const view = intel(fresh(), false, true);
    expect(view.rivals.every((r) => r.revealSource === 'dev' && r.intel !== null)).toBe(true);
  });

  it('a real WIRETAP through applyAction flips the card from redacted to revealed', () => {
    const before = fresh();
    expect(rival(before, 'ai_3').isRevealed).toBe(false);
    const { state, result } = applyAction(before, PLAYER_ID, { type: 'WIRETAP', targetSyndicateId: 'ai_3' });
    expect(result.executed).toBe(true);
    expect(rival(state, 'ai_3')).toMatchObject({ isRevealed: true, spyWeeksLeft: 3 });
  });

  it('Spy and Snitch follow the Week-4 Guided Intro lock', () => {
    expect(rival(fresh(), 'ai_1', true).spyLock).toMatchObject({ locked: true, badge: 'Unlocks Week 4' });
    expect(rival(fresh((x) => (x.week = 4)), 'ai_1', true).snitchLock.locked).toBe(false);
    expect(rival(fresh(), 'ai_1', false).spyLock.locked).toBe(false);
  });

  it('Spy / Snitch options match what applyAction accepts', () => {
    const s = fresh();
    const r = rival(s, 'ai_1');
    expect(r.spy!.disabledReason).toBeNull();
    expect(r.snitch.find((o) => !o.useClean)!.disabledReason).toBeNull();
    expect(r.snitch.find((o) => o.useClean)!.disabledReason).toContain('Safe Cash');
  });
});

describe('standings', () => {
  it('ranks by Net Worth with the player included, eliminated syndicates last', () => {
    const s = fresh((x) => {
      x.rackets[RACKETS_BY_DISTRICT.uptown[0]!.id]!.ownerId = 'ai_2';
      x.syndicates.ai_1!.dirtyCash = 20000;
      x.syndicates.ai_3!.isEliminated = true;
      x.syndicates.ai_3!.eliminationReason = 'RICO';
    });
    const rows = intel(s).standings;
    expect(rows.map((r) => r.id)).toEqual(['ai_2', 'ai_1', 'player', 'ai_3']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(rows[3]).toMatchObject({ isEliminated: true, eliminationLabel: 'Busted (2 Arrest Strikes)' });
    expect(rows[0]).toMatchObject({ businesses: 1, netWorth: 24000 });
    expect(intel(s).rivals.map((r) => r.id)).not.toContain('player');
  });
});

describe('decision traces', () => {
  it("uses only the rival's most recent logged turn", () => {
    const s = fresh((x) => {
      x.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_1 = 3;
      x.decisionTraces = [trace(1, 'ai_1'), trace(1, 'ai_1'), trace(2, 'ai_1'), trace(2, 'ai_2'), trace(3, 'ai_3')];
    });
    const i = rival(s, 'ai_1').intel!;
    expect(i.lastTurnWeek).toBe(2);
    expect(i.lastTurn.map((r) => r.reasoning)).toEqual(['week 2']);
    expect(rival(fresh((x) => (x.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_2 = 1)), 'ai_2').intel).toMatchObject({
      lastTurnWeek: null,
      lastTurn: [],
    });
  });

  it('next-turn top 3 equals the engine ranking and is sorted by total', () => {
    const s = fresh((x) => (x.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_2 = 3));
    const top = rival(s, 'ai_2').intel!.nextTop3;
    const engine = evaluateCandidateActions(s, 'ai_2').slice(0, 3);
    expect(top.map((r) => r.total)).toEqual(engine.map((c) => c.scores.totalScore));
    expect(top).toHaveLength(3);
    expect(top[0]!.total).toBeGreaterThanOrEqual(top[1]!.total);
  });

  it('weights each score term by the archetype and keeps Emergency / Anti-Leader unweighted', () => {
    const row = buildDecisionRow(
      { type: 'PASS' },
      { evScore: 10, turfScore: 20, heatRiskScore: 5, grudgeScore: 4, emergencyModifiers: 75, coalitionBonus: 40, totalScore: 0 },
      'why',
      { greed: 2, aggression: 1.5, caution: 1, revenge: 0.5 }
    );
    expect(row.rows.map((r) => r.contribution)).toEqual([20, 30, -5, 2]);
    expect(row).toMatchObject({ emergency: 75, coalition: 40, label: 'Pass' });
  });

  it('describes actions in plain English', () => {
    const s = fresh();
    expect(plainActionLabel({ type: 'WIRETAP', targetSyndicateId: 'ai_1' }, s)).toBe('Spy on The Iron Syndicate');
    expect(plainActionLabel({ type: 'BRIBE', useClean: true }, s)).toBe('Pay Off Cops');
    expect(plainActionLabel({ type: 'LAUNDER', amount: 5000 })).toBe('Bank $5,000 Safe Cash');
  });
});
