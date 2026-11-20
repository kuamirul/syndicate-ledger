import { describe, expect, it } from 'vitest';
import { guidedPhase, VERB_UNLOCK_WEEK, verbForAction, verbLock } from './guidedIntro';
import {
  arrestStrikesLabel,
  GOAL_TEXT,
  OUTCOME_LABELS,
  plainStatusMessage,
  PREP_TERM,
  TERMS,
  VERBS,
  type VerbKey,
} from './terms';

const ALL_VERBS = Object.keys(VERBS) as VerbKey[];

describe('terms — plain-English labels', () => {
  it('maps every engine verb to the agreed label', () => {
    expect(VERBS.runJob.label).toBe('Run Cash Job');
    expect(VERBS.claimBusiness.label).toBe('Claim Empty Business');
    expect(VERBS.stageRaid.label).toBe('Stage Rival Raid (2 Wks)');
    expect(VERBS.hireCrew.label).toBe('Hire Crew');
    expect(VERBS.bankCash.label).toBe('Bank Safe Cash (2x Score, 1/wk)');
    expect(VERBS.payCops.label).toBe('Pay Off Cops (-22 Heat)');
    expect(VERBS.snitch.label).toBe('Snitch on Rival (+12 Heat)');
    expect(VERBS.spy.label).toBe('Spy on Rival (3 Wks)');
    expect(PREP_TERM.label).toBe('Pay Off Guards (+Odds)');
    expect(TERMS.heat.label).toBe('Police Heat (0–100%)');
    expect(TERMS.netWorth.label).toBe('Net Worth (Win Score)');
    expect(TERMS.sizeTax.label).toBe('Size Tax (4+ Businesses)');
    expect(arrestStrikesLabel(1)).toBe("Arrest Strikes (1/2 — Hit 100% twice and you're busted)");
    expect(GOAL_TEXT).toBe('Goal: Highest Net Worth after Week 28 — or own 8/12 Businesses early');
  });

  it('gives every term a one-sentence subtitle and no insider jargon in labels', () => {
    const terms = [...Object.values(VERBS), ...Object.values(TERMS), PREP_TERM];
    for (const t of terms) {
      expect(t.subtitle).toMatch(/^[A-Z].*\.$/);
      expect(t.subtitle.split('. ').length).toBe(1);
      expect(t.label).not.toMatch(/RICO|Extort|Launder|Prep\b|Wiretap|Valuation/i);
    }
    for (const label of Object.values(OUTCOME_LABELS)) expect(label).not.toMatch(/RICO|Valuation/);
  });
});

describe('plainStatusMessage', () => {
  it('translates engine verbs and jargon in the status line', () => {
    expect(plainStatusMessage('LAUNDER succeeded')).toBe('Bank Safe Cash succeeded');
    expect(plainStatusMessage('EXTORT succeeded (CLEAN, roll 12)')).toBe('Run Cash Job succeeded (CLEAN, roll 12)');
    expect(plainStatusMessage('SEIZE queued as siege — resolves at the start of week 3')).toBe(
      'Stage Rival Raid (2 Wks): raid staged — it lands at the start of week 3'
    );
    expect(plainStatusMessage('PASS succeeded')).toBe('Skipped one action');
    expect(plainStatusMessage('Rejected: Launder limit reached (1 per week)')).toBe('Rejected: Already banked this week (1 per week)');
    expect(plainStatusMessage('Rejected: Insufficient DirtyCash for assault')).toBe('Rejected: Insufficient Street Cash for assault');
    expect(plainStatusMessage('Rejected: Too many sieges underway (max 2 at a time)')).toBe('Rejected: Too many raids underway (max 2 at a time)');
    expect(plainStatusMessage('Week 3 ended.')).toBe('Week 3 ended.');
  });
});

describe('guidedIntro — UI-only staged unlocks', () => {
  it('names the three phases by week', () => {
    expect(guidedPhase(1).title).toBe('Phase 1: Build Your Base');
    expect(guidedPhase(2).phase).toBe(1);
    expect(guidedPhase(3).title).toBe('Phase 2: Protect Profits');
    expect(guidedPhase(3).banner).toContain(VERBS.bankCash.label);
    expect(guidedPhase(3).banner).toContain(VERBS.payCops.label);
    expect(guidedPhase(4).title).toBe('Phase 3: Turf War');
    expect(guidedPhase(28).phase).toBe(3);
  });

  it('weeks 1–2 allow only jobs, claims and hiring; the rest show their unlock week', () => {
    for (const week of [1, 2]) {
      const open = ALL_VERBS.filter((v) => !verbLock(v, week, true).locked).sort();
      expect(open).toEqual(['claimBusiness', 'hireCrew', 'runJob']);
    }
    expect(verbLock('bankCash', 1, true)).toEqual({ locked: true, badge: 'Unlocks Week 3' });
    expect(verbLock('payCops', 2, true)).toEqual({ locked: true, badge: 'Unlocks Week 3' });
    for (const v of ['stageRaid', 'spy', 'snitch'] as const) {
      expect(verbLock(v, 1, true)).toEqual({ locked: true, badge: 'Unlocks Week 4' });
    }
  });

  it('week 3 unlocks banking and paying off cops; week 4 unlocks everything', () => {
    const open3 = ALL_VERBS.filter((v) => !verbLock(v, 3, true).locked).sort();
    expect(open3).toEqual(['bankCash', 'claimBusiness', 'hireCrew', 'payCops', 'runJob']);
    expect(ALL_VERBS.every((v) => !verbLock(v, 4, true).locked)).toBe(true);
    expect(Math.max(...Object.values(VERB_UNLOCK_WEEK))).toBe(4);
  });

  it('turning the intro off unlocks every verb on week 1', () => {
    expect(ALL_VERBS.every((v) => verbLock(v, 1, false).locked === false)).toBe(true);
  });

  it('maps engine actions to UI verbs (SEIZE splits on the owner)', () => {
    expect(verbForAction({ type: 'EXTORT', jobId: 'shakedown', prepTier: 0 })).toBe('runJob');
    expect(verbForAction({ type: 'SEIZE', racketId: 'x', prepTier: 0 }, null)).toBe('claimBusiness');
    expect(verbForAction({ type: 'SEIZE', racketId: 'x', prepTier: 0 }, 'ai_1')).toBe('stageRaid');
    expect(verbForAction({ type: 'RECRUIT', tier: 'thug', count: 1 })).toBe('hireCrew');
    expect(verbForAction({ type: 'LAUNDER', amount: 1 })).toBe('bankCash');
    expect(verbForAction({ type: 'BRIBE', useClean: true })).toBe('payCops');
    expect(verbForAction({ type: 'BRIBE', useClean: false, targetSyndicateId: 'ai_1' })).toBe('snitch');
    expect(verbForAction({ type: 'WIRETAP', targetSyndicateId: 'ai_1' })).toBe('spy');
    expect(verbForAction({ type: 'PASS' })).toBeNull();
  });
});
