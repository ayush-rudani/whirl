import { ConvexError } from "convex/values";

import {
  addSupermemoryDocument,
  supermemoryNamespacePath,
  supermemoryRequest,
} from "./supermemory";

/**
 * The user-facing half of Supermemory: everything the Memory settings tab needs
 * to read and rewrite what Whirl remembers. `supermemory.ts` stays the
 * ingest/retrieval path the inference pipeline runs on; nothing here is ever
 * called outside an authenticated, paid-gated action (see `userMemory.ts`).
 *
 * Supermemory has shuffled its list payloads between API versions, so every
 * response is parsed defensively: an unexpected shape reads as "nothing here"
 * rather than throwing a stack trace at someone opening their settings.
 */

/** Documents come back paginated; the settings list pulls one page at a time. */
export const SOURCES_PAGE_SIZE = 8;

/** Well under the API's 10k ceiling — a memory is one fact, not an essay. */
export const MAX_MEMORY_CONTENT = 1_000;

/* Memories paginate too, and the default page is a mere 10 — ask for the
   biggest page the API takes and walk it, up to a ceiling that keeps the
   action's return under Convex's 1MB limit. Past that the card says how
   many it's showing rather than quietly truncating. */
const MEMORIES_PAGE_SIZE = 100;
const MAX_MEMORY_PAGES = 5;
const MAX_MEMORIES_RETURNED = MEMORIES_PAGE_SIZE * MAX_MEMORY_PAGES;

export type MemoryEntry = {
  id: string;
  memory: string;
  /** Static = a permanent trait ("is left-handed"), never aged out. */
  isStatic: boolean;
  createdAt: number | null;
  updatedAt: number | null;
};

export type MemorySource = {
  id: string;
  title: string;
  summary: string | null;
  /** Supermemory's ingestion stage: queued / embedding / done / failed / … */
  status: string;
  /** The Whirl thread this document was built from, when it carries one. */
  threadId: string | null;
  updatedAt: number | null;
};

export type MemorySourcePage = {
  sources: MemorySource[];
  page: number;
  totalPages: number;
  totalItems: number;
};

/* --- Response parsing ------------------------------------------------------ */

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** v5 lists answer `{ documents, chunks, memories, pagination }` and fill only
 *  the array that was asked for — the others can arrive empty, so read the
 *  requested key by name rather than taking the first array in sight. */
function rowsOf(response: unknown, key: "documents" | "memories"): unknown[] {
  if (Array.isArray(response)) return response;
  const rows = asRecord(response)?.[key];
  return Array.isArray(rows) ? rows : [];
}

/** v5 tucks lifecycle fields (status, timestamps) under `system`. */
function systemField(record: Record<string, unknown>, key: string): unknown {
  return record[key] ?? asRecord(record.system)?.[key];
}

function toMemoryEntry(row: unknown): MemoryEntry | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = asString(record.id) ?? asString(record.memoryId);
  const memory = asString(record.memory) ?? asString(record.content);
  if (!id || !memory) return null;

  // Forgetting is a soft delete and superseded versions stick around, so drop
  // anything already retired — the tab is about what's live right now.
  if (record.isForgotten === true || record.isLatest === false) return null;
  if (asString(record.status) === "forgotten") return null;

  const createdAt = asTimestamp(systemField(record, "createdAt"));
  return {
    id,
    memory,
    isStatic: record.isStatic === true,
    createdAt,
    updatedAt: asTimestamp(systemField(record, "updatedAt")) ?? createdAt,
  };
}

/** Our own documents are transcripts, so Supermemory usually files them under
 *  its own placeholder title rather than naming them. */
const SOURCE_TITLE_FALLBACK = "Chat memory";
const PLACEHOLDER_TITLE = "untitled document";

function toMemorySource(row: unknown): MemorySource | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = asString(record.id);
  if (!id) return null;

  const rawTitle = asString(record.title);
  const title =
    rawTitle && rawTitle.toLowerCase() !== PLACEHOLDER_TITLE ? rawTitle : null;

  const metadata = asRecord(record.metadata);
  return {
    id,
    title: title ?? SOURCE_TITLE_FALLBACK,
    summary: asString(record.summary),
    status: asString(systemField(record, "status")) ?? "unknown",
    threadId: metadata ? asString(metadata.threadId) : null,
    updatedAt:
      asTimestamp(systemField(record, "updatedAt")) ??
      asTimestamp(systemField(record, "createdAt")),
  };
}

/** The single memory a write echoes back — sometimes the object itself, other
 *  times wrapped in a list. Null when the shape is unfamiliar; callers refetch
 *  rather than guess. */
function firstEntryOf(response: unknown): MemoryEntry | null {
  const direct = toMemoryEntry(response);
  if (direct) return direct;
  for (const row of rowsOf(response, "memories")) {
    const entry = toMemoryEntry(row);
    if (entry) return entry;
  }
  return null;
}

function asCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

/** v5 bulk deletes answer 200 even when some ids didn't go: `errors` lists
 *  the ones that failed. One id in, so any error means it's still there. */
function failedDeleteDetail(response: unknown): string | null {
  const errors = asRecord(response)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return JSON.stringify(errors).slice(0, 240);
}

/* --- Memories -------------------------------------------------------------- */

/** Every live memory Supermemory holds for this user, newest first, with the
 *  upstream total so a capped list can say so. */
export async function listSupermemoryMemories(
  namespace: string,
): Promise<{ memories: MemoryEntry[]; totalItems: number }> {
  const entries: MemoryEntry[] = [];
  let totalItems = 0;
  let totalPages = 1;

  for (let page = 1; page <= Math.min(totalPages, MAX_MEMORY_PAGES); page += 1) {
    const response = await supermemoryRequest<unknown>({
      path: supermemoryNamespacePath(namespace, "/list/memories"),
      method: "POST",
      query: {
        page,
        limit: MEMORIES_PAGE_SIZE,
        sort: "updatedAt",
        order: "desc",
      },
      body: {},
    });

    for (const row of rowsOf(response, "memories")) {
      const entry = toMemoryEntry(row);
      if (entry) entries.push(entry);
    }

    const pagination = asRecord(asRecord(response)?.pagination);
    totalPages = asCount(pagination?.totalPages, page);
    totalItems = asCount(pagination?.totalItems, entries.length);
  }

  return {
    // Permanent traits first, then newest — the same order the settings list
    // shows, so they're never the ones the cap drops.
    memories: entries
      .sort((a, b) =>
        a.isStatic !== b.isStatic
          ? a.isStatic
            ? -1
            : 1
          : (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
      )
      .slice(0, MAX_MEMORIES_RETURNED),
    totalItems: Math.max(totalItems, entries.length),
  };
}

/** Write a memory the user typed themselves. v5 has no direct memory write,
 *  so it goes in as a tiny document extracted on the spot. The reply is the
 *  document's acceptance, not a memory row, so callers refetch the list. */
export async function addSupermemoryMemory({
  namespace,
  content,
}: {
  namespace: string;
  content: string;
}): Promise<null> {
  await addSupermemoryDocument({
    namespace,
    id: `whirl-memory-${crypto.randomUUID()}`,
    content: content.slice(0, MAX_MEMORY_CONTENT),
    metadata: { source: "whirl", origin: "user_edit" },
    dreaming: "instant",
  });
  return null;
}

/** Rewrite a memory. Supermemory versions rather than overwrites — the old
 *  text is kept behind the new one, under a new id.
 *
 *  Still on the v4 route: v5 dropped memory-level edits in favour of
 *  replacing the source document, and most memories here come from whole
 *  chat transcripts we wouldn't want to overwrite with a single fact. */
export async function updateSupermemoryMemory({
  namespace,
  id,
  content,
}: {
  namespace: string;
  id: string;
  content: string;
}): Promise<MemoryEntry | null> {
  const response = await supermemoryRequest<unknown>({
    path: "/v4/memories",
    method: "PATCH",
    body: {
      containerTag: namespace,
      id,
      newContent: content.slice(0, MAX_MEMORY_CONTENT),
    },
  });
  return firstEntryOf(response);
}

export async function forgetSupermemoryMemory({
  namespace,
  id,
}: {
  namespace: string;
  id: string;
}) {
  const response = await supermemoryRequest<unknown>({
    path: supermemoryNamespacePath(namespace, "/memories"),
    method: "DELETE",
    body: { ids: [id] },
  });

  const detail = failedDeleteDetail(response);
  if (detail) {
    throw new Error(`Supermemory couldn't forget memory ${id}: ${detail}`);
  }
}

/* --- Source documents ------------------------------------------------------ */

/** One page of the documents Whirl has pushed for this user — the raw material
 *  memories are extracted from. */
export async function listSupermemorySources({
  namespace,
  page,
}: {
  namespace: string;
  page: number;
}): Promise<MemorySourcePage> {
  const safePage = Math.max(1, Math.floor(page));
  const response = await supermemoryRequest<unknown>({
    path: supermemoryNamespacePath(namespace, "/list/documents"),
    method: "POST",
    query: {
      page: safePage,
      limit: SOURCES_PAGE_SIZE,
      sort: "updatedAt",
      order: "desc",
    },
    body: {},
  });

  const sources: MemorySource[] = [];
  for (const row of rowsOf(response, "documents")) {
    const source = toMemorySource(row);
    if (source) sources.push(source);
  }

  const pagination = asRecord(asRecord(response)?.pagination);
  return {
    sources,
    page: asCount(pagination?.currentPage, safePage),
    totalPages: asCount(pagination?.totalPages, sources.length ? safePage : 0),
    totalItems: asCount(pagination?.totalItems, sources.length),
  };
}

/** Scoped to the namespace, so an id from someone else's list can't reach
 *  their documents. v5 refuses to delete anything mid-ingestion. */
export async function deleteSupermemoryDocument({
  namespace,
  id,
}: {
  namespace: string;
  id: string;
}) {
  const response = await supermemoryRequest<unknown>({
    path: supermemoryNamespacePath(namespace, "/document"),
    method: "DELETE",
    body: { ids: [id] },
  });

  const detail = failedDeleteDetail(response);
  if (!detail) return;
  if (detail.toLowerCase().includes("still processing")) {
    throw new ConvexError(
      "That chat is still being added to memory. Try again in a minute.",
    );
  }
  throw new Error(`Supermemory couldn't delete document ${id}: ${detail}`);
}

/** Drop the user's whole namespace: every document and every memory. No
 *  `moveTo`, so this is the permanent delete it's meant to be. */
export async function wipeSupermemoryNamespace(
  namespace: string,
): Promise<{ documents: number; memories: number }> {
  const response = await supermemoryRequest<unknown>({
    path: supermemoryNamespacePath(namespace),
    method: "DELETE",
  });

  const record = asRecord(response);
  return {
    documents: asCount(record?.deletedDocumentsCount, 0),
    memories: asCount(record?.deletedMemoriesCount, 0),
  };
}
