import { describe, expect, it } from 'vitest';
import { resolveHotkey, type HotkeyContext } from './hotkeyGuard';

const base: HotkeyContext = {
  key: ' ',
  ctrl: false,
  meta: false,
  alt: false,
  repeat: false,
  target: { tagName: 'BODY' },
  overlayOpen: false,
  live: true,
};
const ctx = (over: Partial<HotkeyContext>): HotkeyContext => ({ ...base, ...over });

describe('resolveHotkey', () => {
  it('1-4 switch tabs and Space ends the week from the page body', () => {
    expect(resolveHotkey(ctx({ key: '1' }))).toEqual({ type: 'tab', tab: 'ops' });
    expect(resolveHotkey(ctx({ key: '2' }))).toEqual({ type: 'tab', tab: 'turf' });
    expect(resolveHotkey(ctx({ key: '3' }))).toEqual({ type: 'tab', tab: 'rivals' });
    expect(resolveHotkey(ctx({ key: '4' }))).toEqual({ type: 'tab', tab: 'ledger' });
    expect(resolveHotkey(ctx({ key: ' ' }))).toEqual({ type: 'endWeek' });
  });

  it('ignores other keys', () => {
    for (const key of ['5', '0', 'a', 'Enter', 'Escape', 'Tab']) expect(resolveHotkey(ctx({ key }))).toBeNull();
  });

  it('ignores any key with Ctrl, Meta or Alt held', () => {
    for (const mod of ['ctrl', 'meta', 'alt'] as const) {
      expect(resolveHotkey(ctx({ key: '1', [mod]: true }))).toBeNull();
      expect(resolveHotkey(ctx({ key: ' ', [mod]: true }))).toBeNull();
    }
  });

  it('ignores key repeat so holding Space cannot end several weeks', () => {
    expect(resolveHotkey(ctx({ key: ' ', repeat: true }))).toBeNull();
  });

  it('ignores everything inside text fields and editable areas', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) {
      expect(resolveHotkey(ctx({ key: '2', target: { tagName } }))).toBeNull();
      expect(resolveHotkey(ctx({ key: ' ', target: { tagName } }))).toBeNull();
    }
    expect(resolveHotkey(ctx({ key: '1', target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull();
  });

  it('ignores everything while any dialog, sheet or popover is open', () => {
    expect(resolveHotkey(ctx({ key: '1', overlayOpen: true }))).toBeNull();
    expect(resolveHotkey(ctx({ key: ' ', overlayOpen: true }))).toBeNull();
  });

  it('ignores everything once the run is over', () => {
    expect(resolveHotkey(ctx({ key: '1', live: false }))).toBeNull();
    expect(resolveHotkey(ctx({ key: ' ', live: false }))).toBeNull();
  });

  it('Space is left to focused controls that natively use it; 1-4 still work there', () => {
    const controls = [
      { tagName: 'BUTTON' },
      { tagName: 'A' },
      { tagName: 'DIV', role: 'tab' },
      { tagName: 'BUTTON', role: 'switch' },
      { tagName: 'DIV', role: 'checkbox' },
    ];
    for (const target of controls) {
      expect(resolveHotkey(ctx({ key: ' ', target }))).toBeNull();
      expect(resolveHotkey(ctx({ key: '3', target }))).toEqual({ type: 'tab', tab: 'rivals' });
    }
  });

  it('Space still ends the week when the focused button is disabled (e.g. the action just spent the last AP)', () => {
    expect(resolveHotkey(ctx({ key: ' ', target: { tagName: 'BUTTON', disabled: true } }))).toEqual({ type: 'endWeek' });
  });
});
