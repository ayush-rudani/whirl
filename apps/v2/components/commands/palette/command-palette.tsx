"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { IconFolderFilled, IconSearch, IconX } from "@tabler/icons-react";
import { motion } from "motion/react";

import { StoreTabs } from "@/components/integrations/store-tabs";
import { ThreadActionsMenu } from "@/components/thread-actions-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { openArtifactInThread } from "@/lib/artifact-panel";
import { useCoarsePointer } from "@/lib/coarse-pointer";
import {
  PALETTE_TYPES,
  type PaletteItem,
  type PaletteType,
} from "@/lib/commands/palette";
import {
  flushOverlayAction,
  runAfterOverlay,
  setKeyboardOverlay,
  useKeyboardOverlay,
} from "@/lib/commands/overlays";
import { useCommands } from "@/lib/commands/use-commands";
import { usePaletteResults } from "@/lib/commands/use-palette-results";
import { fillComposer } from "@/lib/composer-ingest";
import { getComposerDraft } from "@/lib/composer-draft";
import { useIncognitoState } from "@/lib/incognito";
import { MASK_TEXT } from "@/lib/replay-guard";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view";
import { PaletteFooter } from "./palette-footer";
import { PaletteList } from "./palette-list";

type FolderScope = { id: string; name: string };

const PLACEHOLDERS: Record<PaletteType, string> = {
  all: "Search chats or run a command…",
  chats: "Search chats…",
  folders: "Search folders…",
  artifacts: "Search artifacts…",
  actions: "Search actions…",
};

const NO_MATCH: Record<PaletteType, string> = {
  all: "Nothing matches",
  chats: "No chats match",
  folders: "No folders match",
  artifacts: "No artifacts match",
  actions: "No actions match",
};

const MENU_TRIGGER =
  "flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-black/[0.06] hover:text-foreground data-popup-open:text-foreground dark:hover:bg-white/[0.08]";

/* The ⌘K palette: one instance for the whole shell, opened through
   lib/commands/overlays.ts by the hotkey, the sidebar's Search row and the
   phone's History button alike. Type tabs narrow it to chats, folders,
   artifacts or actions; a folder opens into its own chats; the highlighted
   chat carries its ⋯ menu; Tab hands the query to the composer.

   The body height morphs to fit the results: a ResizeObserver measures the
   (max-h capped) scroller and the motion wrapper animates toward it, so
   shrinking result sets pull the modal up instead of snapping. */
export function CommandPalette() {
  const open = useKeyboardOverlay() === "palette";
  const { enabled: incognito } = useIncognitoState();
  const view = useView();
  const commands = useCommands();
  const coarse = useCoarsePointer();

  const [value, setValue] = useState("");
  const [type, setType] = useState<PaletteType>("all");
  const [scope, setScope] = useState<FolderScope | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  const query = value.trim().toLowerCase();
  const results = usePaletteResults({
    open,
    query,
    type,
    folderId: scope?.id ?? null,
    incognito,
    commands,
  });
  const { sections, itemCount } = results;

  const items = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );
  /* Rows can vanish under the highlight (a chat deleted from its menu, deep
     hits landing and leaving) — clamp rather than point past the end. */
  const index = Math.min(activeIndex, Math.max(itemCount - 1, 0));
  const activeItem: PaletteItem | undefined = items[index];

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) setKeyboardOverlay("palette");
      else if (open) setKeyboardOverlay(null);
    },
    [open],
  );

  /* Every open starts on a clean slate. Reset once the exit has finished
     rather than on open, so the content never visibly swaps under the
     fade — and so a stale query isn't left holding a deep search. */
  const resetAfterClose = () => {
    setValue("");
    setType("all");
    setScope(null);
    setActiveIndex(0);
    setMenuOpen(false);
    setHeight("auto");
  };

  const highlight = (next: number) => {
    setActiveIndex(next);
    setMenuOpen(false);
  };

  const changeQuery = (next: string) => {
    setValue(next);
    setActiveIndex(0);
  };

  const changeType = (next: PaletteType) => {
    setType(next);
    setScope(null);
    highlight(0);
    inputRef.current?.focus();
  };

  const cycleType = (step: 1 | -1) => {
    const at = PALETTE_TYPES.findIndex((option) => option.value === type);
    const next = (at + step + PALETTE_TYPES.length) % PALETTE_TYPES.length;
    changeType(PALETTE_TYPES[next].value);
  };

  const leaveScope = () => {
    setScope(null);
    changeQuery("");
    inputRef.current?.focus();
  };

  /* Tab: the query becomes a new chat's opening line. Anything already
     drafted is kept above it, not thrown away. */
  const compose = () => {
    const text = value.trim();
    const onHome =
      view.threadId === null &&
      !view.settingsOpen &&
      !view.integrationsOpen &&
      !view.historyOpen;
    runAfterOverlay(() => {
      if (!onHome) view.openHome();
      const draft = getComposerDraft().trimEnd();
      fillComposer(draft && text ? `${draft}\n\n${text}` : draft || text);
    });
  };

  const choose = (at: number) => {
    const item = items[at];
    if (!item) return;
    switch (item.kind) {
      case "thread":
        onOpenChange(false);
        view.openThread(item.thread.id);
        return;
      case "folder":
        setScope({ id: item.folder.id, name: item.folder.name });
        changeQuery("");
        return;
      case "artifact": {
        const { artifact } = item;
        runAfterOverlay(() =>
          openArtifactInThread(
            artifact.threadId,
            artifact.kind === "page"
              ? { kind: "html", htmlId: artifact.id }
              : { kind: "document", documentId: artifact.id },
            { currentThreadId: view.threadId, navigate: view.openThread },
          ),
        );
        return;
      }
      case "command":
        item.command.run();
        return;
    }
  };

  const openActions = () => {
    if (activeItem?.kind === "thread") setMenuOpen(true);
  };

  /* Rows are memoized, so they get stable callbacks that read the latest
     handlers through refs. Hover is ignored while a row's menu is open —
     crossing other rows on the way to the menu must not close it. */
  const chooseRef = useRef(choose);
  const menuOpenRef = useRef(menuOpen);
  useLayoutEffect(() => {
    chooseRef.current = choose;
    menuOpenRef.current = menuOpen;
  });
  const onSelect = useCallback((at: number) => chooseRef.current(at), []);
  const onHover = useCallback((at: number) => {
    if (!menuOpenRef.current) setActiveIndex(at);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const input = event.currentTarget;
    const caretAt =
      input.selectionStart === input.selectionEnd ? input.selectionStart : null;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        highlight(Math.min(index + 1, itemCount - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        highlight(Math.max(index - 1, 0));
        return;
      case "Enter":
        event.preventDefault();
        if (event.altKey) openActions();
        else choose(index);
        return;
      case "Tab":
        if (event.shiftKey) return;
        event.preventDefault();
        compose();
        return;
      /* Arrows switch type only once the caret can't move any further, so
         editing the query still works the way it always does. */
      case "ArrowLeft":
      case "ArrowRight": {
        if (scope || incognito || caretAt === null) return;
        if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey)
          return;
        const left = event.key === "ArrowLeft";
        if (left ? caretAt !== 0 : caretAt !== value.length) return;
        event.preventDefault();
        cycleType(left ? -1 : 1);
        return;
      }
      case "Backspace":
        if (scope && value === "") {
          event.preventDefault();
          leaveScope();
        }
        return;
    }
  };

  /* Height morph plumbing. The observer attaches through a callback ref —
     the popup portals in a beat after `open` flips, so an open-keyed
     effect would look before the node exists and never observe. */
  useEffect(() => {
    if (!bodyEl) return;
    const observer = new ResizeObserver(() => {
      /* The kept-mounted popup measures 0 while hidden — swallowing that
         reading keeps the next open from springing up from zero. */
      const next = bodyEl.offsetHeight;
      if (next > 0) setHeight(next);
    });
    observer.observe(bodyEl);
    return () => observer.disconnect();
  }, [bodyEl]);

  /* Keep the keyboard highlight on screen as it walks past the fold. */
  useEffect(() => {
    bodyEl
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [bodyEl, index]);

  const emptyLabel = (() => {
    if (query) return `${NO_MATCH[incognito ? "actions" : type]} "${value.trim()}"`;
    if (scope) return "This folder is empty";
    if (type === "artifacts") {
      if (results.artifactsFailed)
        return "Couldn't load your artifacts right now. Try again in a moment.";
      return results.loadingArtifacts
        ? "Loading…"
        : "No artifacts yet — ask whirl for a doc or a page";
    }
    if (results.loadingChats) return "Loading…";
    if (type === "folders") return "No folders yet — start one from a chat's ⋯ menu";
    return "No chats yet";
  })();

  const placeholder = scope
    ? `Search ${scope.name}…`
    : incognito
      ? "Run a command…"
      : PLACEHOLDERS[type];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (next) return;
        resetAfterClose();
        flushOverlayAction();
      }}
      modal="trap-focus"
    >
      {/* Same frost recipe as the menus, but with the app's standard scrim
          behind it — the frosted dim pulls focus off the page (link-gate
          recipe) while trap-focus above keeps scroll free. The translucent
          popover var is hand-mixed (bg-popover/55 dies in the build) over a
          light backdrop blur. */}
      <DialogContent
        aria-label="Search and commands"
        data-keyboard-layer=""
        keepMounted
        backdropClassName="backdrop-blur-xs"
        initialFocus={inputRef}
        className="top-[16vh] max-w-xl bg-(--popover-translucent) p-0 backdrop-blur-xs duration-100"
      >
        <div className="border-b border-border">
          <div className="flex h-12 items-center gap-2.5 px-4">
            <IconSearch size={16} className="shrink-0 text-muted-foreground" />
            {scope && (
              <button
                type="button"
                onClick={leaveScope}
                aria-label={`Leave ${scope.name}`}
                className="group flex h-6 max-w-[40%] shrink-0 cursor-pointer items-center gap-1 rounded-md bg-accent px-1.5 text-xs font-medium text-accent-foreground"
              >
                <IconFolderFilled size={12} className="shrink-0 text-muted-foreground" />
                <span className={cn("truncate", MASK_TEXT)}>{scope.name}</span>
                <IconX
                  size={11}
                  className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                />
              </button>
            )}
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => changeQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Kbd>Esc</Kbd>
          </div>
          {/* Incognito has nothing to filter — commands are all it shows —
              and a folder scope already says where you are. */}
          {!incognito && !scope && (
            <StoreTabs
              value={type}
              onChange={changeType}
              tabs={PALETTE_TYPES.map((option) => ({
                value: option.value,
                label: option.label,
                count: option.value === "all" ? undefined : results.counts[option.value],
              }))}
              layoutId="palette-type-chip"
              /* Five chips overflow a phone; a gliding fill fights the
                 scroll there (see StoreTabs). */
              glide={!coarse}
              className="overflow-x-auto px-3 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            />
          )}
        </div>

        {/* The container spring is the only animation here — a spring
            keeps momentum across per-keystroke retargets. */}
        <motion.div
          initial={false}
          animate={{ height }}
          transition={{ type: "spring", stiffness: 700, damping: 50, mass: 0.6 }}
          className="overflow-hidden"
        >
          <div
            ref={setBodyEl}
            className="max-h-80 overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <PaletteList
              sections={sections}
              activeIndex={index}
              emptyLabel={emptyLabel}
              showDeepNotice={results.showDeepNotice}
              threadActions={(item) => (
                <ThreadActionsMenu
                  thread={item.thread}
                  folders={results.folders}
                  title={item.title}
                  open={menuOpen}
                  onOpenChange={setMenuOpen}
                  triggerClassName={MENU_TRIGGER}
                  align="end"
                  finalFocus={inputRef}
                />
              )}
              onHover={onHover}
              onSelect={onSelect}
            />
          </div>
        </motion.div>

        <PaletteFooter
          scoped={scope !== null}
          canChangeType={!incognito}
          hasActions={activeItem?.kind === "thread"}
          onClose={() => onOpenChange(false)}
          onBack={leaveScope}
          onActions={openActions}
          onCompose={compose}
        />
      </DialogContent>
    </Dialog>
  );
}
