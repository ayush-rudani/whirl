"use client";

import type { Hotkey } from "@tanstack/react-hotkeys";

import { HotkeyKeys } from "@/components/ui/kbd";
import type { Command } from "@/lib/commands/use-commands";

/* One action in the palette. Same h-9 row, highlight and type scale as the
   chat results beneath it, so the two read as one list — with the command's
   shortcut tucked on the right for anyone learning the keys as they go.
   Not memoized like the chat rows: there are only a handful, and the
   registry hands out fresh command objects every render anyway. */
export function CommandRow({
  command,
  hotkey,
  index,
  active,
  onHover,
  onSelect,
}: {
  command: Command;
  hotkey: Hotkey | null;
  index: number;
  active: boolean;
  onHover: (index: number) => void;
  onSelect: (command: Command) => void;
}) {
  const Icon = command.icon;
  return (
    <button
      type="button"
      data-index={index}
      onClick={() => onSelect(command)}
      onMouseEnter={() => onHover(index)}
      className={`flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13.5px]/4 ${
        active ? "bg-accent text-accent-foreground" : ""
      }`}
    >
      <Icon size={15} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">{command.label}</span>
      {hotkey && <HotkeyKeys hotkey={hotkey} />}
    </button>
  );
}
