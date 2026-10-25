"use client";

import type { ReactNode } from "react";

import { HotkeyKeys, Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/* One footer hint: a label and its keys. A real button too, for anyone
   driving with a mouse — but it never takes focus, so clicking one leaves
   the caret in the search field. */
function Hint({
  label,
  keys,
  onPress,
  disabled = false,
}: {
  label: string;
  keys: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={cn(
        "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-[color,background-color,opacity] duration-150 hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
        !onPress && "cursor-default hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      {label}
      <span className="flex items-center gap-0.5">{keys}</span>
    </button>
  );
}

/* The palette's cheat strip: what the keyboard can do from here. Touch
   devices skip it — there's no keyboard to hint at. */
export function PaletteFooter({
  scoped,
  canChangeType,
  hasActions,
  onClose,
  onBack,
  onActions,
  onCompose,
}: {
  /** Drilled into a folder: Back replaces Change type. */
  scoped: boolean;
  canChangeType: boolean;
  /** The highlighted row has a menu to open. */
  hasActions: boolean;
  onClose: () => void;
  onBack: () => void;
  onActions: () => void;
  onCompose: () => void;
}) {
  return (
    <div className="flex h-11 items-center gap-1 border-t border-border px-2.5 coarse:hidden">
      <Hint label="Close" keys={<Kbd>Esc</Kbd>} onPress={onClose} />
      {scoped ? (
        <Hint label="Back" keys={<Kbd>⌫</Kbd>} onPress={onBack} />
      ) : (
        canChangeType && (
          <Hint
            label="Change type"
            keys={
              <>
                <Kbd>←</Kbd>
                <Kbd>→</Kbd>
              </>
            }
          />
        )
      )}
      <Hint
        label="Actions"
        keys={<HotkeyKeys hotkey="Alt+Enter" className="gap-0.5" />}
        onPress={onActions}
        disabled={!hasActions}
      />
      <span className="flex-1" />
      <Hint label="Compose" keys={<Kbd>Tab</Kbd>} onPress={onCompose} />
    </div>
  );
}
