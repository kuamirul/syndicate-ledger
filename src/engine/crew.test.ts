import { describe, expect, it } from 'vitest';
import { CREW_TIERS } from '../data';
import {
  calculateSyndicateAttack,
  calculateSyndicateDefense,
  calculateSyndicatePayroll,
  calculateTotalCrewCount,
} from './crew';
import type { SyndicateCrew } from './types';

describe('crew helpers', () => {
  const crew: SyndicateCrew = { thug: 2, enforcer: 3, hitman: 1 };

  it('match CREW_TIERS sums', () => {
    const t = (id: keyof SyndicateCrew) => CREW_TIERS.find((c) => c.id === id)!;
    expect(calculateSyndicateAttack(crew)).toBe(
      2 * t('thug').attack + 3 * t('enforcer').attack + 1 * t('hitman').attack
    );
    expect(calculateSyndicateDefense(crew)).toBe(
      2 * t('thug').defense + 3 * t('enforcer').defense + 1 * t('hitman').defense
    );
    expect(calculateSyndicatePayroll(crew)).toBe(
      2 * t('thug').weeklyPayroll + 3 * t('enforcer').weeklyPayroll + 1 * t('hitman').weeklyPayroll
    );
    expect(calculateTotalCrewCount(crew)).toBe(6);
  });

  it('4 thugs → attack 12, payroll $1,000 (SPEC §3.1)', () => {
    const thugs: SyndicateCrew = { thug: 4, enforcer: 0, hitman: 0 };
    expect(calculateSyndicateAttack(thugs)).toBe(12);
    expect(calculateSyndicatePayroll(thugs)).toBe(1000);
  });

  it('empty crew yields zeros', () => {
    const none: SyndicateCrew = { thug: 0, enforcer: 0, hitman: 0 };
    expect(calculateSyndicateAttack(none)).toBe(0);
    expect(calculateSyndicateDefense(none)).toBe(0);
    expect(calculateSyndicatePayroll(none)).toBe(0);
    expect(calculateTotalCrewCount(none)).toBe(0);
  });
});
