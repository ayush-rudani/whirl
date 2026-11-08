import {
  IconCategoryFilled,
  IconClockFilled,
  IconFolderFilled,
  IconFolderOff,
  IconGitBranch,
  IconLink,
  IconLockFilled,
  IconPinFilled,
  IconSparklesFilled,
  type TablerIcon,
} from "@tabler/icons-react";

import type { FolderSummary } from "@/lib/folders";
import { formatThreadGroup, type ThreadSummary } from "@/lib/threads";
import { scoreText } from "@/lib/model-search";
import {
  ARTIFACT_KINDS,
  indexSections,
  type ArtifactSummary,
  type PaletteSection,
} from "./palette";

/* The palette's "/" filters: what you can narrow by, the values each one
   offers, and whether a chat or an artifact passes. Filters stack (one value
   per kind, AND across kinds) and only ever narrow chats and artifacts —
   folders and actions have no date, model or status to speak of. */

export type FilterKey = "date" | "folder" | "model" | "status" | "type";

export type FilterDef = { key: FilterKey; label: string; icon: TablerIcon };

/** One value a filter can take. `label` is what its chip will say. */
export type FilterOption = { value: string; label: string; icon: TablerIcon };

/** A filter in force, in the order it was added — chips draw in this order
 *  and Backspace peels them off the end. */
export type PaletteFilter = { key: FilterKey; value: string; label: string };

export const FILTERS: readonly FilterDef[] = [
  { key: "date", label: "Date", icon: IconClockFilled },
  { key: "folder", label: "Folder", icon: IconFolderFilled },
  { key: "model", label: "Model", icon: IconSparklesFilled },
  { key: "status", label: "Status", icon: IconPinFilled },
  { key: "type", label: "Type", icon: IconCategoryFilled },
];

export const FILTER_DEFS = Object.fromEntries(
  FILTERS.map((filter) => [filter.key, filter]),
) as Record<FilterKey, FilterDef>;

/* The sidebar's own date buckets, so "Previous 7 days" here means exactly
   what it means over there. */
const DATE_BUCKETS = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Previous 30 days",
  "Older",
];

const NO_FOLDER = "none";

const STATUSES: FilterOption[] = [
  { value: "pinned", label: "Pinned", icon: IconPinFilled },
  { value: "locked", label: "Locked", icon: IconLockFilled },
  { value: "branched", label: "Branched", icon: IconGitBranch },
  { value: "shared", label: "Shared", icon: IconLink },
];

export type FilterContext = {
  threads: ThreadSummary[];
  folders: FolderSummary[];
  /** A model's display name, from its tier key or catalog slug. */
  modelName: (key: string) => string;
};

/** Every value a filter offers, before counting or searching. */
export function filterOptions(
  key: FilterKey,
  context: FilterContext,
): FilterOption[] {
  switch (key) {
    case "date":
      return DATE_BUCKETS.map((bucket) => ({
        value: bucket,
        label: bucket,
        icon: IconClockFilled,
      }));
    case "folder":
      return [
        ...context.folders.map((folder) => ({
          value: folder.id,
          label: folder.name,
          icon: IconFolderFilled,
        })),
        { value: NO_FOLDER, label: "No folder", icon: IconFolderOff },
      ];
    case "model": {
      /* Only models you've actually chatted with — a filter for a model
         that never answered anything would always come up empty. */
      const used = new Set<string>();
      for (const thread of context.threads) {
        if (thread.model) used.add(thread.model);
      }
      return [...used].map((model) => ({
        value: model,
        label: context.modelName(model),
        icon: IconSparklesFilled,
      }));
    }
    case "status":
      return STATUSES;
    case "type":
      return Object.entries(ARTIFACT_KINDS).map(([kind, { plural, icon }]) => ({
        value: kind,
        label: plural,
        icon,
      }));
  }
}

function threadPassesOne(thread: ThreadSummary, filter: PaletteFilter) {
  switch (filter.key) {
    case "date":
      return formatThreadGroup(thread.updatedAt) === filter.value;
    case "folder":
      return filter.value === NO_FOLDER
        ? thread.folderId === null
        : thread.folderId === filter.value;
    case "model":
      return thread.model === filter.value;
    case "status":
      switch (filter.value) {
        case "pinned":
          return thread.pinnedAt !== null;
        case "locked":
          return thread.locked;
        case "branched":
          return thread.branchedFromThreadId !== null;
        case "shared":
          return thread.shareId !== null;
        default:
          return false;
      }
    /* Type picks artifact kinds — no chat is a chart. */
    case "type":
      return false;
  }
}

export function threadPasses(
  thread: ThreadSummary,
  filters: readonly PaletteFilter[],
): boolean {
  return filters.every((filter) => threadPassesOne(thread, filter));
}

/** An artifact answers date and type for itself, and folder, model and
 *  status through the chat it lives in. */
export function artifactPasses(
  artifact: ArtifactSummary,
  thread: ThreadSummary,
  filters: readonly PaletteFilter[],
): boolean {
  return filters.every((filter) => {
    switch (filter.key) {
      case "date":
        return formatThreadGroup(artifact.updatedAt) === filter.value;
      case "type":
        return artifact.kind === filter.value;
      default:
        return threadPassesOne(thread, filter);
    }
  });
}

/** Swaps in `next`, replacing any filter of the same kind. */
export function withFilter(
  filters: readonly PaletteFilter[],
  next: PaletteFilter,
): PaletteFilter[] {
  return [...filters.filter((filter) => filter.key !== next.key), next];
}

/** What the filter picker is showing: the list of filters ("/…"), or one
 *  filter's values. */
export type FilterMenu =
  | { step: "keys"; query: string }
  | { step: "values"; key: FilterKey; query: string };

/** "/": every filter, each wearing the value it's set to, if any. */
export function filterKeySections(
  query: string,
  active: readonly PaletteFilter[],
): PaletteSection[] {
  const shown = query
    ? FILTERS.filter((filter) => scoreText(filter.label, query) > 0)
    : FILTERS;
  return indexSections([
    {
      key: "filters",
      label: "Filters",
      items: shown.map((filter) => ({
        kind: "filter",
        key: `filter:${filter.key}`,
        filter,
        current: active.find((entry) => entry.key === filter.key)?.label,
      })),
    },
  ]);
}

/** One filter's values, each with how many chats and artifacts it would
 *  leave alongside the filters already in force. Values that would leave
 *  nothing are skipped. */
export function filterValueSections(
  key: FilterKey,
  query: string,
  options: FilterOption[],
  count: (option: FilterOption) => number,
): PaletteSection[] {
  const items = options
    .filter((option) => !query || scoreText(option.label, query) > 0)
    .map((option) => ({ option, count: count(option) }))
    .filter(({ count }) => count > 0)
    .map(({ option, count }) => ({
      kind: "filter-value" as const,
      key: `filter-value:${key}:${option.value}`,
      filterKey: key,
      option,
      count,
    }));
  return indexSections([
    { key: `values:${key}`, label: FILTER_DEFS[key].label, items },
  ]);
}
