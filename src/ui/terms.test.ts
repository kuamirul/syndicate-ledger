import { describe, expect, it } from 'vitest';
import { DEFENSE_TERMS, plainEventText, plainRejection, plainStatusMessage } from './terms';

describe('plainEventText', () => {
  it('translates Sunday ledger events', () => {
    expect(plainEventText('X paid $2000 Crew Payroll + $600 Turf Upkeep (4 rackets).')).toBe(
      'X paid $2000 Crew Payroll + $600 Size Tax (4 businesses).'
    );
    expect(plainEventText('Police Raid hit X! Seized $500 in DirtyCash.')).toBe(
      'Police raid hit X! Seized $500 in Street Cash.'
    );
    expect(plainEventText('X was hit with a federal RICO indictment and eliminated!')).toBe(
      'X was hit with a Police Bust / Arrest and eliminated!'
    );
  });
  it('translates siege resolution lines and leaves unknown text alone', () => {
    expect(plainEventText("Start of week 4: Y's siege on Fish Market was called off (no crew left).")).toBe(
      "Week 4 start: Y's raid on Fish Market was called off (no crew left)."
    );
    expect(plainEventText('Something new happened.')).toBe('Something new happened.');
  });
  it('translates CleanCash and liquidation', () => {
    expect(plainEventText('Needs CleanCash; racket sold')).toBe('Needs Safe Cash; business sold');
  });
});

describe('plainRejection', () => {
  it('translates engine rejection reasons', () => {
    expect(plainRejection('Insufficient DirtyCash for assault')).toBe('Insufficient Street Cash for assault');
    expect(plainRejection('Already besieging this racket')).toBe('Already besieging this business');
    expect(plainRejection('Requires $3,000 CleanCash to bribe')).toBe('Requires $3,000 Safe Cash to bribe');
    expect(plainRejection('Syndicate already owns this racket')).toBe('Syndicate already owns this business');
  });
});

describe('plainStatusMessage (extended)', () => {
  it('also covers turf upkeep and RICO wording', () => {
    expect(plainStatusMessage('Rejected: turf upkeep unpaid')).toBe('Rejected: Size Tax unpaid');
    expect(plainStatusMessage('RICO indictment looms')).toBe('Police Bust / Arrest looms');
  });
});

describe('M3-T1 raid defense wording', () => {
  const RAW = /\b(rackets?|sieges?|RICO|DirtyCash|CleanCash|assignedGuards|garrison)\b/i;
  it('translates the defender-casualty siege line', () => {
    expect(
      plainEventText(
        "Start of week 6: The Iron Syndicate's siege on Fish Market took the racket (MESSY, roll 42, lost 1 crew; defender lost 1 crew)."
      )
    ).toBe("Week 6 start: The Iron Syndicate's raid on Fish Market took the business (MESSY, roll 42, lost 1 crew; the owner lost 1 guard).");
    expect(plainEventText("Start of week 6: X's siege on Fish Market took the racket (CLEAN, roll 3, lost 0 crew; defender lost 2 crew).")).toContain(
      'the owner lost 2 guards'
    );
  });
  it('a failed raid line (no defender loss) keeps its wording', () => {
    const out = plainEventText("Start of week 6: X's siege on Fish Market failed (BOTCHED, roll 99, lost 2 crew).");
    expect(out).toBe("Week 6 start: X's raid on Fish Market failed (BOTCHED, roll 99, lost 2 crew).");
    expect(out).not.toMatch(RAW);
  });
  it('defense UI strings contain no raw engine identifiers', () => {
    const strings = [
      ...Object.values(DEFENSE_TERMS).flatMap((v) => (typeof v === 'string' ? [v] : [])),
      DEFENSE_TERMS.thugPreview(40, 31, 30, 41),
      DEFENSE_TERMS.thugNoChange(4),
    ];
    for (const s of strings) expect(s).not.toMatch(RAW);
    expect(DEFENSE_TERMS.fogHint).toBe('Excludes hidden rival guards — Spy ($1,000) for exact odds');
  });
});
