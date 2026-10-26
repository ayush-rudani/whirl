import type { FolderSummary } from "@/lib/folders";
import { scoreText } from "@/lib/model-search";
import { formatThreadGroup, groupThreads, type ThreadSummary } from "@/lib/threads";
import { matchCommands, scoreCommand } from "./match-commands";
import type { ArtifactSummary, PaletteItem, PaletteSection } from "./palette";
import { indexSections } from "./palette";
import type { Command } from "./use-commands";

/* Pure section builders for the palette, one per tab. The hook
   (./use-palette-results.ts) owns the subscriptions and timing; this file
   only decides what shows, in what order, under which heading. */

/** Rows under "Recents" when the All tab opens with nothing typed. */
const RECENT_ROWS = 8;
/** A typed query in Chats caps here to keep filtering instant. */
const MAX_CHAT_RESULTS = 50;
/** All mixes every kind, so each gets a short list — the type tabs are
 *  where you go for the rest. */
const ALL_LIMITS = { chats: 6, folders: 3, artifacts: 4, actions: 4 };
/** A hit on the chat an artifact lives in is a weaker hit than on the
 *  artifact's own title. */
const ARTIFACT_THREAD_WEIGHT = 0.6;

export type PaletteSources = {
  threads: ThreadSummary[];
  titleOf: (thread: ThreadSummary) => string;
  folders: FolderSummary[];
  folderNames: Map<string, string>;
  /** Artifacts whose chat is in the loaded list, with that chat's name. */
  artifacts: Array<{ artifact: ArtifactSummary; threadTitle: string }>;
  commands: Command[];
};

type Scored<T> = { value: T; score: number };

/** What a query matches, per kind, best first. Shared by the All tab and
 *  the counts on every tab chip. */
export type PaletteMatches = {
  chats: Scored<ThreadSummary>[];
  folders: Scored<FolderSummary>[];
  artifacts: Scored<PaletteSources["artifacts"][number]>[];
  actions: Scored<Command>[];
};

function byScore<T>(items: T[], score: (item: T) => number): Scored<T>[] {
  return items
    .map((value) => ({ value, score: score(value) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
}

export function matchPalette(
  sources: PaletteSources,
  query: string,
): PaletteMatches {
  return {
    /* Ties go to the fresher chat — sort is stable over the
       recency-ordered list. */
    chats: byScore(sources.threads, (thread) =>
      scoreText(sources.titleOf(thread), query),
    ),
    folders: byScore(sources.folders, (folder) => scoreText(folder.name, query)),
    artifacts: byScore(sources.artifacts, ({ artifact, threadTitle }) =>
      Math.max(
        scoreText(artifact.title, query),
        scoreText(threadTitle, query) * ARTIFACT_THREAD_WEIGHT,
      ),
    ),
    actions: byScore(matchCommands(sources.commands, ""), (command) =>
      scoreCommand(command, query),
    ),
  };
}

function threadItem(
  sources: PaletteSources,
  thread: ThreadSummary,
  excerpt?: string,
): PaletteItem {
  return {
    kind: "thread",
    key: `${excerpt === undefined ? "thread" : "deep"}:${thread.id}`,
    thread,
    title: sources.titleOf(thread),
    folderName: thread.folderId
      ? sources.folderNames.get(thread.folderId)
      : undefined,
    excerpt,
  };
}

function folderItems(
  sources: PaletteSources,
  folders: FolderSummary[],
): PaletteItem[] {
  const counts = new Map<string, number>();
  for (const thread of sources.threads) {
    if (thread.folderId) {
      counts.set(thread.folderId, (counts.get(thread.folderId) ?? 0) + 1);
    }
  }
  return folders.map((folder) => ({
    kind: "folder",
    key: `folder:${folder.id}`,
    folder,
    chatCount: counts.get(folder.id) ?? 0,
  }));
}

function artifactItems(
  artifacts: PaletteSources["artifacts"],
): PaletteItem[] {
  return artifacts.map(({ artifact, threadTitle }) => ({
    kind: "artifact",
    key: `artifact:${artifact.id}`,
    artifact,
    threadTitle,
  }));
}

function commandItems(commands: Command[]): PaletteItem[] {
  return commands.map((command) => ({
    kind: "command",
    key: `command:${command.id}`,
    command,
  }));
}

/** All, nothing typed: the latest chats, then everything you can do. */
export function recentSections(sources: PaletteSources): PaletteSection[] {
  const recents = [...sources.threads]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, RECENT_ROWS);
  return indexSections([
    {
      key: "recents",
      label: "Recents",
      items: recents.map((thread) => threadItem(sources, thread)),
    },
    {
      key: "actions",
      label: "Actions",
      items: commandItems(matchCommands(sources.commands, "")),
    },
  ]);
}

/** All, with a query: a short list of each kind, the kind with the best
 *  hit first — typing "settings" should put the action on top, typing a
 *  chat's name should put the chat there. */
export function allSections(
  sources: PaletteSources,
  matches: PaletteMatches,
  deep: Array<{ thread: ThreadSummary; excerpt: string }>,
): PaletteSection[] {
  const kinds = [
    {
      key: "chats",
      label: "Chats",
      best: matches.chats[0]?.score ?? 0,
      items: matches.chats
        .slice(0, ALL_LIMITS.chats)
        .map(({ value }) => threadItem(sources, value)),
    },
    {
      key: "folders",
      label: "Folders",
      best: matches.folders[0]?.score ?? 0,
      items: folderItems(
        sources,
        matches.folders.slice(0, ALL_LIMITS.folders).map(({ value }) => value),
      ),
    },
    {
      key: "artifacts",
      label: "Artifacts",
      best: matches.artifacts[0]?.score ?? 0,
      items: artifactItems(
        matches.artifacts
          .slice(0, ALL_LIMITS.artifacts)
          .map(({ value }) => value),
      ),
    },
    {
      key: "actions",
      label: "Actions",
      best: matches.actions[0]?.score ?? 0,
      items: commandItems(
        matches.actions.slice(0, ALL_LIMITS.actions).map(({ value }) => value),
      ),
    },
  ];
  /* Stable sort: equal bests keep the order above. Kinds with no hit sort
     last and drop out as empty sections anyway. */
  const ranked = [...kinds].sort((a, b) => b.best - a.best);
  return indexSections([...ranked, deepSection(sources, deep)]);
}

/** Chats: the library grouped like the sidebar, or a query's matches grouped
 *  the same way. A folder scope narrows either to that folder's chats. */
export function chatSections(
  sources: PaletteSources,
  library: ThreadSummary[],
  matches: PaletteMatches | null,
  deep: Array<{ thread: ThreadSummary; excerpt: string }>,
  folderId: string | null,
): PaletteSection[] {
  const inScope = (thread: ThreadSummary) =>
    folderId === null || thread.folderId === folderId;
  const groups = matches
    ? bucketMatches(
        matches.chats
          .map(({ value }) => value)
          .filter(inScope)
          .slice(0, MAX_CHAT_RESULTS),
      )
    : groupThreads(library.filter(inScope));
  return indexSections([
    ...groups.map(([label, items]) => ({
      key: `group:${label}`,
      label,
      items: items.map((thread) => threadItem(sources, thread)),
    })),
    deepSection(sources, deep),
  ]);
}

/* groupThreads only merges neighbours, which suits the date-sorted library.
   Ranked matches hop between dates (Today, Yesterday, Today again), so each
   label's runs are gathered into one bucket: buckets in order of their best
   hit, hits in rank order within. */
function bucketMatches(
  threads: ThreadSummary[],
): Array<[string, ThreadSummary[]]> {
  const buckets = new Map<string, ThreadSummary[]>();
  for (const [label, run] of groupThreads(threads)) {
    const bucket = buckets.get(label);
    if (bucket) bucket.push(...run);
    else buckets.set(label, run);
  }
  return [...buckets];
}

export function folderSections(
  sources: PaletteSources,
  matches: PaletteMatches | null,
): PaletteSection[] {
  const folders = matches
    ? matches.folders.map(({ value }) => value)
    : sources.folders;
  return indexSections([
    { key: "folders", label: "Folders", items: folderItems(sources, folders) },
  ]);
}

/** Artifacts by when they last changed, under the sidebar's date labels —
 *  or a query's matches, best first. */
export function artifactSections(
  sources: PaletteSources,
  matches: PaletteMatches | null,
): PaletteSection[] {
  if (matches) {
    return indexSections([
      {
        key: "artifacts",
        label: "Artifacts",
        items: artifactItems(matches.artifacts.map(({ value }) => value)),
      },
    ]);
  }
  const groups = new Map<string, PaletteSources["artifacts"]>();
  for (const entry of sources.artifacts) {
    const label = formatThreadGroup(entry.artifact.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return indexSections(
    [...groups].map(([label, entries]) => ({
      key: `group:${label}`,
      label,
      items: artifactItems(entries),
    })),
  );
}

export function actionSections(
  sources: PaletteSources,
  matches: PaletteMatches | null,
): PaletteSection[] {
  return indexSections([
    {
      key: "actions",
      label: "Actions",
      items: commandItems(
        matches
          ? matches.actions.map(({ value }) => value)
          : matchCommands(sources.commands, ""),
      ),
    },
  ]);
}

/* Threads whose messages (not titles) matched, each with a glimpse of the
   line that did it. */
function deepSection(
  sources: PaletteSources,
  deep: Array<{ thread: ThreadSummary; excerpt: string }>,
): Omit<PaletteSection, "startIndex"> {
  return {
    key: "deep",
    label: "Found in messages",
    items: deep.map(({ thread, excerpt }) =>
      threadItem(sources, thread, excerpt),
    ),
  };
}
