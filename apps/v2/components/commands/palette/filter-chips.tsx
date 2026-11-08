"use client";

import { IconX } from "@tabler/icons-react";

import {
  FILTER_DEFS,
  type FilterKey,
  type PaletteFilter,
} from "@/lib/commands/palette-filters";
import { MASK_TEXT } from "@/lib/replay-guard";
import { cn } from "@/lib/utils";

/* The filters in force, as chips ahead of the search field: what each one
   is set to, and an × to drop it. Backspace in an empty field drops the
   last one too (handled by the palette). Chips truncate rather than push
   the field off the row — five is the most there can be. */
export function FilterChips({
  filters,
  onRemove,
}: {
  filters: readonly PaletteFilter[];
  onRemove: (key: FilterKey) => void;
}) {
  if (filters.length === 0) return null;
  return (
    <div className="flex min-w-0 shrink items-center gap-1">
      {filters.map((filter) => {
        const { icon: Icon, label } = FILTER_DEFS[filter.key];
        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => onRemove(filter.key)}
            /* Keep the caret in the field — the chip is a mouse shortcut,
               not a stop in the tab order. */
            onMouseDown={(event) => event.preventDefault()}
            tabIndex={-1}
            aria-label={`Remove ${label.toLowerCase()} filter: ${filter.label}`}
            title={`${label}: ${filter.label}`}
            className="group flex h-6 max-w-32 min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-accent px-1.5 text-xs font-medium text-accent-foreground"
          >
            <Icon size={12} className="shrink-0 text-muted-foreground" />
            <span
              className={cn(
                "min-w-0 truncate",
                filter.key === "folder" && MASK_TEXT,
              )}
            >
              {filter.label}
            </span>
            <IconX
              size={11}
              className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            />
          </button>
        );
      })}
    </div>
  );
}
