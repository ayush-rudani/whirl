"use client";

import { useSyncExternalStore } from "react";

/* Which keyboard overlay is up: the ⌘K palette, the "?" shortcut sheet, or
   neither. A module-level store (same shape as lib/incognito.ts) so the
   sidebar row, the phone's History button and the hotkey layer can all open
   the one palette without threading state through the shell — and so
   toggling it re-renders the overlay alone, never the sidebar it was opened
   from.

   One value, not two booleans: the overlays are mutually exclusive, so
   opening either one closes the other by construction. */

export type KeyboardOverlay = "palette" | "shortcuts" | null;

let overlay: KeyboardOverlay = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setKeyboardOverlay(next: KeyboardOverlay) {
  if (next === overlay) return;
  overlay = next;
  for (const listener of listeners) listener();
}

/* An action waiting for the overlay's exit to settle. Opening a popover or
   a confirm while the palette is still fading out races its focus return —
   the palette hands focus back to wherever it came from and the fresh
   popup loses it. So actions launched from an overlay close it first and
   run once the overlay reports its close complete (flushOverlayAction),
   with a short fallback in case that report never comes. */
const CLOSE_FALLBACK_MS = 300;
let pending: (() => void) | null = null;
let fallback: ReturnType<typeof setTimeout> | null = null;

export function flushOverlayAction() {
  if (fallback !== null) clearTimeout(fallback);
  fallback = null;
  const action = pending;
  pending = null;
  action?.();
}

/** Runs `action` now if no overlay is up, otherwise right after it closes. */
export function runAfterOverlay(action: () => void) {
  if (overlay === null) {
    action();
    return;
  }
  pending = action;
  if (fallback !== null) clearTimeout(fallback);
  fallback = setTimeout(flushOverlayAction, CLOSE_FALLBACK_MS);
  setKeyboardOverlay(null);
}

/** Opens `target`, or closes it if it's already the one showing. Swapping
 *  from the other overlay waits out its exit, same as any action would. */
export function toggleKeyboardOverlay(target: Exclude<KeyboardOverlay, null>) {
  if (overlay === target) setKeyboardOverlay(null);
  else runAfterOverlay(() => setKeyboardOverlay(target));
}

export function useKeyboardOverlay(): KeyboardOverlay {
  return useSyncExternalStore(
    subscribe,
    () => overlay,
    () => null,
  );
}

/* Marks our own overlays' popups so the "is some other dialog up?" check
   below can tell them apart from everyone else's. */
export const KEYBOARD_LAYER_ATTR = "data-keyboard-layer";

/* Some other modal surface owns the keyboard right now — a confirm dialog, a
   menu, the model picker. App shortcuts stand down until it closes rather
   than navigating out from under it. Our own palette and sheet don't count:
   a shortcut pressed over them simply closes them and runs. */
export function isForeignOverlayOpen(): boolean {
  return (
    document.querySelector(
      `[role='dialog'][data-open]:not([${KEYBOARD_LAYER_ATTR}]), [role='alertdialog'][data-open], [role='menu'][data-open]`,
    ) !== null
  );
}
