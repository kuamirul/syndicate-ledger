// W2-T5 — Symmetric Utility AI v1 Unit Tests

import { describe, expect, it } from 'vitest';
import { calculateSyndicatePayroll } from './crew';
import {
  bestJobEV,
  buildScoringContext,
  evaluateCandidateActions,
  executeAllAITurns,
  executeAIAction,
  executeAITurn,
  findCityLeader,
  generateCandidateActions,
  scoreCandidateAction,
  selectBestAIAction,
  upfrontCost,
} from './ai';
import { AI_CASH_RESERVE, AI_RICO_EMERGENCY, AI_SAFE_HEAT } from './constants';
import {
  advanceWeek,
  applyAction,
  calculateProjectedRacketYield,
  createInitialGameState,
  projectSundayHeat,
} from './reducer';
import type { GameState, SyndicateState } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone and patch a syndicate in a GameState */
function patchSyndicate(
  state: GameState,
  id: string,
  patch: Partial<SyndicateState>
): GameState {
  return {
    ...state,
    syndicates: {
      ...state.syndicates,
      [id]: { ...state.syndicates[id]!, ...patch },
    },
  };
}

/** Assign a specified number of racket ids to an owner */
function giveRackets(state: GameState, ownerId: string, racketIds: string[]): GameState {
  const rackets: GameState['rackets'] = { ...state.rackets };
  for (const id of racketIds) {
    if (rackets[id]) {
      rackets[id] = { ...rackets[id]!, ownerId };
    }
  }
  return { ...state, rackets };
}

// ---------------------------------------------------------------------------
// 1. calculateSyndicatePayroll
// ---------------------------------------------------------------------------

describe('calculateSyndicatePayroll', () => {
  it('calculates zero payroll for empty crew', () => {
    expect(calculateSyndicatePayroll({ thug: 0, enforcer: 0, hitman: 0 })).toBe(0);
  });

  it('calculates correct payroll for mixed crew — 4 thugs = $1,000', () => {
    expect(calculateSyndicatePayroll({ thug: 4, enforcer: 0, hitman: 0 })).toBe(1000);
  });

  it('calculates correct payroll for multi-tier crew', () => {
    // 2 thugs ($500) + 1 enforcer ($600) + 1 hitman ($1,300) = $2,400
    expect(calculateSyndicatePayroll({ thug: 2, enforcer: 1, hitman: 1 })).toBe(2400);
  });
});

// ---------------------------------------------------------------------------
// 2. calculateProjectedRacketYield
// ---------------------------------------------------------------------------

describe('calculateProjectedRacketYield', () => {
  it('returns 0 when syndicate owns no rackets', () => {
    const state = createInitialGameState(1);
    expect(calculateProjectedRacketYield('player', state.rackets)).toBe(0);
  });

  it('accumulates yield across multiple owned rackets', () => {
    const state = createInitialGameState(1);
    // Give player the 3 Docks rackets (yield: 1300 each)
    const docksIds = Object.values(state.rackets)
      .filter((r) => r.district === 'docks')
      .map((r) => r.id);
    const patched = giveRackets(state, 'player', docksIds);
    // 3 Docks rackets × $1,300 = $3,900, plus district monopoly (+25%): floor($3,900 × 1.25) = $4,875
    const result = calculateProjectedRacketYield('player', patched.rackets);
    expect(result).toBe(4875);
  });

  it('applies 50% yield reduction to damaged rackets', () => {
    const state = createInitialGameState(1);
    const firstRacketId = Object.keys(state.rackets)[0]!;
    const baseYield = state.rackets[firstRacketId]!.dirtyYield;
    const patched: GameState = {
      ...state,
      rackets: {
        ...state.rackets,
        [firstRacketId]: {
          ...state.rackets[firstRacketId]!,
          ownerId: 'player',
          damagedTurnsRemaining: 1,
        },
      },
    };
    expect(calculateProjectedRacketYield('player', patched.rackets)).toBe(
      Math.floor(baseYield * 0.5)
    );
  });
});

// ---------------------------------------------------------------------------
// 3. findCityLeader
// ---------------------------------------------------------------------------

describe('findCityLeader', () => {
  it('returns null when no syndicate owns >= 5 rackets', () => {
    const state = createInitialGameState(1);
    expect(findCityLeader(state.rackets)).toBeNull();
  });

  it('identifies the leader when they hold >= 5 rackets', () => {
    const state = createInitialGameState(1);
    const racketIds = Object.keys(state.rackets).slice(0, 5);
    const patched = giveRackets(state, 'ai_1', racketIds);
    expect(findCityLeader(patched.rackets)).toBe('ai_1');
  });

  it('returns null when max holding is exactly 4 rackets', () => {
    const state = createInitialGameState(1);
    const racketIds = Object.keys(state.rackets).slice(0, 4);
    const patched = giveRackets(state, 'ai_1', racketIds);
    expect(findCityLeader(patched.rackets)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. generateCandidateActions
// ---------------------------------------------------------------------------

describe('generateCandidateActions', () => {
  it('always includes at least PASS as a fallback', () => {
    const state = createInitialGameState(1);
    const actions = generateCandidateActions(state, 'ai_1');
    expect(actions.some((a) => a.type === 'PASS')).toBe(true);
  });

  it('includes EXTORT actions for all 6 jobs', () => {
    const state = createInitialGameState(1);
    const extort = generateCandidateActions(state, 'ai_1').filter(
      (a) => a.type === 'EXTORT'
    );
    // At minimum, Prep Tier 0 × 6 jobs = 6 actions
    expect(extort.length).toBeGreaterThanOrEqual(6);
  });

  it('does not generate T2/T3 recruits when racket unlock requirements not met', () => {
    const state = createInitialGameState(1);
    // Player starts with 0 rackets, so only T1 thugs should be recruitable
    const recruits = generateCandidateActions(state, 'player').filter(
      (a) => a.type === 'RECRUIT'
    );
    const illegalTiers = recruits.filter(
      (a) => a.type === 'RECRUIT' && (a.tier === 'enforcer' || a.tier === 'hitman')
    );
    expect(illegalTiers.length).toBe(0);
  });

  it('allows T2 Enforcer recruitment when >= 2 rackets owned', () => {
    const state = createInitialGameState(1);
    const racketIds = Object.keys(state.rackets).slice(0, 2);
    let patched = giveRackets(state, 'player', racketIds);
    // Ensure enough cash
    patched = patchSyndicate(patched, 'player', { dirtyCash: 50000 });
    const recruits = generateCandidateActions(patched, 'player').filter(
      (a) => a.type === 'RECRUIT' && a.tier === 'enforcer'
    );
    expect(recruits.length).toBeGreaterThan(0);
  });

  it('does not generate SEIZE for own rackets', () => {
    const state = createInitialGameState(1);
    const racketIds = Object.keys(state.rackets).slice(0, 3);
    const patched = giveRackets(state, 'ai_1', racketIds);
    const seize = generateCandidateActions(patched, 'ai_1').filter(
      (a) => a.type === 'SEIZE' && a.racketId
    );
    for (const action of seize) {
      if (action.type === 'SEIZE') {
        expect(patched.rackets[action.racketId]?.ownerId).not.toBe('ai_1');
      }
    }
  });

  it('does not generate SEIZE when dirt cash is below assault base cost ($1,500)', () => {
    const state = patchSyndicate(createInitialGameState(1), 'player', { dirtyCash: 1000 });
    const seize = generateCandidateActions(state, 'player').filter(
      (a) => a.type === 'SEIZE'
    );
    expect(seize.length).toBe(0);
  });

  it('returns empty array for eliminated syndicate', () => {
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', { isEliminated: true });
    const actions = generateCandidateActions(state, 'ai_1');
    expect(actions.length).toBe(0);
  });

  it('does not generate duplicate WIRETAP on already-active targets', () => {
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', {
      dirtyCash: 50000,
      wiretapTurnsRemaining: { ai_2: 2, ai_3: 2 },
    });
    const wiretaps = generateCandidateActions(state, 'ai_1').filter(
      (a) => a.type === 'WIRETAP'
    );
    // ai_2 and ai_3 already wiretapped; only 'player' could be new target
    for (const action of wiretaps) {
      if (action.type === 'WIRETAP') {
        expect(['ai_2', 'ai_3']).not.toContain(action.targetSyndicateId);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. scoreCandidateAction — Emergency Modifiers
// ---------------------------------------------------------------------------

describe('scoreCandidateAction — emergencyModifiers', () => {
  it('applies +75 to self-BRIBE when heat >= 80', () => {
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', {
      heat: 85,
      cleanCash: 10000,
    });
    const scored = scoreCandidateAction(state, 'ai_1', {
      type: 'BRIBE',
      useClean: true,
    });
    expect(scored.scores.emergencyModifiers).toBe(75);
  });

  it('does NOT apply +75 to frame-rival BRIBE even at high heat', () => {
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', {
      heat: 85,
      cleanCash: 10000,
    });
    const scored = scoreCandidateAction(state, 'ai_1', {
      type: 'BRIBE',
      useClean: true,
      targetSyndicateId: 'ai_2',
    });
    expect(scored.scores.emergencyModifiers).toBe(0);
  });

  it('clamps RECRUIT to -999 when projected Sunday cash < payroll', () => {
    // 4 thugs = $1,000 payroll. Start with $500 dirty and no yield.
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', {
      dirtyCash: 500,
      cleanCash: 0,
    });
    const scored = scoreCandidateAction(state, 'ai_1', {
      type: 'RECRUIT',
      tier: 'thug',
      count: 1,
    });
    expect(scored.scores.totalScore).toBe(-999);
  });

  it('applies +65 to best EXTORT when projected Sunday cash < payroll', () => {
    // 4 thugs payroll = $1,000. Actor has $500 dirt, 0 yield, 0 rackets.
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', {
      dirtyCash: 500,
      cleanCash: 0,
    });
    // Corner Shakedown (easy job, win chance typically > 60%) should get the bonus
    // We score it and check emergencyModifiers == 65 when win% >= 60
    const scored = scoreCandidateAction(state, 'ai_1', {
      type: 'EXTORT',
      jobId: 'shakedown',
      prepTier: 0,
    });
    // Win% for shakedown (diffDef=6) with 4 thugs (atk=12) should be well above 60%
    expect(scored.scores.emergencyModifiers).toBe(65);
  });
});

// ---------------------------------------------------------------------------
// 6. scoreCandidateAction — Anti-Leader Coalition
// ---------------------------------------------------------------------------

describe('scoreCandidateAction — coalitionBonus', () => {
  it('applies +40 coalition bonus when seizing a leader racket', () => {
    const state = createInitialGameState(1);
    // Give ai_1 five rackets — becomes the leader
    const leaderRacketIds = Object.keys(state.rackets).slice(0, 5);
    const patched = giveRackets(state, 'ai_1', leaderRacketIds);

    // ai_2 scores a SEIZE against one of ai_1's rackets
    const targetRacketId = leaderRacketIds[0]!;
    const scored = scoreCandidateAction(patched, 'ai_2', {
      type: 'SEIZE',
      racketId: targetRacketId,
      prepTier: 0,
    });
    expect(scored.scores.coalitionBonus).toBe(40);
  });

  it('does NOT apply coalition bonus for seizing a non-leader racket', () => {
    const state = createInitialGameState(1);
    // Give ai_1 only 4 rackets (not leader) and player gets 1
    const leaderRacketIds = Object.keys(state.rackets).slice(0, 4);
    const playerRacketIds = Object.keys(state.rackets).slice(4, 5);
    let patched = giveRackets(state, 'ai_1', leaderRacketIds);
    patched = giveRackets(patched, 'player', playerRacketIds);

    const scored = scoreCandidateAction(patched, 'ai_2', {
      type: 'SEIZE',
      racketId: playerRacketIds[0]!,
      prepTier: 0,
    });
    expect(scored.scores.coalitionBonus).toBe(0);
  });

  it('applies +40 coalition bonus when framing the leader with BRIBE', () => {
    const state = createInitialGameState(1);
    const leaderRacketIds = Object.keys(state.rackets).slice(0, 5);
    const patched = patchSyndicate(
      giveRackets(state, 'ai_1', leaderRacketIds),
      'ai_2',
      { cleanCash: 10000 }
    );
    const scored = scoreCandidateAction(patched, 'ai_2', {
      type: 'BRIBE',
      useClean: true,
      targetSyndicateId: 'ai_1',
    });
    expect(scored.scores.coalitionBonus).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// 7. Archetype Behavioral Tendencies
// ---------------------------------------------------------------------------

describe('Archetype behavioral tendencies', () => {
  it('Warlord (ai_1) should prefer SEIZE/RECRUIT over LAUNDER in mid-game', () => {
    // Set ai_1 as warlord with solid cash and several rackets
    let state = createInitialGameState(1);
    const racketIds = Object.keys(state.rackets).slice(0, 3);
    state = giveRackets(state, 'ai_1', racketIds);
    state = patchSyndicate(state, 'ai_1', { dirtyCash: 20000 });

    const ranked = evaluateCandidateActions(state, 'ai_1');
    const topAction = ranked[0]!;
    // Top action should be a SEIZE or RECRUIT for the Warlord
    expect(['SEIZE', 'RECRUIT', 'EXTORT']).toContain(topAction.action.type);
    // And LAUNDER should not be top action
    expect(topAction.action.type).not.toBe('LAUNDER');
  });

  it('Banker (ai_2) should prefer LAUNDER when accumulating dirty cash', () => {
    let state = createInitialGameState(1);
    // Give the Banker plenty of dirty cash and low heat
    state = patchSyndicate(state, 'ai_2', {
      dirtyCash: 15000,
      cleanCash: 0,
      heat: 10,
    });

    const scored = scoreCandidateAction(state, 'ai_2', {
      type: 'LAUNDER',
      amount: 10000,
    });
    // Should have an extra ev bonus for the Banker archetype (+20)
    expect(scored.scores.evScore).toBeGreaterThan(0);

    const ranked = evaluateCandidateActions(state, 'ai_2');
    expect(ranked[0]!.action.type).toBe('LAUNDER');
  });

  it('Rat (ai_3) should prioritize framing rivals with high heat', () => {
    let state = createInitialGameState(1);
    // Give ai_3 (Rat) clean cash and a rival near RICO territory
    state = patchSyndicate(state, 'ai_3', {
      cleanCash: 10000,
      heat: 10,
    });
    state = patchSyndicate(state, 'ai_1', { heat: 72 });

    const frameScored = scoreCandidateAction(state, 'ai_3', {
      type: 'BRIBE',
      useClean: true,
      targetSyndicateId: 'ai_1',
    });

    // Framing a rival near 70+ heat should have elevated turf score
    expect(frameScored.scores.turfScore).toBeGreaterThan(30);
  });

  it('Turtle should strongly favor completing district monopoly', () => {
    // Create a state where the Turtle-archetype AI owns 2 of 3 Docks rackets
    const state = createInitialGameState(1);
    const docksRackets = Object.values(state.rackets)
      .filter((r) => r.district === 'docks')
      .map((r) => r.id);

    // Give ai_1 (Warlord in default) 2/3 Docks. We'll manually check turf score.
    // For the Turtle test, build a custom state manually setting archetypeId
    let patched = giveRackets(state, 'ai_1', docksRackets.slice(0, 2));
    patched = patchSyndicate(patched, 'ai_1', {
      archetypeId: 'turtle',
      dirtyCash: 10000,
    });

    // Score seizing the last Docks racket (completing monopoly)
    const monopolyRacketId = docksRackets[2]!;
    const scored = scoreCandidateAction(patched, 'ai_1', {
      type: 'SEIZE',
      racketId: monopolyRacketId,
      prepTier: 0,
    });

    // Monopoly bonus (+40) + Turtle district bonus (+25) should be in turf
    expect(scored.scores.turfScore).toBeGreaterThan(60);
  });

  it('Opportunist should reward attacking weakened rivals', () => {
    const state = createInitialGameState(1);
    const racketId = Object.keys(state.rackets).find(
      (id) => state.rackets[id]!.ownerId === null
    )!;
    // Give a racket to a heavily weakened ai_2
    let patched = giveRackets(state, 'ai_2', [racketId]);
    patched = patchSyndicate(patched, 'ai_2', {
      crew: { thug: 1, enforcer: 0, hitman: 0 },
    });
    patched = patchSyndicate(patched, 'ai_3', {
      archetypeId: 'opportunist',
      dirtyCash: 10000,
    });

    const scored = scoreCandidateAction(patched, 'ai_3', {
      type: 'SEIZE',
      racketId,
      prepTier: 0,
    });

    // Opportunist bonus for weakened rival (crew <= 2) should apply
    expect(scored.scores.turfScore).toBeGreaterThan(40);
  });
});

// ---------------------------------------------------------------------------
// 8. evaluateCandidateActions — sorting and determinism
// ---------------------------------------------------------------------------

describe('evaluateCandidateActions — sorting & determinism', () => {
  it('returns actions sorted by totalScore descending', () => {
    const state = createInitialGameState(99);
    const ranked = evaluateCandidateActions(state, 'ai_1');
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i]!.scores.totalScore).toBeGreaterThanOrEqual(
        ranked[i + 1]!.scores.totalScore
      );
    }
  });

  it('produces identical ranking for the same state (deterministic)', () => {
    const state = createInitialGameState(42);
    const ranked1 = evaluateCandidateActions(state, 'ai_2');
    const ranked2 = evaluateCandidateActions(state, 'ai_2');
    expect(ranked1.map((s) => s.scores.totalScore)).toEqual(
      ranked2.map((s) => s.scores.totalScore)
    );
    expect(ranked1.map((s) => s.action.type)).toEqual(ranked2.map((s) => s.action.type));
  });
});

// ---------------------------------------------------------------------------
// 9. selectBestAIAction — DecisionTrace integrity
// ---------------------------------------------------------------------------

describe('selectBestAIAction — DecisionTrace', () => {
  it('returns a valid DecisionTrace with all required fields', () => {
    const state = createInitialGameState(7);
    const { action, trace } = selectBestAIAction(state, 'ai_1');
    expect(trace.week).toBe(state.week);
    expect(trace.syndicateId).toBe('ai_1');
    expect(trace.action).toEqual(action);
    expect(typeof trace.scores.totalScore).toBe('number');
    expect(typeof trace.reasoning).toBe('string');
    expect(trace.reasoning.length).toBeGreaterThan(0);
  });

  it('trace totalScore equals top-scored candidate totalScore', () => {
    const state = createInitialGameState(7);
    const ranked = evaluateCandidateActions(state, 'ai_1');
    const { trace } = selectBestAIAction(state, 'ai_1');
    expect(trace.scores.totalScore).toBe(ranked[0]!.scores.totalScore);
  });
});

// ---------------------------------------------------------------------------
// 10. executeAITurn — zero-cheat symmetry
// ---------------------------------------------------------------------------

describe('executeAITurn — zero-cheat symmetry', () => {
  it('AI action reduces AP by at least 1 per execution', () => {
    const state = createInitialGameState(5);
    const before = state.syndicates['ai_1']!.actionPoints;
    const { state: after } = executeAITurn(state, 'ai_1');
    // After full turn, ap must be strictly less than starting ap
    // (may stop early at PASS, but at least 1 AP consumed)
    expect(after.syndicates['ai_1']!.actionPoints).toBeLessThan(before);
  });

  it('DecisionTraces are appended to state after executeAITurn', () => {
    const state = createInitialGameState(5);
    const before = state.decisionTraces.length;
    const { state: after, traces } = executeAITurn(state, 'ai_1');
    expect(after.decisionTraces.length).toBeGreaterThan(before);
    expect(traces.length).toBeGreaterThan(0);
  });

  it('AI uses the same applyAction path as the player (integer math enforced)', () => {
    const state = createInitialGameState(5);
    const { state: after } = executeAITurn(state, 'ai_1');
    // Verify no floating-point values left in dirtyCash
    for (const s of Object.values(after.syndicates)) {
      expect(Number.isInteger(s.dirtyCash)).toBe(true);
      expect(Number.isInteger(s.cleanCash)).toBe(true);
      expect(Number.isInteger(s.heat)).toBe(true);
    }
  });
});

describe('executeAITurn — botched rolls and input immutability', () => {
  it('turn continues after a botched SEIZE roll', () => {
    let found = false;
    for (let seed = 1; seed <= 2000 && !found; seed++) {
      const state = createInitialGameState(seed);
      for (const aiId of ['ai_1', 'ai_2', 'ai_3']) {
        const { action } = selectBestAIAction(state, aiId);
        if (action.type !== 'SEIZE') continue;
        const { result } = applyAction(state, aiId, action);
        if (result.outcome !== 'BOTCHED') continue;

        found = true;
        const { state: after, traces } = executeAITurn(state, aiId);
        expect(traces[0]?.action.type).toBe('SEIZE');
        expect(traces.length).toBeGreaterThan(1);
        expect(after.syndicates[aiId]!.actionPoints).toBeLessThan(2);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('executeAIAction does not mutate input state when the action is rejected', () => {
    const base = createInitialGameState(7);
    const state = patchSyndicate(base, 'ai_1', { actionPoints: 0 });
    const snapshot = structuredClone(state);

    const { state: after, trace, result } = executeAIAction(state, 'ai_1');

    expect(trace.action.type).toBe('PASS');
    expect(result.executed).toBe(false);
    expect(state).toEqual(snapshot);
    expect(after.decisionTraces).toHaveLength(state.decisionTraces.length + 1);
  });
});

describe('scoreCandidateAction — shared scoring context', () => {
  it('produces identical scores with and without a precomputed context', () => {
    const state = giveRackets(createInitialGameState(11), 'ai_2', ['fish_market', 'union_pier']);
    for (const id of ['player', 'ai_1', 'ai_2']) {
      for (const { action, scores } of evaluateCandidateActions(state, id)) {
        expect(scoreCandidateAction(state, id, action).scores).toEqual(scores);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 11. executeAllAITurns — ordering and game-state integrity
// ---------------------------------------------------------------------------

describe('executeAllAITurns', () => {
  it('all AI syndicates spend at least 1 AP during the AI phase', () => {
    const state = createInitialGameState(10);
    const { state: after } = executeAllAITurns(state);
    for (const s of Object.values(after.syndicates)) {
      if (!s.isPlayer && !s.isEliminated) {
        // Each AI must have consumed at least 1 AP (spec: acts 1 AP at a time until 0 AP or pass)
        expect(s.actionPoints).toBeLessThan(state.syndicates[s.id]!.actionPoints);
      }
    }
  });

  it('player AP is not consumed during AI phase', () => {
    const state = createInitialGameState(10);
    const { state: after } = executeAllAITurns(state);
    expect(after.syndicates['player']!.actionPoints).toBe(
      state.syndicates['player']!.actionPoints
    );
  });

  it('accumulates DecisionTraces from all AI syndicates', () => {
    const state = createInitialGameState(10);
    const { traces } = executeAllAITurns(state);
    // 3 AI syndicates, each with up to 3 AP → at least 3 traces (may pass early)
    expect(traces.length).toBeGreaterThanOrEqual(3);
    // Each trace belongs to an AI syndicate
    for (const trace of traces) {
      expect(trace.syndicateId).not.toBe('player');
    }
  });

  it('does not modify game state if already game over', () => {
    const state = { ...createInitialGameState(1), isGameOver: true };
    const { state: after, traces } = executeAllAITurns(state);
    expect(after.isGameOver).toBe(true);
    expect(traces.length).toBe(0);
  });

  it('produces identical results with the same seed (full determinism)', () => {
    const state1 = createInitialGameState(999);
    const state2 = createInitialGameState(999);
    const { state: after1 } = executeAllAITurns(state1);
    const { state: after2 } = executeAllAITurns(state2);
    // Cash values and heat must be identical
    for (const id of Object.keys(after1.syndicates)) {
      const s1 = after1.syndicates[id]!;
      const s2 = after2.syndicates[id]!;
      expect(s1.dirtyCash).toBe(s2.dirtyCash);
      expect(s1.cleanCash).toBe(s2.cleanCash);
      expect(s1.heat).toBe(s2.heat);
    }
  });

  it('eliminates syndicates through normal applyAction rules (not AI-special logic)', () => {
    // Stress: run 5 full AI-only weeks starting from default state
    let state = createInitialGameState(314);
    for (let w = 0; w < 5; w++) {
      const { state: afterAI } = executeAllAITurns(state);
      // We just verify no exception is thrown and state is internally consistent
      expect(afterAI.week).toBe(state.week); // week only increments in advanceWeek
      state = afterAI;
    }
    // All remaining syndicates must have integer cash values
    for (const s of Object.values(state.syndicates)) {
      expect(Number.isInteger(s.dirtyCash)).toBe(true);
    }
  });

  it('AI acts in descending order of syndicate valuation', () => {
    // Give ai_1 more rackets/cash than ai_2 and ai_3 so it has highest valuation
    let state = createInitialGameState(55);
    const racketIds = Object.keys(state.rackets).slice(0, 4);
    state = giveRackets(state, 'ai_1', racketIds);
    state = patchSyndicate(state, 'ai_1', { dirtyCash: 50000 });

    const { traces } = executeAllAITurns(state);
    // The first trace must be from ai_1 (highest valuation)
    if (traces.length > 0) {
      expect(traces[0]!.syndicateId).toBe('ai_1');
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Integer Math Invariant
// ---------------------------------------------------------------------------

describe('Integer math invariant', () => {
  it('all score components are integers (no floats in DecisionTraceScores)', () => {
    const state = createInitialGameState(42);
    const ranked = evaluateCandidateActions(state, 'ai_2');
    for (const item of ranked) {
      const s = item.scores;
      expect(Number.isInteger(s.evScore)).toBe(true);
      expect(Number.isInteger(s.turfScore)).toBe(true);
      expect(Number.isInteger(s.heatRiskScore)).toBe(true);
      expect(Number.isInteger(s.grudgeScore)).toBe(true);
      expect(Number.isInteger(s.emergencyModifiers)).toBe(true);
      expect(Number.isInteger(s.coalitionBonus)).toBe(true);
      expect(Number.isInteger(s.totalScore)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 13. W3-T8a balance rules (AI scoring only — game rules unchanged)
// ---------------------------------------------------------------------------

describe('W3-T8a — liquidity guard', () => {
  it('upfrontCost matches what applyAction actually charges', () => {
    const state = patchSyndicate(createInitialGameState(3), 'ai_1', { dirtyCash: 20000 });
    const actions = [
      { type: 'SEIZE', racketId: 'fish_market', prepTier: 1 },
      { type: 'EXTORT', jobId: 'shakedown', prepTier: 2 },
      { type: 'RECRUIT', tier: 'thug', count: 3 },
      { type: 'WIRETAP', targetSyndicateId: 'ai_2' },
      { type: 'BRIBE', useClean: false },
    ] as const;
    for (const action of actions) {
      const before = state.syndicates.ai_1!;
      const { state: next, result } = applyAction(state, 'ai_1', action);
      expect(result.executed).toBe(true);
      const after = next.syndicates.ai_1!;
      // EXTORT pays out after the roll; compare spend before payout.
      const payout = result.payout ?? 0;
      const spent = before.dirtyCash + before.cleanCash - (after.dirtyCash + after.cleanCash) + payout;
      expect(spent).toBe(upfrontCost(action));
    }
    // LAUNDER destroys exactly the 25% fee.
    expect(upfrontCost({ type: 'LAUNDER', amount: 2500 })).toBe(625);
    expect(upfrontCost({ type: 'PASS' })).toBe(0);
  });

  it('clamps a spend that would leave less than payroll + reserve', () => {
    // 4 thugs = $1,000 payroll; SEIZE prep 0 costs $1,500.
    const floor = 1000 + AI_CASH_RESERVE;
    const seize = { type: 'SEIZE', racketId: 'fish_market', prepTier: 0 } as const;
    const tight = patchSyndicate(createInitialGameState(1), 'ai_1', { dirtyCash: 1500 + floor - 1 });
    const ok = patchSyndicate(createInitialGameState(1), 'ai_1', { dirtyCash: 1500 + floor });
    expect(scoreCandidateAction(tight, 'ai_1', seize).scores.totalScore).toBe(-999);
    expect(scoreCandidateAction(tight, 'ai_1', seize).reasoning).toContain('Liquidity clamp');
    expect(scoreCandidateAction(ok, 'ai_1', seize).scores.emergencyModifiers).toBe(0);
  });

  it('counts the payroll of the recruits themselves', () => {
    // thug x1: $800 hire + $250/wk. Floor = 1000 + 250 + reserve.
    const recruit = { type: 'RECRUIT', tier: 'thug', count: 1 } as const;
    const need = 800 + 1000 + 250 + AI_CASH_RESERVE;
    const tight = patchSyndicate(createInitialGameState(1), 'ai_1', { dirtyCash: need - 1 });
    const ok = patchSyndicate(createInitialGameState(1), 'ai_1', { dirtyCash: need });
    expect(scoreCandidateAction(tight, 'ai_1', recruit).scores.totalScore).toBe(-999);
    expect(scoreCandidateAction(ok, 'ai_1', recruit).scores.totalScore).not.toBe(-999);
  });

  it('does not count Sunday racket yield toward the floor (a rival can seize it first)', () => {
    let state = giveRackets(createInitialGameState(1), 'ai_1', ['grand_casino']);
    state = patchSyndicate(state, 'ai_1', { dirtyCash: 2000 });
    expect(calculateProjectedRacketYield('ai_1', state.rackets)).toBeGreaterThan(5000);
    const scored = scoreCandidateAction(state, 'ai_1', {
      type: 'SEIZE',
      racketId: 'fish_market',
      prepTier: 0,
    });
    expect(scored.scores.totalScore).toBe(-999);
  });

  it('lets an emergency self-BRIBE dip into the reserve, but never below payroll', () => {
    const bribe = { type: 'BRIBE', useClean: true } as const;
    // $3,000 bribe + $1,000 payroll = $4,000 on hand: allowed only in a heat emergency.
    const hot = patchSyndicate(createInitialGameState(1), 'ai_1', {
      heat: 85,
      cleanCash: 3000,
      dirtyCash: 1000,
    });
    const calm = patchSyndicate(hot, 'ai_1', { heat: 50 });
    expect(scoreCandidateAction(hot, 'ai_1', bribe).scores.emergencyModifiers).toBe(75);
    expect(scoreCandidateAction(calm, 'ai_1', bribe).scores.totalScore).toBe(-999);
    const broke = patchSyndicate(hot, 'ai_1', { dirtyCash: 999 });
    expect(scoreCandidateAction(broke, 'ai_1', bribe).scores.totalScore).toBe(-999);
  });
});

describe('W3-T8a — no empty-crew jobs', () => {
  it('generates no EXTORT or SEIZE for a syndicate with 0 crew, but still RECRUIT and PASS', () => {
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', {
      crew: { thug: 0, enforcer: 0, hitman: 0 },
      dirtyCash: 20000,
    });
    const actions = generateCandidateActions(state, 'ai_1');
    expect(actions.some((a) => a.type === 'EXTORT' || a.type === 'SEIZE')).toBe(false);
    expect(actions.some((a) => a.type === 'RECRUIT')).toBe(true);
    expect(actions.some((a) => a.type === 'PASS')).toBe(true);
  });

  it('does not change the rules: applyAction still accepts a 0-crew EXTORT', () => {
    const state = patchSyndicate(createInitialGameState(1), 'player', {
      crew: { thug: 0, enforcer: 0, hitman: 0 },
    });
    const { result } = applyAction(state, 'player', { type: 'EXTORT', jobId: 'shakedown', prepTier: 0 });
    expect(result.executed).toBe(true);
  });
});

describe('W3-T8a — decay-aware heat risk', () => {
  it('treats EXTORT heat as free while heat stays at or below AI_SAFE_HEAT', () => {
    const job = { type: 'EXTORT', jobId: 'shakedown', prepTier: 0 } as const;
    const cool = patchSyndicate(createInitialGameState(1), 'ai_1', { heat: 5 });
    const warm = patchSyndicate(createInitialGameState(1), 'ai_1', { heat: AI_SAFE_HEAT + 5 });
    expect(scoreCandidateAction(cool, 'ai_1', job).scores.heatRiskScore).toBe(0);
    expect(scoreCandidateAction(warm, 'ai_1', job).scores.heatRiskScore).toBeGreaterThan(0);
  });
});

describe('W3-T8a — RICO projection emergency', () => {
  it('gives self-BRIBE the AI_RICO_EMERGENCY override when Sunday heat is projected to reach 100', () => {
    let state = giveRackets(createInitialGameState(1), 'ai_1', [
      'grand_casino',
      'penthouse_lounge',
      'city_hall_annex',
    ]);
    state = patchSyndicate(state, 'ai_1', { heat: 95, cleanCash: 50000, dirtyCash: 50000 });
    expect(projectSundayHeat('ai_1', 95, state.rackets)).toBe(100);
    const bribe = scoreCandidateAction(state, 'ai_1', { type: 'BRIBE', useClean: true });
    expect(bribe.scores.emergencyModifiers).toBe(AI_RICO_EMERGENCY);
    expect(bribe.reasoning).toContain('RICO');
  });

  it('makes even a Warlord bribe before expanding when RICO is projected', () => {
    let state = giveRackets(createInitialGameState(1), 'ai_1', [
      'grand_casino',
      'penthouse_lounge',
      'city_hall_annex',
      'scrap_yard',
    ]);
    state = patchSyndicate(state, 'ai_1', { heat: 92, cleanCash: 60000, dirtyCash: 60000 });
    const top = evaluateCandidateActions(state, 'ai_1')[0]!;
    expect(top.action).toEqual({ type: 'BRIBE', useClean: true });
  });

  it('keeps the plain +75 when heat >= 80 but no RICO strike is projected', () => {
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', { heat: 85, cleanCash: 10000 });
    expect(projectSundayHeat('ai_1', 85, state.rackets)).toBeLessThan(100);
    const bribe = scoreCandidateAction(state, 'ai_1', { type: 'BRIBE', useClean: true });
    expect(bribe.scores.emergencyModifiers).toBe(75);
  });
});

describe('W3-T8a — +65 goes to the single best safe job only', () => {
  it('awards +65 to exactly one EXTORT candidate in a payroll emergency', () => {
    const state = patchSyndicate(createInitialGameState(1), 'ai_1', { dirtyCash: 500, cleanCash: 0 });
    const ranked = evaluateCandidateActions(state, 'ai_1');
    const boosted = ranked.filter((r) => r.scores.emergencyModifiers === 65);
    expect(boosted).toHaveLength(1);
    expect(buildScoringContext(state, 'ai_1').bestEmergencyJobKey).toBe('shakedown_0');
    expect(boosted[0]!.action).toEqual({ type: 'EXTORT', jobId: 'shakedown', prepTier: 0 });
  });
});

describe('W3-T8a — RECRUIT earning-power lookahead', () => {
  it('bestJobEV is 0 with no crew or no safe, repeatable job, and never decreases with attack', () => {
    expect(bestJobEV(0)).toBe(0);
    expect(bestJobEV(3)).toBe(0); // 1 thug: no job reaches 60% win
    let prev = 0;
    for (let attack = 0; attack <= 60; attack += 3) {
      const ev = bestJobEV(attack);
      expect(ev).toBeGreaterThanOrEqual(prev);
      prev = ev;
    }
  });

  it('values rebuilding a gutted crew but not padding a full one', () => {
    const gutted = patchSyndicate(createInitialGameState(1), 'ai_1', {
      crew: { thug: 0, enforcer: 0, hitman: 0 },
      dirtyCash: 10000,
    });
    const three = scoreCandidateAction(gutted, 'ai_1', { type: 'RECRUIT', tier: 'thug', count: 3 });
    const one = scoreCandidateAction(gutted, 'ai_1', { type: 'RECRUIT', tier: 'thug', count: 1 });
    expect(three.scores.evScore).toBeGreaterThan(0);
    expect(one.scores.evScore).toBeLessThan(0);

    const full = patchSyndicate(createInitialGameState(1), 'ai_1', { dirtyCash: 10000 });
    const pad = scoreCandidateAction(full, 'ai_1', { type: 'RECRUIT', tier: 'thug', count: 1 });
    expect(pad.scores.evScore).toBeLessThan(0);
  });
});

describe('W3-T8a — selection is unchanged by the linear scan', () => {
  it('selectBestAIAction picks evaluateCandidateActions()[0] across varied states', () => {
    for (const seed of [1, 7, 42, 99]) {
      let state = createInitialGameState(seed);
      for (let step = 0; step < 6; step++) {
        for (const id of ['player', 'ai_1', 'ai_2', 'ai_3']) {
          if (state.syndicates[id]!.isEliminated || state.isGameOver) continue;
          const ranked = evaluateCandidateActions(state, id);
          if (ranked.length === 0) continue; // out of AP this week
          const { action } = selectBestAIAction(state, id);
          expect(action).toEqual(ranked[0]!.action);
          state = executeAIAction(state, id).state;
        }
        if (step % 3 === 2) state = advanceWeek(state);
      }
    }
  });
});
