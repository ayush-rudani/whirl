import {
  IconAppWindowFilled,
  IconChartBubbleFilled,
  IconFileCodeFilled,
  IconFileTextFilled,
  type TablerIcon,
} from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@whirl/backend/convex/_generated/api";

import type { FolderSummary } from "@/lib/folders";
import type { ThreadSummary } from "@/lib/threads";
import type { FilterDef, FilterKey, FilterOption } from "./palette-filters";
import type { Command } from "./use-commands";

/* The palette's vocabulary: which kinds of thing it can show, how a result
   row is shaped, and how rows group into sections. The data hook
   (./use-palette-results.ts) builds these; the rows in
   components/commands/palette/ draw them. */

export const PALETTE_TYPES = [
  { value: "all", label: "All" },
  { value: "chats", label: "Chats" },
  { value: "folders", label: "Folders" },
  { value: "artifacts", label: "Artifacts" },
  { value: "actions", label: "Actions" },
] as const;

export type PaletteType = (typeof PALETTE_TYPES)[number]["value"];

export type ArtifactSummary = FunctionReturnType<
  typeof api.historySearch.recentArtifacts
>[number];

/* How each kind of artifact is drawn and named — shared by its rows and the
   Type filter, so the two never disagree. */
export const ARTIFACT_KINDS: Record<
  ArtifactSummary["kind"],
  { plural: string; icon: TablerIcon }
> = {
  document: { plural: "Documents", icon: IconFileTextFilled },
  code: { plural: "Code", icon: IconFileCodeFilled },
  page: { plural: "Pages", icon: IconAppWindowFilled },
  chart: { plural: "Charts", icon: IconChartBubbleFilled },
};

export type PaletteItem =
  | {
      kind: "thread";
      key: string;
      thread: ThreadSummary;
      /** What to call it — a locked chat's opened name when this tab has
       *  its key, otherwise the thread's own title. */
      title: string;
      folderName?: string;
      /** Deep hits: a glimpse of the message line that matched. */
      excerpt?: string;
    }
  | { kind: "folder"; key: string; folder: FolderSummary; chatCount: number }
  | {
      kind: "artifact";
      key: string;
      artifact: ArtifactSummary;
      threadTitle: string;
    }
  | { kind: "command"; key: string; command: Command }
  | {
      kind: "filter";
      key: string;
      filter: FilterDef;
      /** The value this filter is already set to, if any. */
      current?: string;
    }
  | {
      kind: "filter-value";
      key: string;
      filterKey: FilterKey;
      option: FilterOption;
      /** Chats and artifacts left if this value were picked. */
      count: number;
    };

export type PaletteSection = {
  key: string;
  label: string;
  items: PaletteItem[];
  /** Keyboard index of the section's first row — rows count straight down
   *  through every section, so arrows walk one continuous list. */
  startIndex: number;
};

/** Numbers each section's rows on from the last. */
export function indexSections(
  sections: Array<Omit<PaletteSection, "startIndex">>,
): PaletteSection[] {
  let next = 0;
  return sections
    .filter((section) => section.items.length > 0)
    .map((section) => {
      const indexed = { ...section, startIndex: next };
      next += section.items.length;
      return indexed;
    });
}
