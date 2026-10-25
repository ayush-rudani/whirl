"use client";

import { useMemo } from "react";
import { useAppHotkeyList, type Hotkey } from "@tanstack/react-hotkeys";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { HotkeyKeys } from "@/components/ui/kbd";
import {
  flushOverlayAction,
  setKeyboardOverlay,
  useKeyboardOverlay,
} from "@/lib/commands/overlays";

type SheetRow = {
  id: string;
  name: string;
  hotkey: Hotkey;
  /** Bound, but there's nothing for it to do from where you are. */
  idle: boolean;
};

/* Keys the composer handles itself — not app commands, so they aren't in
   the registry, but nobody learns them any other way. */
const COMPOSER_ROWS: SheetRow[] = [
  { id: "composer.send", name: "Send message", hotkey: "Enter", idle: false },
  { id: "composer.newline", name: "New line", hotkey: "Shift+Enter", idle: false },
  { id: "composer.commands", name: "Models & tools", hotkey: "/", idle: false },
  { id: "composer.mention", name: "Mention an integration", hotkey: "@", idle: false },
];

/* Keys that only mean something inside the ⌘K palette. */
const PALETTE_ROWS: SheetRow[] = [
  {
    id: "palette.type",
    name: "Change type",
    /* Not a sequence — either arrow works. Listed as one only so the sheet
       draws both keycaps on one row. */
    hotkey: ["ArrowLeft", "ArrowRight"],
    idle: false,
  },
  { id: "palette.actions", name: "Chat actions", hotkey: "Alt+Enter", idle: false },
  { id: "palette.compose", name: "Compose from search", hotkey: "Tab", idle: false },
  { id: "palette.back", name: "Leave a folder", hotkey: "Backspace", idle: false },
];

/* Everything the registry declares, grouped in declaration order, with the
   palette's and composer's own keys tacked on the end. Read live from the
   hotkey provider, so this sheet and the keyboard can't disagree. */
function useSheetGroups(): Array<[string, SheetRow[]]> {
  const list = useAppHotkeyList();
  return useMemo(() => {
    const groups = new Map<string, SheetRow[]>();
    for (const { appHotkey, status } of list) {
      if (!appHotkey.hotkey) continue;
      const group = appHotkey.meta?.group ?? "General";
      const rows = groups.get(group) ?? [];
      rows.push({
        id: appHotkey.id,
        name: appHotkey.meta?.name ?? appHotkey.id,
        hotkey: appHotkey.hotkey,
        idle: status === "disabled",
      });
      groups.set(group, rows);
    }
    groups.set("In search", PALETTE_ROWS);
    groups.set("Composer", COMPOSER_ROWS);
    return [...groups];
  }, [list]);
}

/* The "?" cheat sheet. Same frosted recipe and group headers as the ⌘K
   palette, so the two read as siblings. */
export function ShortcutSheet() {
  const open = useKeyboardOverlay() === "shortcuts";
  const groups = useSheetGroups();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setKeyboardOverlay("shortcuts");
        else if (open) setKeyboardOverlay(null);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) flushOverlayAction();
      }}
    >
      <DialogContent
        data-keyboard-layer=""
        backdropClassName="backdrop-blur-xs"
        className="top-[12vh] max-w-md bg-(--popover-translucent) p-0 backdrop-blur-xs duration-100"
      >
        <div className="flex h-12 items-center border-b border-border px-4">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </div>
        <div className="max-h-[min(32rem,70vh)] overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map(([label, rows]) => (
            <section key={label}>
              <div className="flex h-7 items-end px-2.5 pb-1 text-xs font-medium text-muted-foreground">
                {label}
              </div>
              {rows.map((row) => (
                <div
                  key={row.id}
                  title={row.idle ? "Not available here" : undefined}
                  className={`flex h-9 items-center gap-2.5 px-2.5 text-[13.5px]/4 transition-opacity duration-150 ${
                    row.idle ? "opacity-50" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <HotkeyKeys hotkey={row.hotkey} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
