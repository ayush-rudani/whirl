"use client";

import { useMemo } from "react";
import {
  IconGhost2Filled,
  IconKeyboardFilled,
  IconPuzzleFilled,
  IconSearch,
  IconSettingsFilled,
  IconSparklesFilled,
  IconSquareRoundedPlusFilled,
  type TablerIcon,
} from "@tabler/icons-react";

import {
  requestIncognitoExit,
  useIncognitoActions,
  useIncognitoState,
} from "@/lib/incognito";
import { useView } from "@/lib/view";
import type { CommandId } from "./hotkeys";
import { requestModelPicker } from "./model-picker";
import { runAfterOverlay, toggleKeyboardOverlay } from "./overlays";

/* The app's command registry: what each command is called, what it looks
   like, when it makes sense, and what it does. The ⌘K palette lists these,
   the hotkey layer binds them (keys live in ./hotkeys.ts under the same
   ids), and the shortcut sheet prints them. One list, three surfaces. */

export type Command = {
  id: CommandId;
  label: string;
  icon: TablerIcon;
  /** Extra words the palette should answer to. */
  keywords: readonly string[];
  /** Whether it can run right now. Unavailable commands drop out of the
   *  palette and their hotkeys go quiet. */
  available: boolean;
  /** Listed as a palette row. The palette's own opener isn't. */
  inPalette: boolean;
  run: () => void;
};

export function useCommands(): Command[] {
  const {
    settingsOpen,
    integrationsOpen,
    historyOpen,
    threadId,
    openHome,
    openSettings,
    openIntegrations,
  } = useView();
  const incognito = useIncognitoState();
  const { enter: enterIncognito } = useIncognitoActions();

  /* The chat face is what's showing — the composer (and its model picker)
     are on screen, not slid away behind settings or the store. */
  const onChatFace = !settingsOpen && !integrationsOpen && !historyOpen;

  /* Memoized so the palette's matching (which scores every chat against
     the query) doesn't redo itself on every hover. */
  return useMemo(
    (): Command[] => [
      {
        id: "palette.open",
        label: "Search & commands",
        icon: IconSearch,
        keywords: [],
        available: true,
        inPalette: false,
        run: () => toggleKeyboardOverlay("palette"),
      },
      {
        id: "chat.new",
        label: "New chat",
        icon: IconSquareRoundedPlusFilled,
        keywords: ["start", "compose", "home", "fresh"],
        /* An incognito chat is already the blank slate — and hopping home
           from it would strand the ephemeral thread. */
        available: !incognito.enabled,
        inPalette: true,
        run: () => runAfterOverlay(openHome),
      },
      {
        id: "model.switch",
        label: "Switch model",
        icon: IconSparklesFilled,
        keywords: ["model", "change", "llm", "claude", "gpt", "gemini"],
        available: onChatFace,
        inPalette: true,
        run: () => runAfterOverlay(requestModelPicker),
      },
      {
        id: "incognito.toggle",
        label: incognito.enabled ? "Leave incognito" : "Go incognito",
        icon: IconGhost2Filled,
        keywords: ["incognito", "private", "temporary", "ghost", "off the record"],
        /* Same rule as the ghost button: it lives on home (and through an
           incognito chat), never over a saved thread. */
        available: incognito.enabled || (onChatFace && threadId === null),
        inPalette: true,
        run: () =>
          runAfterOverlay(incognito.enabled ? requestIncognitoExit : enterIncognito),
      },
      {
        id: "settings.open",
        label: "Open settings",
        icon: IconSettingsFilled,
        keywords: ["preferences", "account", "config", "theme"],
        available: !settingsOpen,
        inPalette: true,
        run: () => runAfterOverlay(() => openSettings()),
      },
      {
        id: "integrations.open",
        label: "Browse integrations",
        icon: IconPuzzleFilled,
        keywords: ["apps", "connect", "tools", "mcp", "store"],
        available: !integrationsOpen,
        inPalette: true,
        run: () => runAfterOverlay(openIntegrations),
      },
      {
        id: "shortcuts.open",
        label: "Keyboard shortcuts",
        icon: IconKeyboardFilled,
        keywords: ["hotkeys", "keys", "help", "cheat sheet"],
        available: true,
        inPalette: true,
        run: () => toggleKeyboardOverlay("shortcuts"),
      },
    ],
    [
      onChatFace,
      incognito.enabled,
      threadId,
      settingsOpen,
      integrationsOpen,
      openHome,
      openSettings,
      openIntegrations,
      enterIncognito,
    ],
  );
}
