import { describe, expect, it } from 'vitest';
import { plainEventText, plainRejection, plainStatusMessage } from './terms';

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
