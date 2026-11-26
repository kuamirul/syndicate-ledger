// M3-T1 — Crew Defense in rival raids (Garrison Split), defender casualties, Fog-of-War AI scoring
// and defend-recruit utility. Applies to player and AI alike through resolveAssault()/applyAction().

import { describe, expect, it } from 'vitest';
import { ARCHETYPES_BY_ID } from '../data';
import { buildScoringContext, estimateRaidDefense, scoreCandidateAction } from './ai';
import { AI_ASSUMED_RIVAL_CREW_DEF, AI_DEFEND_RECRUIT_BONUS, DEFENDER_TAKEOVER_CASUALTIES } from './constants';
import { calculateSyndicateAttack, garrisonDefense } from './crew';
import { advanceWeek, applyAction, cloneGameState, createInitialGameState, racketDefenseBreakdown } from './reducer';
import { resolveRiskRoll } from './risk';
import type { GameState, RiskOutcome, SyndicateCrew } from './types';

const FISH = 'fish_market';
const PIER = 'union_pier';
const WAREHOUSE = 'bonded_warehouse';

function world(mut?: (s: GameState) => void): GameState {
  const s = cloneGameState(createInitialGameState(7));
  mut?.(s);
  return s;
}

describe('garrisonDefense (Garrison Split)', () => {
  it('spreads total crew defense over owned businesses, flooring to an integer', () => {
    expect(garrisonDefense(12, 1)).toBe(12);
    expect(garrisonDefense(12, 2)).toBe(6);
    expect(garrisonDefense(12, 5)).toBe(2);
    expect(garrisonDefense(20, 3)).toBe(6);
  });
  it('treats 0 businesses as 1 and never goes negative', () => {
    expect(garrisonDefense(9, 0)).toBe(9);
    expect(garrisonDefense(0, 3)).toBe(0);
    expect(garrisonDefense(-5, 1)).toBe(0);
  });
});

describe('racketDefenseBreakdown', () => {
  it('neutral businesses have no guards (claims unchanged)', () => {
    const s = world();
    expect(racketDefenseBreakdown(s, FISH)).toEqual({ baseDefense: 10, guardDefense: 0, total: 10 });
  });
  it('an owned business gets the owner crew defense split over its businesses', () => {
    const one = world((s) => (s.rackets[FISH]!.ownerId = 'player'));
    expect(racketDefenseBreakdown(one, FISH)).toEqual({ baseDefense: 10, guardDefense: 12, total: 22 });
    const three = world((s) => {
      for (const id of [FISH, PIER, WAREHOUSE]) s.rackets[id]!.ownerId = 'player';
    });
    expect(racketDefenseBreakdown(three, FISH).guardDefense).toBe(4);
  });
  it('a crewless owner adds 0 guard defense; legacy assignedGuards still add on top', () => {
    const s = world((x) => {
      x.rackets[FISH]!.ownerId = 'ai_1';
      x.syndicates.ai_1!.crew = { thug: 0, enforcer: 0, hitman: 0 };
    });
    expect(racketDefenseBreakdown(s, FISH).guardDefense).toBe(0);
    s.syndicates.ai_1!.assignedGuards[FISH] = 5;
    expect(racketDefenseBreakdown(s, FISH)).toEqual({ baseDefense: 10, guardDefense: 5, total: 15 });
  });
  it('returns zeros for an unknown business', () => {
    expect(racketDefenseBreakdown(world(), 'nope')).toEqual({ baseDefense: 0, guardDefense: 0, total: 0 });
  });
});

/**
 * Player owns Fish Market; ai_1 (4 thugs) telegraphs a siege in week 1 that resolves at the start
 * of week 3. The resolving roll uses the rng chosen by `pickRng`, so the outcome is controlled.
 */
function runSiege(defenderCrew: SyndicateCrew, want: RiskOutcome) {
  let s = world((x) => {
    x.rackets[FISH]!.ownerId = 'player';
    x.syndicates.player!.crew = { ...defenderCrew };
  });
  s = applyAction(s, 'ai_1', { type: 'SEIZE', racketId: FISH, prepTier: 0 }).state;
  s = advanceWeek(s); // -> week 2
  const defense = racketDefenseBreakdown(s, FISH).total;
  const attack = calculateSyndicateAttack(s.syndicates.ai_1!.crew);
  let rng = 1;
  while (resolveRiskRoll(attack, defense, 0, rng).outcome !== want) rng++;
  s = cloneGameState(s);
  s.rngState = rng;
  const before = s;
  const after = advanceWeek(s); // -> week 3, siege resolves
  const event = after.history.at(-1)!.events.find((e) => e.includes('siege on Fish Market'))!;
  return { before, after, event, defense };
}

describe('rival raid resolution uses Crew Defense and costs the defender crew on a takeover', () => {
  it('rolls against base + garrison defense, not base defense alone', () => {
    // Find a roll where base-only and guarded defense disagree; the engine must follow guarded.
    let s = world((x) => (x.rackets[FISH]!.ownerId = 'player'));
    s = applyAction(s, 'ai_1', { type: 'SEIZE', racketId: FISH, prepTier: 0 }).state;
    s = advanceWeek(s);
    const guarded = racketDefenseBreakdown(s, FISH).total;
    expect(guarded).toBe(22);
    let rng = 1;
    while (resolveRiskRoll(12, guarded, 0, rng).outcome === resolveRiskRoll(12, 10, 0, rng).outcome) rng++;
    s = cloneGameState(s);
    s.rngState = rng;
    const event = advanceWeek(s).history.at(-1)!.events.find((e) => e.includes('siege on Fish Market'))!;
    expect(event).toContain(`(${resolveRiskRoll(12, guarded, 0, rng).outcome},`);
  });

  it.each(['CLEAN', 'MESSY'] as const)('%s takeover: defender loses 1 lowest-tier crew, logged', (outcome) => {
    const { after, event } = runSiege({ thug: 1, enforcer: 1, hitman: 0 }, outcome);
    expect(after.rackets[FISH]!.ownerId).toBe('ai_1');
    expect(after.syndicates.player!.crew).toEqual({ thug: 0, enforcer: 1, hitman: 0 });
    expect(event).toContain(`defender lost ${DEFENDER_TAKEOVER_CASUALTIES} crew`);
  });

  it('BOTCHED raid: the defender holds and loses no crew', () => {
    const { after, event } = runSiege({ thug: 4, enforcer: 0, hitman: 0 }, 'BOTCHED');
    expect(after.rackets[FISH]!.ownerId).toBe('player');
    expect(after.syndicates.player!.crew).toEqual({ thug: 4, enforcer: 0, hitman: 0 });
    expect(event).not.toContain('defender lost');
  });

  it('a 0-crew defender adds no guards and cannot drop below 0 crew', () => {
    const { after, event, defense } = runSiege({ thug: 0, enforcer: 0, hitman: 0 }, 'CLEAN');
    expect(defense).toBe(10);
    expect(after.syndicates.player!.crew).toEqual({ thug: 0, enforcer: 0, hitman: 0 });
    expect(event).not.toContain('defender lost');
  });

  it('losing the last crew member leaves exactly 0', () => {
    const { after, event } = runSiege({ thug: 1, enforcer: 0, hitman: 0 }, 'MESSY');
    expect(after.syndicates.player!.crew).toEqual({ thug: 0, enforcer: 0, hitman: 0 });
    expect(event).toContain('defender lost 1 crew');
  });

  it('a neutral claim inflicts no defender casualty and reports 0', () => {
    const s = world();
    const { result } = applyAction(s, 'player', { type: 'SEIZE', racketId: FISH, prepTier: 2 });
    expect(result.executed).toBe(true);
    expect(result.defenderCasualtiesLost).toBe(0);
  });

  it('is deterministic: the same seed and actions give an identical state', () => {
    const a = runSiege({ thug: 2, enforcer: 0, hitman: 0 }, 'MESSY').after;
    const b = runSiege({ thug: 2, enforcer: 0, hitman: 0 }, 'MESSY').after;
    expect(a).toEqual(b);
  });
});

describe('AI raid scoring respects Fog-of-War (zero-cheat)', () => {
  // ai_1 (Warlord) eyes Fish Market owned by ai_2.
  const base = (crew: SyndicateCrew, tapped: boolean) =>
    world((s) => {
      s.rackets[FISH]!.ownerId = 'ai_2';
      s.syndicates.ai_2!.crew = crew;
      s.syndicates.ai_1!.dirtyCash = 20000;
      if (tapped) s.syndicates.ai_1!.wiretapTurnsRemaining.ai_2 = 2;
    });
  const seize = { type: 'SEIZE', racketId: FISH, prepTier: 0 } as const;
  const weak: SyndicateCrew = { thug: 0, enforcer: 0, hitman: 0 };
  const strong: SyndicateCrew = { thug: 0, enforcer: 3, hitman: 2 };

  it('without a wiretap, the raid score is identical whatever the target hides', () => {
    const a = scoreCandidateAction(base(weak, false), 'ai_1', seize);
    const b = scoreCandidateAction(base(strong, false), 'ai_1', seize);
    expect(a.scores).toEqual(b.scores);
    expect(a.reasoning).toBe(b.reasoning);
    expect(estimateRaidDefense(base(strong, false), 'ai_1', FISH)).toEqual({
      baseDefense: 10,
      guardDefense: AI_ASSUMED_RIVAL_CREW_DEF,
      total: 10 + AI_ASSUMED_RIVAL_CREW_DEF,
      exact: false,
    });
  });

  it('with a wiretap, the score follows the exact defender crew', () => {
    const a = scoreCandidateAction(base(weak, true), 'ai_1', seize);
    const b = scoreCandidateAction(base(strong, true), 'ai_1', seize);
    expect(a.scores.evScore).toBeGreaterThan(b.scores.evScore);
    expect(a.reasoning).toContain('(spied)');
    expect(estimateRaidDefense(base(strong, true), 'ai_1', FISH)).toMatchObject({ guardDefense: 48, exact: true });
  });

  it('own and neutral businesses are always exact', () => {
    const s = base(strong, false);
    expect(estimateRaidDefense(s, 'ai_2', FISH).exact).toBe(true);
    expect(estimateRaidDefense(s, 'ai_1', PIER)).toEqual({ baseDefense: 10, guardDefense: 0, total: 10, exact: true });
  });
});

describe('Defend-recruit utility (incoming raid is public to the defender)', () => {
  // ai_2 (Banker, caution 1.6) owns Fish Market; ai_1 has a siege queued on it.
  const defending = (owned: string[], raid: boolean) =>
    world((s) => {
      for (const id of owned) s.rackets[id]!.ownerId = 'ai_2';
      s.syndicates.ai_2!.dirtyCash = 20000;
      if (raid) {
        s.activeSieges = [
          { id: `1:ai_1:${FISH}`, attackerId: 'ai_1', racketId: FISH, prepTier: 0, telegraphedWeek: 1, resolveWeek: 3 },
        ];
      }
    });
  const hire = { type: 'RECRUIT', tier: 'thug', count: 1 } as const;
  const bonus = Math.round(AI_DEFEND_RECRUIT_BONUS * ARCHETYPES_BY_ID.banker!.weights.caution);

  it('adds round(bonus x caution) to RECRUIT while a raid targets our business', () => {
    const calm = scoreCandidateAction(defending([FISH], false), 'ai_2', hire);
    const raided = scoreCandidateAction(defending([FISH], true), 'ai_2', hire);
    expect(buildScoringContext(defending([FISH], true), 'ai_2').incomingRaids).toBe(1);
    expect(raided.scores.emergencyModifiers - calm.scores.emergencyModifiers).toBe(bonus);
    expect(raided.reasoning).toContain('guarding vs incoming raid (guards 12 -> 15)');
  });

  it('gives no bonus when the hire would not raise per-business guards', () => {
    // 4 businesses: floor(12/4) = 3 and floor(15/4) = 3.
    const owned = [FISH, PIER, WAREHOUSE, 'dive_bar'];
    const calm = scoreCandidateAction(defending(owned, false), 'ai_2', hire);
    const raided = scoreCandidateAction(defending(owned, true), 'ai_2', hire);
    expect(raided.scores).toEqual(calm.scores);
  });

  it("does not count the actor's own outgoing raids as incoming", () => {
    const s = defending([FISH], false);
    s.rackets[PIER]!.ownerId = 'ai_1';
    s.activeSieges = [
      { id: `1:ai_2:${PIER}`, attackerId: 'ai_2', racketId: PIER, prepTier: 0, telegraphedWeek: 1, resolveWeek: 3 },
    ];
    expect(buildScoringContext(s, 'ai_2').incomingRaids).toBe(0);
  });
});
