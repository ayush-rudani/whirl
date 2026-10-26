"use client";

import type { ReactNode } from "react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import { appHotkeys } from "@/lib/commands/hotkeys";
import { CommandHotkeys } from "./command-hotkeys";
import { CommandPalette } from "./palette/command-palette";
import { ShortcutSheet } from "./shortcut-sheet";

/* Keyboard-first plumbing for the shell: the hotkey provider (which knows
   every declared shortcut, mounted or not), the bindings themselves, and
   the two overlays they open. Each overlay is mounted exactly once here, so
   no matter who asks — a key, a sidebar row, a phone button — there's only
   ever one palette and one sheet. */
export function KeyboardLayer({ children }: { children: ReactNode }) {
  return (
    <HotkeysProvider appHotkeys={appHotkeys}>
      {children}
      <CommandHotkeys />
      <CommandPalette />
      <ShortcutSheet />
    </HotkeysProvider>
  );
}
