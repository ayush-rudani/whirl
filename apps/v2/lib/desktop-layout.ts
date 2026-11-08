"use client";

import { useSyncExternalStore } from "react";

/* Whether the desktop arrangement is showing — the rail beside the pane,
   rather than the phone's tab bar. The same md breakpoint the shell's
   layout classes switch on, read live so a window dragged narrower flips it
   without a reload. For behavior forks only; layout stays in CSS. */

const QUERY = "(min-width: 768px)";

/* One MediaQueryList for the tab's lifetime: getSnapshot runs on every
   render of every subscriber, and a fresh matchMedia() each time is a
   needless allocation and style lookup. */
let media: MediaQueryList | null = null;

function getMedia(): MediaQueryList {
  media ??= window.matchMedia(QUERY);
  return media;
}

function subscribe(onChange: () => void) {
  const query = getMedia();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True at md and up; false during SSR. */
export function useDesktopLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getMedia().matches,
    () => false,
  );
}
