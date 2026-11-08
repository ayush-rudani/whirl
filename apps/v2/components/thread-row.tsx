"use client";

import { memo, useState } from "react";
import { useConvex } from "convex/react";
import {
  IconCircleCheckFilled,
  IconGitBranch,
  IconLoader2,
  IconLockFilled,
  IconPinFilled,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";

import { useIsThreadOpen } from "@/lib/locked/keyring";
import { useOpenedTitle } from "@/lib/locked/thread-lock";
import { pinRasterPath } from "@/lib/motion";
import {
  beginThreadDrag,
  endThreadDrag,
  THREAD_DRAG_TYPE,
  type FolderSummary,
} from "@/lib/folders";
import type { ThreadSummary } from "@/lib/threads";
import { cancelHoverWarm, warmThreadOnHover } from "@/lib/thread-warm";
import { useView } from "@/lib/view";
import { RowPill } from "./row-pill";
import { ThreadActionsMenu } from "./thread-actions-menu";
import { ThreadTitle } from "./thread-title";

/* One chat in the sidebar: title, a pin glyph when pinned, and a ⋯ menu
   that fades in on hover — always visible on touch, where hover doesn't
   exist (pin / move to folder / rename / delete). The trigger overlays
   the row button — real nesting would be invalid HTML.

   Memoized field by field. The listing hands back brand-new thread objects
   on every push, so a plain memo would never bite; these are the fields the
   row actually draws, and comparing them keeps a hundred untouched rows out
   of every re-render. */
export const ThreadRow = memo(function ThreadRow({
  thread,
  folders,
  running = false,
  finished = false,
  onNavigate,
}: {
  thread: ThreadSummary;
  folders: FolderSummary[];
  /** A turn is in flight in this thread — the spinner outranks the pin. */
  running?: boolean;
  /** The reply landed while you were elsewhere — a tick where the
   *  spinner was, until the thread is opened. */
  finished?: boolean;
  onNavigate?: () => void;
}) {
  const convex = useConvex();
  const { threadId, openThread } = useView();
  const [menuOpen, setMenuOpen] = useState(false);

  const isPinned = thread.pinnedAt !== null;
  const isActive = threadId === thread.id;
  const isGeneratingTitle = thread.titleStatus === "generating";
  /* A locked row draws the placeholder title the server holds until this tab
     has the key — then it quietly becomes the real name. */
  const isUnlocked = useIsThreadOpen(thread.locked ? thread.id : null);
  const openedTitle = useOpenedTitle(thread.id, thread.lockedTitle, isUnlocked);
  const title = openedTitle ?? thread.title;

  return (
    /* group/row lives on the wrapper so hovering the ⋯ trigger (an overlay
       sibling of the row button) still lights the pill. */
    <div
      className="group/row group/thread relative"
      /* Resting on a row reads its transcript into the cache, so the click
         after it opens a painted thread instead of a spinner. The
         prefetcher only reaches the newest twenty; this covers the rest. */
      onPointerEnter={() => {
        /* Nothing to warm on a locked row — its transcript is opened from
           memory, never read out of the cache. */
        if (thread.locked) return;
        warmThreadOnHover(convex, thread.id, thread.updatedAt);
      }}
      onPointerLeave={cancelHoverWarm}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(THREAD_DRAG_TYPE, thread.id);
        event.dataTransfer.effectAllowed = "move";
        beginThreadDrag({ threadId: thread.id, folderId: thread.folderId });
      }}
      onDragEnd={endThreadDrag}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <button
        type="button"
        onClick={() => {
          openThread(thread.id);
          onNavigate?.();
        }}
        className="relative flex h-8 w-full cursor-pointer items-center rounded-lg pr-8 pl-2.5 text-[13.5px]/4 font-medium text-foreground-soft before:absolute before:-inset-x-3 before:-inset-y-px"
      >
        <RowPill
          className={`group-has-data-popup-open/thread:bg-accent ${
            isActive ? "bg-accent" : ""
          }`}
        />
        <span className="relative flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {/* Locked outranks branched: it's the thing you need to know about
              the row before you click it. */}
          {thread.locked ? (
            <IconLockFilled
              size={12}
              aria-label={isUnlocked ? "Locked chat, open" : "Locked chat"}
              className="shrink-0"
            />
          ) : thread.branchedFromThreadId ? (
            <IconGitBranch
              size={13}
              aria-label="Branched thread"
              className="shrink-0"
            />
          ) : null}
          <span className="min-w-0 flex-1">
            <ThreadTitle title={title} generating={isGeneratingTitle} />
          </span>
        </span>
      </button>

      {/* Right-edge status glyph: a spinner while the thread is generating,
          then a tick if it finished while you were elsewhere (both outrank
          the pin), fading away on hover as the ⋯ fades in. mode="wait" lets
          one glyph scale out before the next scales in — the spinner
          hands off to the tick in place. Hover-hide opacities are
          !important — motion owns the inline opacity, so plain utilities
          would lose to it. */}
      <AnimatePresence mode="wait" initial={false}>
        {running ? (
          <motion.span
            key="running"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            transformTemplate={pinRasterPath}
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 transition-opacity duration-150 group-hover/thread:opacity-0! group-has-data-popup-open/thread:opacity-0! coarse:opacity-0!"
          >
            <IconLoader2
              size={14}
              className="animate-spin text-foreground-soft"
            />
          </motion.span>
        ) : finished ? (
          <motion.span
            key="finished"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            transformTemplate={pinRasterPath}
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 transition-opacity duration-150 group-hover/thread:opacity-0! group-has-data-popup-open/thread:opacity-0! coarse:opacity-0!"
          >
            <IconCircleCheckFilled
              size={14}
              aria-label="Reply finished"
              className="text-foreground-soft"
            />
          </motion.span>
        ) : isPinned ? (
          <motion.span
            key="pin"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            transformTemplate={pinRasterPath}
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 transition-opacity duration-150 group-hover/thread:opacity-0! group-has-data-popup-open/thread:opacity-0! coarse:opacity-0!"
          >
            <IconPinFilled
              size={12}
              className="rotate-45 text-foreground-soft"
            />
          </motion.span>
        ) : null}
      </AnimatePresence>

      <ThreadActionsMenu
        thread={thread}
        folders={folders}
        title={title}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        triggerClassName="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-foreground-soft opacity-0 transition-opacity duration-150 group-hover/thread:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 coarse:opacity-100"
      />
    </div>
  );
},
(previous, next) =>
  previous.running === next.running &&
  previous.finished === next.finished &&
  previous.folders === next.folders &&
  previous.onNavigate === next.onNavigate &&
  previous.thread.id === next.thread.id &&
  previous.thread.updatedAt === next.thread.updatedAt &&
  previous.thread.title === next.thread.title &&
  previous.thread.titleStatus === next.thread.titleStatus &&
  previous.thread.pinnedAt === next.thread.pinnedAt &&
  previous.thread.folderId === next.thread.folderId &&
  previous.thread.locked === next.thread.locked &&
  previous.thread.lockedTitle === next.thread.lockedTitle &&
  previous.thread.branchedFromThreadId === next.thread.branchedFromThreadId);
