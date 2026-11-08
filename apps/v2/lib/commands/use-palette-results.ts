"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useConvexAuth, useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@whirl/backend/convex/_generated/api";

import { useFolders, type FolderSummary } from "@/lib/folders";
import { useOpenedTitles } from "@/lib/locked/thread-lock";
import { useComposerModels } from "@/lib/model-catalog";
import { useThreads, type ThreadSummary } from "@/lib/threads";
import type { ArtifactSummary, PaletteSection, PaletteType } from "./palette";
import {
  artifactPasses,
  filterKeySections,
  filterOptions,
  filterValueSections,
  threadPasses,
  withFilter,
  type FilterMenu,
  type PaletteFilter,
} from "./palette-filters";
import {
  actionSections,
  allSections,
  artifactSections,
  chatSections,
  filteredSections,
  folderSections,
  matchPalette,
  recentSections,
  type PaletteSources,
} from "./palette-sections";
import type { Command } from "./use-commands";

/* How much of the library the first render mounts. The scroller folds at
   max-h-80 (~9 rows), so this covers the fold with headroom — the rest
   streams in through a transition as soon as threads land. */
const FIRST_PAINT_ROWS = 30;

/* How long the user has to sit still before the deep (full-text) search
   kicks in behind the instant title filter. */
const DEEP_SEARCH_DELAY_MS = 450;

/* How long after closing before the palette lets go of its data — past the
   dialog's ~100ms exit, so the results never visibly swap mid-fade. */
export const CLOSE_RESET_DELAY_MS = 200;

const EMPTY_FOLDERS: FolderSummary[] = [];

type DeepHit = FunctionReturnType<typeof api.historySearch.deepSearch>[number];

/* Stand-ins for a failed fetch — module constants, so the memos downstream
   don't see a "new" empty list on every render. */
const NO_DEEP_HITS: DeepHit[] = [];
const NO_ARTIFACTS: ArtifactSummary[] = [];
const NO_COMMANDS: Command[] = [];

export type PaletteResults = {
  sections: PaletteSection[];
  itemCount: number;
  /** Per-tab counts for the chips, while a query or a filter narrows
   *  things. */
  counts: Partial<Record<PaletteType, number>>;
  /** The chat list itself hasn't arrived yet. */
  loadingChats: boolean;
  /** The artifact list hasn't arrived yet. */
  loadingArtifacts: boolean;
  /** The artifact list couldn't be fetched (an error, or a backend that
   *  doesn't have the query yet). */
  artifactsFailed: boolean;
  /** A full-text pass is owed or in flight for the current query. */
  showDeepNotice: boolean;
  folders: FolderSummary[];
};

/* Everything the palette shows, for one query on one tab under the filters
   in force — or the filter picker itself while one is being chosen. Owns
   the subscriptions and their timing; the section builders decide the
   layout.

   Long-session care, since the palette stays mounted for the life of the
   tab: the full library, the deep query and the artifact subscription all
   let go once a close settles, so nothing here keeps reconciling or
   re-running against Convex pushes while the palette sits closed. */
export function usePaletteResults({
  open,
  query,
  type,
  filters,
  filterMenu,
  incognito,
  commands,
}: {
  open: boolean;
  /** Trimmed and lowercased. */
  query: string;
  type: PaletteType;
  filters: readonly PaletteFilter[];
  /** Set while a filter is being picked; the list shows the picker. */
  filterMenu: FilterMenu | null;
  incognito: boolean;
  commands: Command[];
}): PaletteResults {
  const { isAuthenticated } = useConvexAuth();
  const threads = useThreads(isAuthenticated);
  /* Real names for the locked chats this tab has open — used for matching
     and for the row label, so the two can't disagree. */
  const openedTitles = useOpenedTitles(threads);
  const folders = useFolders(isAuthenticated) ?? EMPTY_FOLDERS;
  const models = useComposerModels();

  /* Incognito keeps the commands but drops the history — that's exactly
     what the mode isn't, and a hop to a saved thread would torch the
     ephemeral chat. */
  const effectiveType: PaletteType = incognito ? "actions" : type;

  /* The list is kept mounted (hidden) behind the dialog, so the
     above-the-fold slice renders off the interaction path and opening is
     just the entrance animation. But only that slice: the full library
     streams in through a transition per open and lets go again after the
     close settles — hidden DOM still reconciles on every thread-list push. */
  const [fullLibrary, setFullLibrary] = useState(false);
  useEffect(() => {
    if (open && threads && !fullLibrary) {
      startTransition(() => setFullLibrary(true));
    }
  }, [open, threads, fullLibrary]);

  /* The debounced query the deep (full-text) pass actually searches for. */
  const [deepQuery, setDeepQuery] = useState("");

  /* Live while open and through the exit fade; off once a close settles.
     Switching on is derived during render, so the first open frame is
     already live. Switching off waits out the fade, and lets go of the
     full library and the deep query with it. */
  const [engaged, setEngaged] = useState(open);
  if (open && !engaged) setEngaged(true);
  useEffect(() => {
    if (open) return;
    const id = setTimeout(() => {
      setEngaged(false);
      setFullLibrary(false);
      setDeepQuery("");
    }, CLOSE_RESET_DELAY_MS);
    return () => clearTimeout(id);
  }, [open]);

  /* Deep pass: once the query has sat unchanged for a beat, run the
     full-text search over message content. While the user keeps typing,
     the debounced query lags behind `query`, which doubles as the "stale
     results — don't show them" signal. Only chat lists search message
     bodies, so other tabs read it as empty and the subscription drops. */
  const wantsDeep =
    engaged &&
    Boolean(query) &&
    filterMenu === null &&
    /* A Type filter is artifacts-only — no chat could survive it. */
    !filters.some((filter) => filter.key === "type") &&
    (effectiveType === "all" || effectiveType === "chats");
  useEffect(() => {
    if (!wantsDeep) return;
    const id = setTimeout(() => setDeepQuery(query), DEEP_SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [query, wantsDeep]);
  const liveDeepQuery = wantsDeep ? deepQuery : "";

  /* useQueries, not useQuery: a failed query comes back as an Error instead
     of being thrown into the tree. The palette lives in the shell, so a web
     build that lands before its backend — or a search that errors — must
     degrade to "nothing here", never take the whole app down. A key left
     out of the request is the same as "skip". */
  const fetchArtifacts = isAuthenticated && engaged && !incognito;
  const requests = useMemo(
    () => ({
      ...(isAuthenticated && liveDeepQuery
        ? {
            deep: {
              query: api.historySearch.deepSearch,
              args: { query: liveDeepQuery },
            },
          }
        : {}),
      /* Fetched whenever the palette is up (not just on the Artifacts
         tab), so switching tabs finds the list already there. */
      ...(fetchArtifacts
        ? { artifacts: { query: api.historySearch.recentArtifacts, args: {} } }
        : {}),
    }),
    [isAuthenticated, liveDeepQuery, fetchArtifacts],
  );
  const fetched = useQueries(requests);
  /* A failed deep pass simply finds nothing more. */
  const deepHits: DeepHit[] | undefined =
    fetched.deep instanceof Error ? NO_DEEP_HITS : fetched.deep;
  const artifactsFailed = fetched.artifacts instanceof Error;
  const artifacts: ArtifactSummary[] | undefined = artifactsFailed
    ? NO_ARTIFACTS
    : fetched.artifacts;

  const deepSettled =
    wantsDeep && liveDeepQuery === query && deepHits !== undefined;

  /* Everything there is, before any filter. */
  const everything = useMemo((): PaletteSources & {
    byId: Map<string, ThreadSummary>;
  } => {
    const list = threads ?? [];
    const byId = new Map(list.map((thread) => [thread.id, thread]));
    const titleOf = (thread: ThreadSummary) =>
      openedTitles.get(thread.id) ?? thread.title;
    return {
      threads: list,
      byId,
      titleOf,
      folders,
      folderNames: new Map(folders.map((folder) => [folder.id, folder.name])),
      /* Resolved against the loaded list, which already hides deleted and
         pending-delete chats — an artifact whose chat is gone goes too. */
      artifacts: (artifacts ?? []).flatMap((artifact) => {
        const thread = byId.get(artifact.threadId);
        return thread ? [{ artifact, threadTitle: titleOf(thread) }] : [];
      }),
      commands,
    };
  }, [threads, openedTitles, folders, artifacts, commands]);

  /* Filters narrow the sources once, up front, so every tab, count and
     section downstream already sees only what passes. Folders and actions
     have nothing to filter on, so they bow out while any filter is on. */
  const sources = useMemo((): PaletteSources => {
    if (filters.length === 0) return everything;
    return {
      ...everything,
      threads: everything.threads.filter((thread) =>
        threadPasses(thread, filters),
      ),
      artifacts: everything.artifacts.filter(({ artifact }) => {
        const thread = everything.byId.get(artifact.threadId);
        return thread !== undefined && artifactPasses(artifact, thread, filters);
      }),
      folders: EMPTY_FOLDERS,
      commands: NO_COMMANDS,
    };
  }, [everything, filters]);

  const matches = useMemo(
    () => (query ? matchPalette(sources, query) : null),
    [sources, query],
  );

  /* Deep hits arrive as thread ids — resolve them against the loaded list
     and drop anything the title matches already cover. */
  /* Deep hits arrive as thread ids — resolve them against the (filtered)
     list and drop anything the title matches already cover. */
  const deep = useMemo(() => {
    if (!deepSettled || !deepHits) return [];
    const titleHits = new Set(matches?.chats.map(({ value }) => value.id));
    const passing = new Map(
      sources.threads.map((thread) => [thread.id, thread]),
    );
    return deepHits.flatMap((hit) => {
      const thread = passing.get(hit.threadId);
      return thread && !titleHits.has(hit.threadId)
        ? [{ thread, excerpt: hit.excerpt }]
        : [];
    });
  }, [deepSettled, deepHits, sources, matches]);

  /* The picker: a filter's values are counted against everything, with the
     other filters in force and this value swapped in. */
  const menuSections = useMemo((): PaletteSection[] | null => {
    if (!filterMenu) return null;
    if (filterMenu.step === "keys") {
      return filterKeySections(filterMenu.query, filters);
    }
    const { key } = filterMenu;
    const modelNames = new Map(models.map((model) => [model.key, model.name]));
    const options = filterOptions(key, {
      threads: everything.threads,
      folders: everything.folders,
      modelName: (model) => modelNames.get(model) ?? model,
    });
    return filterValueSections(key, filterMenu.query, options, (option) => {
      const trial = withFilter(filters, {
        key,
        value: option.value,
        label: option.label,
      });
      let total = 0;
      for (const thread of everything.threads) {
        if (threadPasses(thread, trial)) total += 1;
      }
      for (const { artifact } of everything.artifacts) {
        const thread = everything.byId.get(artifact.threadId);
        if (thread && artifactPasses(artifact, thread, trial)) total += 1;
      }
      return total;
    });
  }, [filterMenu, filters, models, everything]);

  const sections = useMemo((): PaletteSection[] => {
    if (menuSections) return menuSections;
    const library = fullLibrary
      ? sources.threads
      : sources.threads.slice(0, FIRST_PAINT_ROWS);
    switch (effectiveType) {
      case "all":
        if (matches) return allSections(sources, matches, deep);
        return filters.length > 0
          ? filteredSections(sources, library)
          : recentSections(sources);
      case "chats":
        return chatSections(sources, library, matches, deep);
      case "folders":
        return folderSections(sources, matches);
      case "artifacts":
        return artifactSections(sources, matches);
      case "actions":
        return actionSections(sources, matches);
    }
  }, [
    menuSections,
    sources,
    matches,
    deep,
    effectiveType,
    filters,
    fullLibrary,
  ]);

  const itemCount = sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );

  const counts = useMemo((): Partial<Record<PaletteType, number>> => {
    if (matches) {
      return {
        chats: matches.chats.length,
        folders: matches.folders.length,
        artifacts: matches.artifacts.length,
        actions: matches.actions.length,
      };
    }
    if (filters.length === 0) return {};
    return {
      chats: sources.threads.length,
      folders: 0,
      artifacts: sources.artifacts.length,
      actions: 0,
    };
  }, [matches, filters, sources]);

  /* When the "Searching deeper" notice shows: straight away when nothing
     else came up (it owns the empty-state slot), otherwise only once the
     pause elapses — and sticky from then on, so continued typing restyles
     it instead of blinking it out and back. */
  const deepOutstanding = wantsDeep && !deepSettled;
  const [deepNoticeSticky, setDeepNoticeSticky] = useState(false);
  const showDeepNotice =
    deepOutstanding &&
    (itemCount === 0 || liveDeepQuery === query || deepNoticeSticky);
  if (deepNoticeSticky !== showDeepNotice) setDeepNoticeSticky(showDeepNotice);

  return {
    sections,
    itemCount,
    counts,
    loadingChats: threads === undefined && isAuthenticated,
    loadingArtifacts: artifacts === undefined && fetchArtifacts,
    artifactsFailed,
    showDeepNotice,
    folders,
  };
}
