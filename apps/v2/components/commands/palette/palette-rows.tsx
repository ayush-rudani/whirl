"use client";

import { memo, type ReactNode } from "react";
import {
  IconAppWindowFilled,
  IconCornerDownLeft,
  IconFileCodeFilled,
  IconFileTextFilled,
  IconFolderFilled,
  IconLoader2,
  IconLockFilled,
  IconMessageCircleFilled,
  type TablerIcon,
} from "@tabler/icons-react";
import type { Hotkey } from "@tanstack/react-hotkeys";

import { HotkeyKeys } from "@/components/ui/kbd";
import type { ArtifactSummary, PaletteItem } from "@/lib/commands/palette";
import { MASK_TEXT } from "@/lib/replay-guard";
import { cn } from "@/lib/utils";

/* The palette's rows, one per kind of result. They share one frame — h-9,
   the same highlight, the same type scale — so a list mixing chats,
   folders, artifacts and actions still reads as one list. Memoized so
   hover and arrow-key moves only re-render the two rows whose highlight
   changed; content-visibility lets the browser skip rows below the fold
   (rows are exactly h-9, so the 36px intrinsic size keeps the scrollbar
   honest). */

const ROW =
  "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13.5px]/4 [contain-intrinsic-size:auto_36px] [content-visibility:auto]";
const ACTIVE = "bg-accent text-accent-foreground";
const ICON = "shrink-0 text-muted-foreground";
const ASIDE = "shrink-0 text-xs text-muted-foreground";

type RowProps = {
  index: number;
  active: boolean;
  onHover: (index: number) => void;
  onSelect: (index: number) => void;
};

/** The "Enter opens this" glyph the highlighted row wears. */
function EnterHint() {
  return (
    <IconCornerDownLeft
      size={14}
      aria-hidden
      className="shrink-0 text-muted-foreground"
    />
  );
}

function RowFrame({
  index,
  active,
  onHover,
  onSelect,
  icon: Icon,
  children,
  aside,
}: RowProps & {
  icon: TablerIcon;
  children: ReactNode;
  /** Right-edge detail: a folder name, a count, a shortcut. */
  aside?: ReactNode;
}) {
  return (
    <button
      type="button"
      data-index={index}
      onClick={() => onSelect(index)}
      onMouseEnter={() => onHover(index)}
      className={cn(ROW, active && ACTIVE)}
    >
      <Icon size={15} className={ICON} />
      {children}
      {aside}
    </button>
  );
}

export const ThreadResultRow = memo(function ThreadResultRow({
  item,
  actions,
  ...row
}: RowProps & {
  item: Extract<PaletteItem, { kind: "thread" }>;
  /** The highlighted chat's ⋯ menu. Only that row gets one — it's an
   *  overlay sibling of the row button (nesting buttons is invalid HTML),
   *  and mounting a menu per row would be a hundred menus. */
  actions?: ReactNode;
}) {
  const { thread, title, folderName, excerpt } = item;
  return (
    <div className="relative">
      <RowFrame
        {...row}
        icon={thread.locked ? IconLockFilled : IconMessageCircleFilled}
        aside={
          /* The menu cluster takes the right edge on the highlighted row;
             the folder name steps aside for it. */
          actions ? (
            <span aria-hidden className="w-14 shrink-0" />
          ) : folderName && excerpt === undefined ? (
            <span className={cn(ASIDE, MASK_TEXT)}>{folderName}</span>
          ) : null
        }
      >
        {excerpt !== undefined ? (
          <>
            <span className={cn("max-w-[50%] shrink-0 truncate text-left", MASK_TEXT)}>
              {title}
            </span>
            {/* Lifted verbatim out of a message body. */}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-left text-xs text-muted-foreground",
                MASK_TEXT,
              )}
            >
              {excerpt}
            </span>
          </>
        ) : (
          <span className={cn("min-w-0 flex-1 truncate text-left", MASK_TEXT)}>
            {title}
          </span>
        )}
      </RowFrame>
      {actions && (
        <div className="absolute inset-y-0 right-2.5 flex items-center gap-1.5">
          {actions}
          <EnterHint />
        </div>
      )}
    </div>
  );
});

export const FolderResultRow = memo(function FolderResultRow({
  item,
  ...row
}: RowProps & { item: Extract<PaletteItem, { kind: "folder" }> }) {
  const { folder, chatCount } = item;
  return (
    <RowFrame
      {...row}
      icon={IconFolderFilled}
      aside={
        row.active ? (
          <EnterHint />
        ) : (
          <span className={ASIDE}>
            {chatCount === 1 ? "1 chat" : `${chatCount} chats`}
          </span>
        )
      }
    >
      <span className={cn("min-w-0 flex-1 truncate text-left", MASK_TEXT)}>
        {folder.name}
      </span>
    </RowFrame>
  );
});

const ARTIFACT_ICONS: Record<ArtifactSummary["kind"], TablerIcon> = {
  document: IconFileTextFilled,
  code: IconFileCodeFilled,
  page: IconAppWindowFilled,
};

export const ArtifactResultRow = memo(function ArtifactResultRow({
  item,
  ...row
}: RowProps & { item: Extract<PaletteItem, { kind: "artifact" }> }) {
  const { artifact, threadTitle } = item;
  return (
    <RowFrame
      {...row}
      icon={ARTIFACT_ICONS[artifact.kind]}
      aside={
        row.active ? (
          <EnterHint />
        ) : (
          /* Which chat it lives in — where Enter will take you. */
          <span className={cn(ASIDE, "max-w-[40%] truncate", MASK_TEXT)}>
            {threadTitle}
          </span>
        )
      }
    >
      <span className={cn("min-w-0 flex-1 truncate text-left", MASK_TEXT)}>
        {artifact.title}
      </span>
    </RowFrame>
  );
});

/* Commands wear their shortcut instead of the Enter glyph — anyone
   reaching for the palette to run one is exactly who should learn the key. */
export const CommandResultRow = memo(function CommandResultRow({
  item,
  hotkey,
  ...row
}: RowProps & {
  item: Extract<PaletteItem, { kind: "command" }>;
  hotkey: Hotkey | null;
}) {
  return (
    <RowFrame
      {...row}
      icon={item.command.icon}
      aside={
        hotkey ? (
          <HotkeyKeys hotkey={hotkey} />
        ) : row.active ? (
          <EnterHint />
        ) : null
      }
    >
      <span className="min-w-0 flex-1 truncate text-left">
        {item.command.label}
      </span>
    </RowFrame>
  );
});

/** The full-text pass's progress line. */
export function SearchingDeeper() {
  return (
    <>
      <IconLoader2 size={15} className="shrink-0 animate-spin text-muted-foreground" />
      <span className="text-shimmer text-[13.5px]/4">Searching deeper…</span>
    </>
  );
}
