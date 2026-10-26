"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  detectPlatform,
  formatForDisplay,
  isHotkeySequence,
  type Hotkey,
} from "@tanstack/react-hotkeys";

import { cn } from "@/lib/utils";

/* One keycap — the same outlined chip the palette has always worn on its
   Esc hint, now shared by every shortcut the app prints. */
export function Kbd({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 font-sans text-xs text-muted-foreground ring-1 ring-border",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

type Platform = ReturnType<typeof detectPlatform>;

const noopSubscribe = () => () => {};
const serverPlatform = (): Platform => "linux";

/* The platform never changes under a running tab, so there's nothing to
   subscribe to — this is only here for the server snapshot, which keeps a
   pre-rendered "Ctrl" from fighting a hydrated "⌘". */
function usePlatform() {
  return useSyncExternalStore(noopSubscribe, detectPlatform, serverPlatform);
}

/** A hotkey spelled out as keycaps in the viewer's own dialect: ⌘ K on a
 *  Mac, Ctrl K everywhere else. */
export function HotkeyKeys({
  hotkey,
  className,
}: {
  hotkey: Hotkey;
  className?: string;
}) {
  const platform = usePlatform();
  /* A sequence ("G then H") comes back one array per step; a chord is just
     the one step. */
  const steps = isHotkeySequence(hotkey)
    ? formatForDisplay(hotkey, { platform, parts: true })
    : [formatForDisplay(hotkey, { platform, parts: true })];

  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      {steps.flat().map((key, index) => (
        <Kbd key={index}>{key}</Kbd>
      ))}
    </span>
  );
}
