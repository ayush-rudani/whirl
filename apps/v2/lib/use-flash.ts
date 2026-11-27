"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* A flag that switches itself back off — the "Copied" tick and friends. The
   timer restarts on every flash and is cleared on unmount, so a card that
   leaves mid-tick doesn't leave a timer behind. */
export function useFlash(durationMs = 1200): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setOn(false);
    }, durationMs);
  }, [durationMs]);

  return [on, flash];
}
