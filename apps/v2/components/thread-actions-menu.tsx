"use client";

import { useState, type RefObject } from "react";
import {
  IconCheck,
  IconDots,
  IconFolderFilled,
  IconFolderMinus,
  IconFolderPlus,
  IconFolderSymlink,
  IconKey,
  IconLockFilled,
  IconLockOpen,
  IconPencil,
  IconPinFilled,
  IconSparklesFilled,
  IconTrash,
} from "@tabler/icons-react";

import {
  requestLock,
  requestLockRemoval,
  requestPasswordChange,
  requestUnlock,
} from "@/lib/locked/lock-dialogs";
import { forgetKey, useIsThreadOpen } from "@/lib/locked/keyring";
import { useLockActions } from "@/lib/locked/thread-lock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFolderActions, type FolderSummary } from "@/lib/folders";
import { runMutation as run } from "@/lib/toasts";
import { useThreadActions, type ThreadSummary } from "@/lib/threads";
import { useView } from "@/lib/view";
import { RenameDialog } from "./rename-dialog";

/* Same rhythm as the user menu's items. */
const ITEM = "gap-2 px-2 py-1.5";
const ICON = "text-muted-foreground";

/* A chat's ⋯ menu — pin, move to folder, rename, lock, delete — plus the
   rename and new-folder dialogs it opens. One menu wherever a chat shows
   up: the sidebar row and the ⌘K palette both render this, so the two can
   never disagree about what you can do to a chat. The caller owns the open
   state (right-click and ⌥↵ open it too) and styles the trigger. */
export function ThreadActionsMenu({
  thread,
  folders,
  title,
  open,
  onOpenChange,
  triggerClassName,
  align = "start",
  finalFocus,
}: {
  thread: ThreadSummary;
  folders: FolderSummary[];
  /** The name the row is showing — a locked chat's opened title when this
   *  tab has its key. */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName: string;
  align?: "start" | "center" | "end";
  /** Where focus lands when the menu closes. The palette sends it back to
   *  its search field so typing carries on. */
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  const threadActions = useThreadActions();
  const lockActions = useLockActions();
  const folderActions = useFolderActions();
  const { threadId, openHome } = useView();
  const [renameOpen, setRenameOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const isPinned = thread.pinnedAt !== null;
  const isActive = threadId === thread.id;
  const isGeneratingTitle = thread.titleStatus === "generating";
  const isUnlocked = useIsThreadOpen(thread.locked ? thread.id : null);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          aria-label={`Actions for ${title}`}
          className={triggerClassName}
        >
          <IconDots size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          sideOffset={4}
          finalFocus={finalFocus}
          className="w-48 p-1"
        >
          <DropdownMenuItem
            className={ITEM}
            onClick={() => run(threadActions.setPinned(thread.id, !isPinned))}
          >
            <IconPinFilled size={15} className={ICON} />
            {isPinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={ITEM}>
              <IconFolderSymlink size={15} className={ICON} />
              Move to folder
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52 p-1">
              {folders.map((folder) => (
                <DropdownMenuItem
                  key={folder.id}
                  className={ITEM}
                  onClick={() =>
                    run(
                      threadActions.setFolder(
                        thread.id,
                        thread.folderId === folder.id ? null : folder.id,
                      ),
                    )
                  }
                >
                  <IconFolderFilled size={15} className={ICON} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  {thread.folderId === folder.id && (
                    <IconCheck size={15} className="shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              {thread.folderId && (
                <DropdownMenuItem
                  className={ITEM}
                  onClick={() => run(threadActions.setFolder(thread.id, null))}
                >
                  <IconFolderMinus size={15} className={ICON} />
                  Remove from folder
                </DropdownMenuItem>
              )}
              {folders.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className={ITEM}
                onClick={() => setNewFolderOpen(true)}
              >
                <IconFolderPlus size={15} className={ICON} />
                New folder…
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            className={ITEM}
            /* A locked thread's name is sealed with everything else, so it
               can only be changed by a tab holding the key. */
            disabled={thread.locked && !isUnlocked}
            onClick={() => setRenameOpen(true)}
          >
            <IconPencil size={15} className={ICON} />
            Rename
          </DropdownMenuItem>

          {/* Same shimmer the thread got when it was first named, just asked
              for on purpose — and off the whole conversation this time. No
              such thing in a locked chat: the model can't read it. */}
          {!thread.locked && (
            <DropdownMenuItem
              className={ITEM}
              disabled={isGeneratingTitle}
              onClick={() => run(threadActions.regenerateTitle(thread.id))}
            >
              <IconSparklesFilled size={15} className={ICON} />
              Regenerate title
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {thread.locked ? (
            <>
              {isUnlocked ? (
                <DropdownMenuItem
                  className={ITEM}
                  onClick={() => forgetKey(thread.id)}
                >
                  <IconLockFilled size={15} className={ICON} />
                  Lock now
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className={ITEM}
                  onClick={() => requestUnlock(thread.id)}
                >
                  <IconLockOpen size={15} className={ICON} />
                  Unlock
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className={ITEM}
                disabled={!isUnlocked}
                onClick={() => requestPasswordChange(thread.id)}
              >
                <IconKey size={15} className={ICON} />
                Change password
              </DropdownMenuItem>
              <DropdownMenuItem
                className={ITEM}
                disabled={!isUnlocked}
                onClick={() => requestLockRemoval(thread.id)}
              >
                <IconLockOpen size={15} className={ICON} />
                Remove lock
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              className={ITEM}
              onClick={() => requestLock(thread.id)}
            >
              <IconLockFilled size={15} className={ICON} />
              Lock chat
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className={ITEM}
            variant="destructive"
            onClick={() => {
              /* Don't leave the view staring at a thread that's ticking
                 toward deletion. */
              if (isActive) openHome();
              /* Nothing left for the key to open. */
              if (thread.locked) forgetKey(thread.id);
              threadActions.requestDelete(thread);
            }}
          >
            <IconTrash size={15} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename thread"
        placeholder="Thread title"
        initialValue={title}
        /* A locked thread's name is sealed like its messages, so it takes
           the lock path — the plain rename would write it in the clear. */
        onSubmit={(next) =>
          run(
            thread.locked
              ? lockActions.rename(thread.id, next)
              : threadActions.rename(thread.id, next),
          )
        }
      />
      <RenameDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        placeholder="Folder name"
        submitLabel="Create"
        onSubmit={(name) =>
          run(
            folderActions
              .create(name)
              .then((folderId) => threadActions.setFolder(thread.id, folderId)),
          )
        }
      />
    </>
  );
}
