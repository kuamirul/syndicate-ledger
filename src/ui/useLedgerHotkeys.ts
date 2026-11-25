import { useEffect } from 'react';
import { gameStore } from '@/store/gameStore';
import { resolveHotkey, type HotkeyTarget } from './hotkeyGuard';
import { isRunLive } from './matchSummary';
import { PLAYER_ID } from './viewModel';

const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"]';

function describeTarget(el: Element | null): HotkeyTarget | null {
  if (!el) return null;
  const html = el as HTMLElement;
  return {
    tagName: el.tagName,
    role: el.getAttribute('role'),
    inputType: el instanceof HTMLInputElement ? el.type : null,
    isContentEditable: html.isContentEditable === true,
    disabled: (el as HTMLButtonElement).disabled === true,
  };
}

/**
 * 1-4 switch tabs, Space ends the week (through the unspent-Action guard). Ignored with modifier
 * keys, in text fields, on focused controls that natively use Space, while any dialog / sheet /
 * popover is open, and once the run is over. See `resolveHotkey`.
 */
export function useLedgerHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = gameStore.getState();
      const command = resolveHotkey({
        key: e.key,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        alt: e.altKey,
        repeat: e.repeat,
        target: describeTarget(document.activeElement),
        overlayOpen: document.querySelector(OVERLAY_SELECTOR) !== null,
        live: isRunLive(state.gameState, PLAYER_ID),
      });
      if (!command) return;
      e.preventDefault(); // keep Space from scrolling the page
      if (command.type === 'tab') state.setActiveTab(command.tab);
      else state.requestEndWeek();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
