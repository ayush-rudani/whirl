"use client";

import type { ReactNode } from "react";
import { useAppHotkeys } from "@tanstack/react-hotkeys";
import { motion } from "motion/react";

import type { PaletteItem, PaletteSection } from "@/lib/commands/palette";
import { pinRasterPath } from "@/lib/motion";
import {
  ArtifactResultRow,
  CommandResultRow,
  FolderResultRow,
  SearchingDeeper,
  ThreadResultRow,
} from "./palette-rows";

/* Entrance for the deep-search area: a soft rise-and-fade on mount only.
   Exits stay instant — this stuff unmounts on every keystroke, and
   lingering fade-outs there read as flicker. */
const POP_IN = {
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.22, 0.61, 0.36, 1] as const },
  transformTemplate: pinRasterPath,
};

const HEADING =
  "flex h-7 items-end px-2.5 pb-1 text-xs font-medium text-muted-foreground";

/* The palette's body: every section with its heading, the rows in
   keyboard order, and the empty / "searching deeper" states. Content swaps
   instantly between keystrokes (palette-style; per-item fades read as
   flicker) — the container's height spring upstream is the only motion. */
export function PaletteList({
  sections,
  activeIndex,
  emptyLabel,
  showDeepNotice,
  threadActions,
  onHover,
  onSelect,
}: {
  sections: PaletteSection[];
  activeIndex: number;
  /** What to say when there are no rows at all. */
  emptyLabel: string;
  showDeepNotice: boolean;
  /** The ⋯ menu for the highlighted chat row. */
  threadActions: (item: Extract<PaletteItem, { kind: "thread" }>) => ReactNode;
  onHover: (index: number) => void;
  onSelect: (index: number) => void;
}) {
  const appHotkeys = useAppHotkeys();
  const empty = sections.length === 0;

  const renderItem = (item: PaletteItem, index: number) => {
    const row = { index, active: index === activeIndex, onHover, onSelect };
    switch (item.kind) {
      case "thread":
        return (
          <ThreadResultRow
            key={item.key}
            item={item}
            actions={row.active ? threadActions(item) : undefined}
            {...row}
          />
        );
      case "folder":
        return <FolderResultRow key={item.key} item={item} {...row} />;
      case "artifact":
        return <ArtifactResultRow key={item.key} item={item} {...row} />;
      case "command":
        return (
          <CommandResultRow
            key={item.key}
            item={item}
            hotkey={appHotkeys[item.command.id].hotkey}
            {...row}
          />
        );
    }
  };

  return (
    <>
      {empty && !showDeepNotice ? (
        <div className="flex h-16 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        sections.map((section) => {
          const rows = section.items.map((item, offset) =>
            renderItem(item, section.startIndex + offset),
          );
          /* Deep results (threads whose messages, not titles, matched)
             arrive late, so they rise in rather than pop. */
          return section.key === "deep" ? (
            <motion.section key={section.key} {...POP_IN}>
              <div className={HEADING}>{section.label}</div>
              {rows}
            </motion.section>
          ) : (
            <section key={section.key}>
              <div className={HEADING}>{section.label}</div>
              {rows}
            </section>
          );
        })
      )}

      {/* One persistent notice for the whole deep lifecycle. It restyles
          between the centered empty slot and a row under the results —
          same element either way, so the shimmer sweeps on uninterrupted
          instead of resetting on remount. */}
      {showDeepNotice && (
        <motion.div
          {...POP_IN}
          className={
            empty
              ? "flex h-16 items-center justify-center gap-2.5"
              : "flex h-9 items-center gap-2.5 px-2.5"
          }
        >
          <SearchingDeeper />
        </motion.div>
      )}
    </>
  );
}
