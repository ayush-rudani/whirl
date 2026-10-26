"use client";

import { useAppHotkeys, useHotkeys } from "@tanstack/react-hotkeys";

import { isForeignOverlayOpen } from "@/lib/commands/overlays";
import { useCommands } from "@/lib/commands/use-commands";

/* Binds every command that has a key. Renders nothing.

   The manager listens on `document` and stops propagation on a match, so a
   handled key never reaches the window-level listeners further out — which
   is what keeps "?" from also being typed into the composer by the chat
   face's type-anywhere handler. Letter-ish keys like "?" pause while a
   field has focus; ⌘/Ctrl chords keep working there, as they should. */
export function CommandHotkeys() {
  const commands = useCommands();
  const appHotkeys = useAppHotkeys();

  useHotkeys(
    commands.map((command) => ({
      hotkey: appHotkeys[command.id],
      callback: (event) => {
        /* Something closer to the focus already handled this key — ⌘B
           in the document editor is bold, not the sidebar. */
        if (event.defaultPrevented) return;
        event.preventDefault();
        /* A confirm, menu or picker owns the keyboard while it's up. */
        if (isForeignOverlayOpen()) return;
        command.run();
      },
      options: { enabled: command.available },
    })),
    /* Prevented by hand above, so an inner handler's claim on the key can
       be seen first — the manager would otherwise prevent it before the
       callback ever runs. */
    { preventDefault: false },
  );

  return null;
}
