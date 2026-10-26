"use client";

import { useEffect } from "react";
import { IconGhost2, IconGhost2Filled } from "@tabler/icons-react";
import { useConvexAuth } from "convex/react";
import { useMutation } from "convex/react";
import { api } from "@whirl/backend/convex/_generated/api";
import { AnimatePresence, motion } from "motion/react";

import {
  requestIncognitoExit,
  setIncognitoExitConfirm,
  useIncognitoActions,
  useIncognitoExitConfirm,
  useIncognitoState,
} from "@/lib/incognito";
import { pinRasterPath } from "@/lib/motion";
import { ConfirmDialog } from "./confirm-dialog";

/* The ghost button floating in the home face's top-right corner — the
   same perch the thread toolbar uses once a thread opens, so the corner
   always holds exactly one cluster. Icon only: the ghost says it all.
   Off, it wears the toolbar pills' translucent well; on, it fills with
   primary ink so the mode reads at a glance. */

const BUTTON_BASE =
  "flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors duration-150";

const IDLE_CLASS = `${BUTTON_BASE} bg-(--well-translucent) text-muted-foreground shadow-[inset_0_0_0_1px_var(--well-outline),inset_0_1px_0_0_var(--well-highlight)] backdrop-blur-xl hover:text-foreground`;

const ACTIVE_CLASS = `${BUTTON_BASE} bg-primary text-primary-foreground hover:bg-primary-hover`;

export function IncognitoToggle() {
  const { enabled } = useIncognitoState();
  const { enter } = useIncognitoActions();

  return (
    <motion.button
      type="button"
      onClick={() => (enabled ? requestIncognitoExit() : enter())}
      whileTap={{ scale: 0.96 }}
      aria-pressed={enabled}
      aria-label={enabled ? "Leave incognito mode" : "Go incognito"}
      title={enabled ? "Leave incognito" : "Go incognito"}
      className={enabled ? ACTIVE_CLASS : IDLE_CLASS}
    >
      {/* Crossfade in place — both ghosts share the fixed box, and
          waiting out the exit would make the toggle feel laggy. */}
      <span className="relative size-[18px]">
        <AnimatePresence initial={false}>
          <motion.span
            key={enabled ? "on" : "off"}
            initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, rotate: 12 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
            transformTemplate={pinRasterPath}
            className="absolute inset-0 flex items-center justify-center"
          >
            {enabled ? (
              <IconGhost2Filled size={18} />
            ) : (
              <IconGhost2 size={18} stroke={2} />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );
}

/* The one "Leave incognito?" confirm, mounted once by the shell. The ghost
   button, the palette and the hotkey all ask for it through
   requestIncognitoExit, which only raises it when there's a chat to lose. */
export function IncognitoExitConfirm() {
  const open = useIncognitoExitConfirm();
  const { leave } = useIncognitoActions();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setIncognitoExitConfirm}
      title="Leave incognito?"
      message="This chat was never saved — leaving deletes it for good."
      confirmLabel="Leave & delete"
      destructive
      onConfirm={leave}
    />
  );
}

/* Belt and braces: a hard refresh mid-incognito drops the store but not
   the flagged thread row. This sweeps all of the user's incognito threads
   once auth lands, so nothing ephemeral survives to a second session. */
export function IncognitoJanitor() {
  const { isAuthenticated } = useConvexAuth();
  const purge = useMutation(api.threads.purgeIncognito);
  useEffect(() => {
    if (!isAuthenticated) return;
    void purge({}).catch(() => {
      /* Offline or flaky — the next load tries again. */
    });
  }, [isAuthenticated, purge]);
  return null;
}
