import { describe, expect, it } from 'vitest';
import { STREET_JOBS } from '../data';
import { applyAction, cloneGameState, createInitialGameState } from '../engine/reducer';
import { calculateRiskProbabilities } from '../engine/risk';
import type { Action, GameState } from '../engine/types';
import { guidedPhase } from './guidedIntro';
import {
  buildCrewOptions,
  buildJobRows,
  buildLaunderOption,
  buildPayCopsOptions,
  buildPrepTierOptions,
  buildSnitchOptions,
  buildSpyOption,
  canAct,
  evaluateSpendSafety,
  jobConsequences,
  maxLaunderAmount,
  sectionLocks,
  splitRecruitCost,
} from './operationsModel';
import { PLAYER_ID } from './viewModel';

function fresh(mut?: (s: GameState) => void): GameState {
  const s = cloneGameState(createInitialGameState(5));
  mut?.(s);
  return s;
}
const me = (s: GameState) => s.syndicates[PLAYER_ID]!;
function own(s: GameState, n: number) {
  Object.keys(s.rackets).slice(0, n).forEach((id) => (s.rackets[id]!.ownerId = PLAYER_ID));
}
const executes = (s: GameState, a: Action) => applyAction(s, PLAYER_ID, a).result.executed;

describe('evaluateSpendSafety', () => {
  it('reports leaves-cash and the Sunday total for a Street-only spend', () => {
    const s = fresh(); // $6,000 street, 4 thugs => payroll $1,000, no income
    const r = evaluateSpendSafety(s, PLAYER_ID, 1200, 0)!;
    expect(r).toMatchObject({ affordable: true, leavesStreet: 4800, leavesSafe: 0 });
    expect(r.projectedPostSundayTotal).toBe(4800 - 1000);
    expect(r.triggersShortfall).toBe(false);
  });

  it('flags a shortfall exactly when post-spend cash + net drops below $0', () => {
    const s = fresh();
    // 6000 - cost - 1000 payroll: $5,000 leaves exactly 0 (safe), $5,001 goes under.
    expect(evaluateSpendSafety(s, PLAYER_ID, 5000, 0)!.triggersShortfall).toBe(false);
    const under = evaluateSpendSafety(s, PLAYER_ID, 5001, 0)!;
    expect(under.triggersShortfall).toBe(true);
    expect(under.alreadyShort).toBe(false);
  });

  it('adds extra weekly payroll and detects an already-short baseline', () => {
    const s = fresh();
    expect(evaluateSpendSafety(s, PLAYER_ID, 0, 0, 5000)!.triggersShortfall).toBe(false);
    expect(evaluateSpendSafety(s, PLAYER_ID, 0, 0, 5001)!.triggersShortfall).toBe(true);
    const broke = fresh((x) => {
      me(x).dirtyCash = 0;
    });
    expect(evaluateSpendSafety(broke, PLAYER_ID, 0, 0)!.alreadyShort).toBe(true);
  });

  it('treats Safe Cash as spendable and counts both wallets', () => {
    const s = fresh((x) => {
      me(x).cleanCash = 3000;
    });
    const r = evaluateSpendSafety(s, PLAYER_ID, 0, 3000)!;
    expect(r).toMatchObject({ affordable: true, leavesSafe: 0, leavesStreet: 6000 });
    expect(evaluateSpendSafety(s, PLAYER_ID, 0, 3001)!.affordable).toBe(false);
  });

  it('includes owned-business income in the projected net', () => {
    const s = fresh((x) => own(x, 1));
    const income = Object.values(s.rackets).find((r) => r.ownerId === PLAYER_ID)!.dirtyYield;
    expect(evaluateSpendSafety(s, PLAYER_ID, 0, 0)!.projectedPostSundayTotal).toBe(6000 + income - 1000);
  });

  it('returns null for an unknown syndicate', () => {
    expect(evaluateSpendSafety(fresh(), 'nobody', 0, 0)).toBeNull();
  });
});

describe('splitRecruitCost matches the reducer (Street first, Safe overflow)', () => {
  it('splits correctly and the engine agrees', () => {
    const s = fresh((x) => {
      me(x).dirtyCash = 1000;
      me(x).cleanCash = 5000;
    });
    expect(splitRecruitCost(me(s), 2400)).toEqual({ street: 1000, safe: 1400 });
    const after = applyAction(s, PLAYER_ID, { type: 'RECRUIT', tier: 'thug', count: 3 }).state.syndicates[PLAYER_ID]!;
    expect(after.dirtyCash).toBe(0);
    expect(after.cleanCash).toBe(5000 - 1400);
  });
});

describe('affordable parity with applyAction', () => {
  const cases: Array<[string, (s: GameState) => void]> = [
    ['plenty of cash', () => {}],
    ['$1,199 street', (s) => (me(s).dirtyCash = 1199)],
    ['$1,200 street', (s) => (me(s).dirtyCash = 1200)],
    ['$2,799 street', (s) => (me(s).dirtyCash = 2799)],
    ['$2,800 street', (s) => (me(s).dirtyCash = 2800)],
    ['broke', (s) => (me(s).dirtyCash = 0)],
    ['safe only', (s) => ((me(s).dirtyCash = 0), (me(s).cleanCash = 6000))],
    ['no AP', (s) => (me(s).actionPoints = 0)],
  ];

  it.each(cases)('job prep tiers: %s', (_n, mut) => {
    const s = fresh(mut);
    const row = buildJobRows(s, PLAYER_ID).find((r) => r.job.id === 'shakedown')!;
    for (const t of row.tiers) {
      expect(t.disabledReason === null).toBe(executes(s, { type: 'EXTORT', jobId: 'shakedown', prepTier: t.tier }));
    }
  });

  it.each(cases)('crew hires: %s', (_n, mut) => {
    const s = fresh((x) => {
      own(x, 5);
      mut(x);
    });
    for (const o of buildCrewOptions(s, PLAYER_ID)) {
      expect(o.disabledReason === null).toBe(executes(s, { type: 'RECRUIT', tier: o.tier.id, count: o.count }));
    }
  });

  it.each(cases)('launder / bribe / wiretap: %s', (_n, mut) => {
    const s = fresh((x) => {
      mut(x);
      me(x).cleanCash = me(x).cleanCash || 3000;
    });
    for (const amount of [1000, 5000, 10000]) {
      expect(buildLaunderOption(s, PLAYER_ID, amount)!.disabledReason === null).toBe(
        executes(s, { type: 'LAUNDER', amount })
      );
    }
    for (const o of buildPayCopsOptions(s, PLAYER_ID)) {
      expect(o.disabledReason === null).toBe(executes(s, { type: 'BRIBE', useClean: o.useClean }));
    }
    expect(buildSpyOption(s, PLAYER_ID, 'ai_1')!.disabledReason === null).toBe(
      executes(s, { type: 'WIRETAP', targetSyndicateId: 'ai_1' })
    );
    for (const o of buildSnitchOptions(s, PLAYER_ID, 'ai_1')) {
      expect(o.disabledReason === null).toBe(
        executes(s, { type: 'BRIBE', useClean: o.useClean, targetSyndicateId: 'ai_1' })
      );
    }
  });

  it('launder cap and frame cap match the engine', () => {
    let s = applyAction(fresh(), PLAYER_ID, { type: 'LAUNDER', amount: 1000 }).state;
    expect(buildLaunderOption(s, PLAYER_ID, 1000)!.disabledReason).toBe('Already Banked This Week (1/1)');
    expect(executes(s, { type: 'LAUNDER', amount: 1000 })).toBe(false);
    s = fresh((x) => (me(x).cleanCash = 10000));
    s = applyAction(s, PLAYER_ID, { type: 'BRIBE', useClean: true, targetSyndicateId: 'ai_1' }).state;
    const again = buildSnitchOptions(s, PLAYER_ID, 'ai_1');
    expect(again.every((o) => o.disabledReason === 'Already Snitched This Week (1/1)')).toBe(true);
    expect(executes(s, { type: 'BRIBE', useClean: true, targetSyndicateId: 'ai_1' })).toBe(false);
  });
});

describe('job previews', () => {
  it('lists six jobs sorted by difficulty with odds equal to calculateRiskProbabilities', () => {
    const s = fresh();
    const rows = buildJobRows(s, PLAYER_ID);
    expect(rows).toHaveLength(STREET_JOBS.length);
    expect(rows.map((r) => r.job.id)[0]).toBe('shakedown');
    expect(rows[rows.length - 1]!.job.id).toBe('bank_vault');
    const attack = 12; // 4 thugs x 3
    for (const r of rows) {
      for (const tier of [0, 1, 2] as const) {
        expect(r.odds[tier]).toEqual(calculateRiskProbabilities(attack, r.job.difficultyDef, tier));
      }
    }
  });

  it('shows Tier deltas versus $0 and tier costs', () => {
    const row = buildJobRows(fresh(), PLAYER_ID).find((r) => r.job.id === 'hijack')!;
    expect(row.tiers.map((t) => t.streetCost)).toEqual([0, 1200, 2800]);
    expect(row.tiers[0]!.deltaClean).toBe(0);
    expect(row.tiers[1]!.deltaClean).toBe(row.odds[1].clean - row.odds[0].clean);
    expect(row.tiers[2]!.deltaBotched).toBeLessThanOrEqual(0);
  });

  it('locks every job except the Shakedown at 0 crew', () => {
    const s = fresh((x) => (me(x).crew = { thug: 0, enforcer: 0, hitman: 0 }));
    for (const r of buildJobRows(s, PLAYER_ID)) {
      expect(r.locked).toBe(r.job.id !== 'shakedown');
      expect(r.lockReason).toBe(r.locked ? 'Requires ≥1 Crew' : null);
      expect(r.canRunFree).toBe(r.job.id === 'shakedown');
      if (r.locked) expect(executes(s, { type: 'EXTORT', jobId: r.job.id, prepTier: 0 })).toBe(false);
    }
  });

  it('caps casualties by crew owned in the consequence text model', () => {
    const job = STREET_JOBS.find((j) => j.id === 'heist')!;
    expect(jobConsequences(job, 4).BOTCHED.crewLost).toBe(2);
    expect(jobConsequences(job, 1).BOTCHED.crewLost).toBe(1);
    expect(jobConsequences(job, 0).MESSY.crewLost).toBe(0);
    expect(jobConsequences(job, 4).CLEAN).toMatchObject({ crewLost: 0, heat: job.cleanHeat });
  });

  it('generic prep tiers add the base cost (M2-T3 seizes)', () => {
    const s = fresh();
    const tiers = buildPrepTierOptions(s, PLAYER_ID, 1500, (t) => calculateRiskProbabilities(12, 10, t));
    expect(tiers.map((t) => t.streetCost)).toEqual([1500, 2700, 4300]);
  });
});

describe('crew options', () => {
  it('gates T2 at 2 businesses and T3 at 5', () => {
    const none = buildCrewOptions(fresh(), PLAYER_ID);
    expect(none.find((o) => o.tier.id === 'enforcer')!.lockReason).toBe('Needs ≥2 Businesses');
    expect(none.find((o) => o.tier.id === 'hitman')!.lockReason).toBe('Needs ≥5 Businesses');
    const two = buildCrewOptions(fresh((x) => own(x, 2)), PLAYER_ID);
    expect(two.find((o) => o.tier.id === 'enforcer')!.unlocked).toBe(true);
    expect(two.find((o) => o.tier.id === 'hitman')!.unlocked).toBe(false);
    const five = buildCrewOptions(fresh((x) => own(x, 5)), PLAYER_ID);
    expect(five.find((o) => o.tier.id === 'hitman')!.unlocked).toBe(true);
  });

  it('computes cost, stats gained, payroll and new Sunday net', () => {
    const o = buildCrewOptions(fresh(), PLAYER_ID).find((x) => x.tier.id === 'thug' && x.count === 3)!;
    expect(o).toMatchObject({ cost: 2400, attackGained: 9, defenseGained: 9, addedPayroll: 750, newSundayNet: -1750 });
    expect(o.safety.leavesStreet).toBe(3600);
    expect(o.safety.projectedPostSundayTotal).toBe(3600 - 1000 - 750);
  });

  it('flags a shortfall when the new payroll sinks Sunday', () => {
    const s = fresh((x) => (me(x).dirtyCash = 2400 + 1000)); // exactly pays 3 thugs + current payroll, not the extra $750
    const o = buildCrewOptions(s, PLAYER_ID).find((x) => x.tier.id === 'thug' && x.count === 3)!;
    expect(o.safety.triggersShortfall).toBe(true);
  });
});

describe('protect profits & covert ops', () => {
  it('launder preview: 25% fee, Safe Cash gained, Net Worth delta', () => {
    const ok = buildLaunderOption(fresh((x) => (me(x).dirtyCash = 12000)), PLAYER_ID, 10000)!;
    expect(ok).toMatchObject({ fee: 2500, safeGained: 7500, netWorthDelta: 5000, disabledReason: null });
    expect(ok.safety.leavesStreet).toBe(2000);
    expect(buildLaunderOption(fresh(), PLAYER_ID, 10000)!.disabledReason).toBe('Need $10,000 Street Cash');
    expect(maxLaunderAmount(fresh(), PLAYER_ID)).toBe(6000);
    expect(maxLaunderAmount(fresh((x) => (me(x).dirtyCash = 99999)), PLAYER_ID)).toBe(10000);
  });

  it('pay off cops shows both payment sources and heat before/after (clamped)', () => {
    const s = fresh((x) => ((me(x).heat = 15), (me(x).cleanCash = 3000)));
    const [safe, street] = buildPayCopsOptions(s, PLAYER_ID);
    expect(safe).toMatchObject({ useClean: true, safeCost: 3000, heatBefore: 15, heatAfter: 0 });
    expect(street).toMatchObject({ useClean: false, streetCost: 4500, heatAfter: 0 });
    expect(safe!.safety.leavesSafe).toBe(0);
    expect(street!.safety.leavesStreet).toBe(1500);
  });

  it('snitch shows rival heat +12 (capped at 100); spy needs a living rival', () => {
    const s = fresh((x) => (x.syndicates.ai_1!.heat = 95));
    expect(buildSnitchOptions(s, PLAYER_ID, 'ai_1')[0]!.targetHeatAfter).toBe(100);
    expect(buildSpyOption(s, PLAYER_ID, 'player')!.disabledReason).toBe('Pick a living rival');
    const dead = fresh((x) => (x.syndicates.ai_1!.isEliminated = true));
    expect(buildSpyOption(dead, PLAYER_ID, 'ai_1')!.disabledReason).toBe('Pick a living rival');
  });

  it('canAct is false with no AP or after game over', () => {
    expect(canAct(fresh(), PLAYER_ID)).toBe(true);
    expect(canAct(fresh((x) => (me(x).actionPoints = 0)), PLAYER_ID)).toBe(false);
    expect(canAct(fresh((x) => (x.isGameOver = true)), PLAYER_ID)).toBe(false);
  });
});

describe('Guided Intro section locks (Week 1 -> 3 -> 4)', () => {
  it('unlocks Protect Profits in week 3 and Covert Ops in week 4', () => {
    const w1 = sectionLocks(1, true);
    expect([w1.jobs.locked, w1.crew.locked]).toEqual([false, false]);
    expect(w1.protect).toEqual({ locked: true, badge: 'Unlocks Week 3' });
    expect(w1.covert).toEqual({ locked: true, badge: 'Unlocks Week 4' });
    const w2 = sectionLocks(2, true);
    expect(w2.protect.locked).toBe(true);
    const w3 = sectionLocks(3, true);
    expect(w3.protect.locked).toBe(false);
    expect(w3.covert).toEqual({ locked: true, badge: 'Unlocks Week 4' });
    const w4 = sectionLocks(4, true);
    expect([w4.protect.locked, w4.covert.locked]).toEqual([false, false]);
    expect(guidedPhase(1).phase).toBe(1);
    expect(guidedPhase(3).phase).toBe(2);
    expect(guidedPhase(4).phase).toBe(3);
  });

  it('unlocks everything when Guided Intro is off', () => {
    const l = sectionLocks(1, false);
    expect(Object.values(l).every((x) => !x.locked)).toBe(true);
  });
});
