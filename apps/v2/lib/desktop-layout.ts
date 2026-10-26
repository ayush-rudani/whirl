"use client";

import { useSyncExternalStore } from "react";

/* Whether the desktop arrangement is showing — the rail beside the pane,
   rather than the phone's tab bar. The same md breakpoint the shell's
   layout classes switch on, read live so a window dragged narrower flips it
   without a reload. For behavior forks only; layout stays in CSS. */

const QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True at md and up; false during SSR. */
export function useDesktopLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
