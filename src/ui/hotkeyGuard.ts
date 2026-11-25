// Pure hotkey resolution for the ledger (M2-T4). No React / DOM imports: the hook passes a plain
// description of the key event, so every focus / overlay rule is unit-testable.

export type HotkeyTab = 'ops' | 'turf' | 'rivals' | 'ledger';

export type HotkeyCommand = { type: 'tab'; tab: HotkeyTab } | { type: 'endWeek' };

export interface HotkeyTarget {
  tagName: string;
  role?: string | null;
  /** `type` attribute of an INPUT. */
  inputType?: string | null;
  isContentEditable?: boolean;
  disabled?: boolean;
}

export interface HotkeyContext {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  repeat: boolean;
  target: HotkeyTarget | null;
  /** Any dialog / sheet / popover is open. */
  overlayOpen: boolean;
  /** The player's run is live (not over, not eliminated). */
  live: boolean;
}

const TAB_KEYS: Readonly<Record<string, HotkeyTab>> = { '1': 'ops', '2': 'turf', '3': 'rivals', '4': 'ledger' };
const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** Controls that natively consume Space; the hotkey must not double-fire on them. */
const SPACE_CONTROL_TAGS = new Set(['BUTTON', 'A']);
const SPACE_CONTROL_ROLES = new Set(['tab', 'switch', 'checkbox', 'button']);

function isTextTarget(t: HotkeyTarget | null): boolean {
  if (!t) return false;
  return TEXT_TAGS.has(t.tagName.toUpperCase()) || t.isContentEditable === true;
}

function consumesSpace(t: HotkeyTarget | null): boolean {
  if (!t || t.disabled) return false; // a disabled control ignores Space, so the hotkey may fire
  if (SPACE_CONTROL_TAGS.has(t.tagName.toUpperCase())) return true;
  return t.role != null && SPACE_CONTROL_ROLES.has(t.role);
}

/** Maps a key event to a ledger command, or `null` when the key must be left alone. */
export function resolveHotkey(ctx: HotkeyContext): HotkeyCommand | null {
  if (ctx.ctrl || ctx.meta || ctx.alt) return null;
  if (ctx.repeat || ctx.overlayOpen || !ctx.live) return null;
  if (isTextTarget(ctx.target)) return null;

  const tab = TAB_KEYS[ctx.key];
  if (tab) return { type: 'tab', tab };
  if (ctx.key === ' ') return consumesSpace(ctx.target) ? null : { type: 'endWeek' };
  return null;
}
