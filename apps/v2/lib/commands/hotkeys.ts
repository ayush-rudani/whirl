import { defineAppHotkeys } from "@tanstack/react-hotkeys";

/* Every app-wide shortcut, declared once. The hotkey layer registers these
   (components/commands/command-hotkeys.tsx), the palette prints them beside
   its actions, and the shortcut sheet lists them — so a binding changed here
   changes everywhere at once, and the sheet can never drift from what the
   keyboard actually does.

   Picking keys in a browser is mostly picking around the browser: ⌘N, ⌘T and
   ⌘W never reach the page, Ctrl+Shift+I is devtools on Windows, ⌘⇧M swaps
   Chrome profiles on a Mac. Everything below survives all of that. */
export const appHotkeys = defineAppHotkeys({
  "palette.open": {
    hotkey: "Mod+K",
    meta: { name: "Search & commands", group: "General" },
  },
  "shortcuts.open": {
    hotkey: "?",
    meta: { name: "Keyboard shortcuts", group: "General" },
  },
  "chat.new": {
    hotkey: "Mod+Shift+O",
    meta: { name: "New chat", group: "Chat" },
  },
  /* The slash echoes the composer's own "/" menu, where models live too. */
  "model.switch": {
    hotkey: "Mod+/",
    meta: { name: "Switch model", group: "Chat" },
  },
  "incognito.toggle": {
    hotkey: "Mod+Shift+X",
    meta: { name: "Toggle incognito", group: "Chat" },
  },
  /* ⌘B is bold in the document editor; that wins there (the hotkey layer
     skips keys something closer to the focus already handled). */
  "sidebar.toggle": {
    hotkey: "Mod+B",
    meta: { name: "Toggle sidebar", group: "Navigation" },
  },
  "settings.open": {
    hotkey: "Mod+,",
    meta: { name: "Open settings", group: "Navigation" },
  },
  /* Palette-only for now: listed there, left off the keyboard. */
  "integrations.open": {
    hotkey: null,
    meta: { name: "Browse integrations", group: "Navigation" },
  },
});

export type CommandId = keyof typeof appHotkeys;

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}
