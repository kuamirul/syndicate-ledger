import { describe, expect, it } from 'vitest';
import { RACKETS_BY_DISTRICT } from '../data';
import { applyAction, cloneGameState, createInitialGameState } from '../engine/reducer';
import type { GameState } from '../engine/types';
import { calculateRiskProbabilities } from '../engine/risk';
import { selectVisibleSieges, visibleRaidDefense } from './siegeModel';
import { DEFENSE_TERMS } from './terms';
import {
  marginalImpact,
  selectDistrictCards,
  selectIncomingRaidAlerts,
  turfConsequences,
  type BusinessCard,
} from './turfModel';
import { PLAYER_ID } from './viewModel';

const ids = (d: keyof typeof RACKETS_BY_DISTRICT) => RACKETS_BY_DISTRICT[d].map((r) => r.id);

function fresh(mut?: (s: GameState) => void): GameState {
  const s = cloneGameState(createInitialGameState(5));
  mut?.(s);
  return s;
}
const me = (s: GameState) => s.syndicates[PLAYER_ID]!;
function give(s: GameState, owner: string, racketIds: string[]) {
  racketIds.forEach((id) => (s.rackets[id]!.ownerId = owner));
}
const cards = (s: GameState, guided = false, dev = false) =>
  selectDistrictCards(s, PLAYER_ID, guided, dev).flatMap((d) => d.cards);
const card = (s: GameState, id: string, guided = false): BusinessCard => cards(s, guided).find((c) => c.id === id)!;

describe('marginalImpact (Size Tax math)', () => {
  it('3 -> 4 businesses: adds $600 Size Tax and the +5 Empire Heat step', () => {
    const s = fresh((x) => give(x, PLAYER_ID, [...ids('neon_strip').slice(0, 2), ids('industrial')[0]!]));
    const target = RACKETS_BY_DISTRICT.docks[0]!;
    const m = marginalImpact(s, PLAYER_ID, target.id)!;
    expect(m).toMatchObject({ grossGain: target.dirtyYield, monopolyDelta: 0, sizeTaxDelta: 600, ownedAfter: 4 });
    expect(m.netWeekly).toBe(target.dirtyYield - 600);
    expect(m.heatDelta).toBe(target.passiveHeat + 5);
    expect(m.exceedsIncome).toBe(false);
  });

  it('claiming a 3rd business is free of Size Tax and Empire Heat', () => {
    const s = fresh((x) => give(x, PLAYER_ID, ids('neon_strip').slice(0, 2)));
    const target = RACKETS_BY_DISTRICT.docks[0]!;
    const m = marginalImpact(s, PLAYER_ID, target.id)!;
    expect(m.sizeTaxDelta).toBe(0);
    expect(m.heatDelta).toBe(target.passiveHeat);
  });

  it('5 -> 6 businesses: Size Tax steps $2,400 -> $5,400 and flags a loss-making business', () => {
    const s = fresh((x) => give(x, PLAYER_ID, [...ids('uptown'), ...ids('industrial').slice(0, 2)]));
    const target = RACKETS_BY_DISTRICT.docks[0]!; // $1,300/wk vs +$3,000 tax
    const m = marginalImpact(s, PLAYER_ID, target.id)!;
    expect(m.sizeTaxDelta).toBe(3000);
    expect(m.netWeekly).toBe(1300 - 3000);
    expect(m.exceedsIncome).toBe(true);
    expect(m.heatDelta).toBe(target.passiveHeat + 5);
  });

  it('completing a District adds the +25% bonus across the whole district', () => {
    const [a, b, c] = ids('docks');
    const s = fresh((x) => give(x, PLAYER_ID, [a!, b!]));
    const m = marginalImpact(s, PLAYER_ID, c!)!;
    // before 2 x 1300 = 2600; after 3 x floor(1300 x 1.25) = 4875
    expect(m.grossGain).toBe(4875 - 2600);
    expect(m.monopolyDelta).toBe(m.grossGain - 1300);
  });

  it('returns null for an unknown business', () => {
    expect(marginalImpact(fresh(), PLAYER_ID, 'nope')).toBeNull();
  });
});

describe('selectDistrictCards', () => {
  it('groups 12 businesses into 4 districts of 3', () => {
    const d = selectDistrictCards(fresh(), PLAYER_ID, true, false);
    expect(d.map((x) => x.name)).toEqual(['Docks', 'Neon Strip', 'Industrial', 'Uptown']);
    expect(d.every((x) => x.cards.length === 3 && x.total === 3)).toBe(true);
  });

  it('tracks X/3 owned, the monopoly badge and the "1 away" hint', () => {
    const [a, b, c] = ids('docks');
    const two = fresh((x) => give(x, PLAYER_ID, [a!, b!]));
    const docks2 = selectDistrictCards(two, PLAYER_ID, false, false)[0]!;
    expect(docks2).toMatchObject({ playerOwned: 2, monopoly: false });
    expect(docks2.awayHint).toContain('1 away');

    const three = fresh((x) => give(x, PLAYER_ID, [a!, b!, c!]));
    const docks3 = selectDistrictCards(three, PLAYER_ID, false, false)[0]!;
    expect(docks3).toMatchObject({ playerOwned: 3, monopoly: true, awayHint: null });

    const blocked = fresh((x) => {
      give(x, PLAYER_ID, [a!, b!]);
      give(x, 'ai_1', [c!]);
    });
    expect(selectDistrictCards(blocked, PLAYER_ID, false, false)[0]!.awayHint).toBeNull();
  });

  it('labels owners and kinds, and halves income of a damaged business', () => {
    const [a, b] = ids('docks');
    const s = fresh((x) => {
      give(x, PLAYER_ID, [a!]);
      give(x, 'ai_1', [b!]);
      x.rackets[b!]!.damagedTurnsRemaining = 1;
    });
    expect(card(s, a!)).toMatchObject({ kind: 'yours', ownerLabel: 'Yours', tiers: [] });
    const rival = card(s, b!);
    expect(rival).toMatchObject({ kind: 'raid', ownerLabel: s.syndicates.ai_1!.name, damaged: true, grossWeekly: 650 });
    expect(card(s, ids('uptown')[0]!)).toMatchObject({ kind: 'claim', ownerLabel: 'Unowned' });
  });
});

describe('claim / raid legality and Guided Intro', () => {
  const target = ids('docks')[0]!;
  const rivalOwned = (s: GameState) => give(s, 'ai_1', [target]);

  it('claims are open in week 1; raids lock until week 4 only while Guided Intro is on', () => {
    const claimWeek1 = card(fresh(), target, true);
    expect(claimWeek1).toMatchObject({ kind: 'claim', lockBadge: null, disabledReason: null, canRunFree: true });

    const w1 = fresh(rivalOwned);
    expect(card(w1, target, true)).toMatchObject({ kind: 'raid', lockBadge: 'Unlocks Week 4', canRunFree: false });
    expect(card(w1, target, false)).toMatchObject({ lockBadge: null, canRunFree: true });

    for (const week of [3, 4]) {
      const s = fresh((x) => {
        rivalOwned(x);
        x.week = week;
      });
      expect(card(s, target, true).lockBadge).toBe(week < 4 ? 'Unlocks Week 4' : null);
    }
  });

  it('0 crew blocks claims and raids with "Requires ≥1 Crew"', () => {
    const s = fresh((x) => {
      me(x).crew = { thug: 0, enforcer: 0, hitman: 0 };
    });
    expect(card(s, target).disabledReason).toBe('Requires ≥1 Crew');
    expect(applyAction(s, PLAYER_ID, { type: 'SEIZE', racketId: target, prepTier: 0 }).result.executed).toBe(false);
  });

  it('caps outgoing raids at 2 and blocks a duplicate raid', () => {
    const [a, b, c] = [ids('docks')[0]!, ids('docks')[1]!, ids('docks')[2]!];
    const s = fresh((x) => {
      give(x, 'ai_1', [a, b, c]);
      x.week = 4;
      x.activeSieges.push(
        { id: `4:${PLAYER_ID}:${a}`, attackerId: PLAYER_ID, racketId: a, prepTier: 0, telegraphedWeek: 4, resolveWeek: 6 },
        { id: `4:${PLAYER_ID}:${b}`, attackerId: PLAYER_ID, racketId: b, prepTier: 0, telegraphedWeek: 4, resolveWeek: 6 }
      );
    });
    expect(card(s, a).disabledReason).toBe('Already raiding this business');
    expect(card(s, c).disabledReason).toContain('raid slots');
    expect(applyAction(s, PLAYER_ID, { type: 'SEIZE', racketId: c, prepTier: 0 }).result.executed).toBe(false);
  });

  it('blocks a raid that could not land by week 28', () => {
    const s = fresh((x) => {
      rivalOwned(x);
      x.week = 27;
    });
    expect(card(s, target).disabledReason).toContain('Too late');
    expect(applyAction(s, PLAYER_ID, { type: 'SEIZE', racketId: target, prepTier: 0 }).result.executed).toBe(false);
    const w26 = fresh((x) => {
      rivalOwned(x);
      x.week = 26;
    });
    expect(card(w26, target).disabledReason).toBeNull();
  });

  it('prep tiers disable on cash and raid cost is $1,500 + prep', () => {
    const s = fresh((x) => {
      me(x).dirtyCash = 2000;
    });
    const tiers = card(s, target).tiers;
    expect(tiers.map((t) => t.streetCost)).toEqual([1500, 2700, 4300]);
    expect(tiers.map((t) => t.disabledReason === null)).toEqual([true, false, false]);
    expect(tiers[0]!.safety.leavesStreet).toBe(500);
  });

  it('no Action Points disables everything', () => {
    const s = fresh((x) => {
      me(x).actionPoints = 0;
    });
    expect(card(s, target)).toMatchObject({ canRunFree: false, disabledReason: 'No actions left' });
  });

  it('every enabled free action is accepted by applyAction (claims and raids)', () => {
    const [a, b] = ids('industrial');
    const s = fresh((x) => give(x, 'ai_2', [b!]));
    for (const id of [a!, b!]) {
      const c = card(s, id);
      expect(c.canRunFree).toBe(true);
      expect(applyAction(s, PLAYER_ID, { type: 'SEIZE', racketId: id, prepTier: 0 }).result.executed).toBe(true);
    }
    for (const t of card(s, a!).tiers) {
      const ok = applyAction(s, PLAYER_ID, { type: 'SEIZE', racketId: a!, prepTier: t.tier }).result.executed;
      expect(ok).toBe(t.disabledReason === null);
    }
  });

  it('shows a visible raid note on a targeted business', () => {
    const s = fresh((x) => {
      give(x, PLAYER_ID, [target]);
      x.activeSieges.push({ id: `1:ai_1:${target}`, attackerId: 'ai_1', racketId: target, prepTier: 0, telegraphedWeek: 1, resolveWeek: 3 });
    });
    expect(card(s, target).raidNote).toContain('Week 3');
  });
});

describe('turfConsequences', () => {
  it('adds grudge text only for raids and caps crew loss by crew owned', () => {
    const s = fresh((x) => give(x, 'ai_1', [ids('docks')[0]!]));
    const raid = turfConsequences(card(s, ids('docks')[0]!), 1);
    expect(raid.MESSY.gain).toContain('grudge +15');
    expect(raid.BOTCHED).toMatchObject({ crewLost: 1, heat: 0 });
    const claim = turfConsequences(card(fresh(), ids('docks')[1]!), 4);
    expect(claim.MESSY.gain).not.toContain('grudge');
    expect(claim.BOTCHED.crewLost).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// M3-T1: Crew Defense, Fog-of-War breakdown and incoming-raid Defense Preview
// ---------------------------------------------------------------------------------------------

describe('M3-T1 business defense breakdown respects Fog-of-War', () => {
  const [a, b] = ids('docks') as [string, string];
  const rivalWorld = (mut?: (s: GameState) => void) =>
    fresh((x) => {
      x.week = 5;
      give(x, 'ai_1', [a]);
      x.syndicates.ai_1!.crew = { thug: 2, enforcer: 2, hitman: 0 }; // 22 Defense, 1 business
      mut?.(x);
    });
  const myAttack = 12; // 4 starting Thugs

  it('un-Spied rival: base defense only, guards hidden, amber hint, odds from base only', () => {
    const c = card(rivalWorld(), a);
    expect(c).toMatchObject({ kind: 'raid', baseDefense: 10, guardDefense: null, defense: 10 });
    expect(c.fogHint).toBe(DEFENSE_TERMS.fogHint);
    expect(c.tiers[0]!.odds).toEqual(calculateRiskProbabilities(myAttack, 10, 0));
  });

  it('un-Spied odds do not move when the rival hides more crew', () => {
    const strong = rivalWorld((x) => (x.syndicates.ai_1!.crew = { thug: 0, enforcer: 3, hitman: 0 }));
    expect(card(strong, a).tiers.map((t) => t.odds)).toEqual(card(rivalWorld(), a).tiers.map((t) => t.odds));
  });

  it('Spied rival: exact guards in the breakdown and the odds, no hint', () => {
    const c = card(rivalWorld((x) => (x.syndicates[PLAYER_ID]!.wiretapTurnsRemaining.ai_1 = 2)), a);
    expect(c).toMatchObject({ baseDefense: 10, guardDefense: 22, defense: 32, fogHint: null });
    expect(c.tiers[0]!.odds).toEqual(calculateRiskProbabilities(myAttack, 32, 0));
  });

  it('DEV reveals exact guards; claims have 0 guards; own businesses show own guards', () => {
    const s = rivalWorld((x) => give(x, PLAYER_ID, [ids('uptown')[0]!]));
    const dev = selectDistrictCards(s, PLAYER_ID, false, true).flatMap((d) => d.cards);
    expect(dev.find((c) => c.id === a)).toMatchObject({ guardDefense: 22, fogHint: null });
    expect(card(s, b)).toMatchObject({ kind: 'claim', guardDefense: 0, defense: 10, fogHint: null });
    expect(card(s, ids('uptown')[0]!)).toMatchObject({ kind: 'yours', guardDefense: 12, fogHint: null });
  });

  it('visibleRaidDefense flags an outgoing raid on an un-Spied rival', () => {
    const s = rivalWorld((x) => {
      x.activeSieges = [{ id: `5:${PLAYER_ID}:${a}`, attackerId: PLAYER_ID, racketId: a, prepTier: 0, telegraphedWeek: 5, resolveWeek: 7 }];
    });
    const out = selectVisibleSieges(s, PLAYER_ID, false).outgoing[0]!;
    expect(out.defense).toEqual({ baseDefense: 10, guardDefense: null, total: 10, guardsHidden: true });
    expect(visibleRaidDefense(s, PLAYER_ID, a, true).guardsHidden).toBe(false);
  });
});

describe('M3-T1 incoming raid Defense Preview (+1 Street Thug)', () => {
  const [a, b, c2] = ids('docks') as [string, string, string];
  const incoming = (owned: string[], mut?: (s: GameState) => void) =>
    fresh((x) => {
      x.week = 5;
      give(x, PLAYER_ID, owned);
      x.syndicates.ai_1!.crew = { thug: 6, enforcer: 0, hitman: 0 }; // attack 18
      x.activeSieges = [{ id: `4:ai_1:${a}`, attackerId: 'ai_1', racketId: a, prepTier: 1, telegraphedWeek: 4, resolveWeek: 6 }];
      mut?.(x);
    });

  it('one business: +1 Thug raises guards 12 -> 15 and cuts the attacker Clean odds', () => {
    const [alert] = selectIncomingRaidAlerts(incoming([a]), PLAYER_ID, false);
    expect(alert).toMatchObject({ baseDefense: 10, guardDefense: 12, guardDefenseWithThug: 15, thugHelps: true, canHireThug: true });
    expect(alert!.oddsNow).toEqual(calculateRiskProbabilities(18, 22, 1));
    expect(alert!.oddsWithThug).toEqual(calculateRiskProbabilities(18, 25, 1));
    expect(alert!.oddsWithThug.clean).toBeLessThan(alert!.oddsNow.clean);
    expect(alert!.previewText).toBe(
      DEFENSE_TERMS.thugPreview(alert!.oddsNow.clean, alert!.oddsWithThug.clean, alert!.oddsNow.botched, alert!.oddsWithThug.botched)
    );
    expect(alert!.previewText).toMatch(/^Hiring \+1 Thug \(\$800\) drops attacker Clean win \d+% -> \d+%/);
  });

  it('four businesses: +1 Thug does not cross the split, so the preview says no change', () => {
    const [alert] = selectIncomingRaidAlerts(incoming([a, b, c2, ids('uptown')[0]!]), PLAYER_ID, false);
    expect(alert).toMatchObject({ guardDefense: 3, guardDefenseWithThug: 3, thugHelps: false });
    expect(alert!.previewText).toBe(DEFENSE_TERMS.thugNoChange(4));
  });

  it('0 crew and $0: guards are 0, and the hire button is disabled per applyAction', () => {
    const s = incoming([a], (x) => {
      x.syndicates[PLAYER_ID]!.crew = { thug: 0, enforcer: 0, hitman: 0 };
      x.syndicates[PLAYER_ID]!.dirtyCash = 0;
    });
    const [alert] = selectIncomingRaidAlerts(s, PLAYER_ID, false);
    expect(alert).toMatchObject({ guardDefense: 0, guardDefenseWithThug: 3, canHireThug: false });
  });

  it('no incoming raids, no alerts', () => {
    expect(selectIncomingRaidAlerts(fresh(), PLAYER_ID, false)).toEqual([]);
  });

  it('raid consequences warn that the owner loses a guard; claims do not', () => {
    const s = fresh((x) => {
      x.week = 5;
      give(x, 'ai_1', [a]);
    });
    const raid = turfConsequences(card(s, a), 4);
    expect(raid.CLEAN.gain).toContain(DEFENSE_TERMS.defenderLoss);
    expect(raid.MESSY.gain).toContain(DEFENSE_TERMS.defenderLoss);
    expect(raid.BOTCHED.gain).not.toContain(DEFENSE_TERMS.defenderLoss);
    expect(turfConsequences(card(s, b), 4).CLEAN.gain).toBe('Take the business');
  });
});
