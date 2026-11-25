import { describe, expect, it } from 'vitest';
import { RACKETS_BY_DISTRICT } from '../data';
import { calculateRiskProbabilities } from '../engine/risk';
import { cloneGameState, createInitialGameState } from '../engine/reducer';
import type { GameState, Siege } from '../engine/types';
import { selectVisibleSieges } from './siegeModel';
import { PLAYER_ID } from './viewModel';

const [r1, r2, r3] = RACKETS_BY_DISTRICT.docks.map((r) => r.id) as [string, string, string];
const siege = (attackerId: string, racketId: string, resolveWeek = 3): Siege => ({
  id: `1:${attackerId}:${racketId}`,
  attackerId,
  racketId,
  prepTier: 0,
  telegraphedWeek: 1,
  resolveWeek,
});

function world(mut?: (s: GameState) => void): GameState {
  const s = cloneGameState(createInitialGameState(5));
  s.rackets[r1]!.ownerId = PLAYER_ID;
  s.rackets[r2]!.ownerId = 'ai_2';
  s.activeSieges = [siege('ai_1', r1, 4), siege(PLAYER_ID, r2, 5), siege('ai_1', r2, 3)];
  mut?.(s);
  return s;
}

describe('selectVisibleSieges fog of war', () => {
  it('always shows incoming raids and own outgoing raids, sorted by resolve week', () => {
    const v = selectVisibleSieges(world(), PLAYER_ID, false);
    expect(v.incoming.map((r) => r.resolveWeek)).toEqual([4]);
    expect(v.incoming[0]).toMatchObject({ direction: 'incoming', attackerId: 'ai_1', racketId: r1 });
    expect(v.outgoing.map((r) => r.racketId)).toEqual([r2]);
    expect(v.outgoingSlots).toEqual({ used: 1, max: 2 });
  });

  it('hides rival-vs-rival raids until a Spy covers the attacker or the defender', () => {
    expect(selectVisibleSieges(world(), PLAYER_ID, false).rivalVsRival).toEqual([]);
    const spyAttacker = world((s) => (s.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_1 = 2));
    expect(selectVisibleSieges(spyAttacker, PLAYER_ID, false).rivalVsRival.map((r) => r.attackerId)).toEqual(['ai_1']);
    const spyDefender = world((s) => (s.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_2 = 1));
    expect(selectVisibleSieges(spyDefender, PLAYER_ID, false).rivalVsRival).toHaveLength(1);
  });

  it('an expired Spy (0 weeks) reveals nothing', () => {
    const s = world((x) => (x.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_1 = 0));
    expect(selectVisibleSieges(s, PLAYER_ID, false).rivalVsRival).toEqual([]);
  });

  it('DEV shows every raid without any Spy', () => {
    const v = selectVisibleSieges(world(), PLAYER_ID, true);
    expect(v.rivalVsRival).toHaveLength(1);
    expect(v.rivalVsRival[0]).toMatchObject({ resolveWeek: 3, ownerId: 'ai_2' });
  });

  it('ignores raids on unknown businesses and counts slots even when none are visible', () => {
    const s = world((x) => {
      x.activeSieges = [siege(PLAYER_ID, r2, 5), siege(PLAYER_ID, r3, 5), { ...siege('ai_1', 'ghost'), racketId: 'ghost' }];
      x.rackets[r3]!.ownerId = 'ai_3';
    });
    const v = selectVisibleSieges(s, PLAYER_ID, false);
    expect(v.outgoingSlots).toEqual({ used: 2, max: 2 });
    expect(v.incoming).toEqual([]);
  });

  it('attacker odds follow the attacker crew right now', () => {
    const weak = selectVisibleSieges(world(), PLAYER_ID, false).incoming[0]!;
    const strong = selectVisibleSieges(
      world((s) => (s.syndicates.ai_1!.crew = { thug: 12, enforcer: 0, hitman: 0 })),
      PLAYER_ID,
      false
    ).incoming[0]!;
    const def = RACKETS_BY_DISTRICT.docks[0]!.baseDefense;
    expect(weak.odds).toEqual(calculateRiskProbabilities(12, def, 0));
    expect(strong.odds).toEqual(calculateRiskProbabilities(36, def, 0));
    expect(strong.odds.clean).toBeGreaterThan(weak.odds.clean);
  });
});
