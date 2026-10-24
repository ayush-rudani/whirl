const SUPERMEMORY_API_BASE = "https://api.supermemory.ai";

const ORGANIZATION_BODY = {
  organizationalContext:
    "Whirl is a personal AI chatbot/assistant. Each namespace is the signed-in user id, so each user's memories are isolated. We store completed chat turns and historical thread transcripts. Extract durable user preferences, profile facts, ongoing projects, constraints, tastes, and useful context. Ignore one-off tasks, transient details, duplicate facts, and secrets or sensitive facts unless the user explicitly asks to remember them.",
} as const;

const MAX_QUERY_CHARS = 2_000;
const MAX_CONTEXT_ITEMS = 8;
const MAX_CONTEXT_ITEM_CHARS = 600;
const MAX_DOCUMENT_CHARS = 48_000;

/* The v4 profile lookup searched memories at a 0.6 threshold. v5 searches
   hybrid at 0.3 by default, so pin the old behaviour until results have been
   compared side by side. Reranking and query rewriting already default off. */
const PROMPT_MEMORY_SEARCH = {
  searchMode: "memories",
  threshold: 0.6,
} as const;

let settingsConfigured = false;

export type SupermemoryPromptContext = {
  staticFacts: string[];
  dynamicFacts: string[];
  memories: string[];
};

type SupermemoryMetadata = Record<string, string | number | boolean>;

type SupermemoryProfileResponse = {
  profile?: {
    static?: unknown;
    dynamic?: unknown;
  };
};

type SupermemorySearchResponse = {
  results?: unknown;
};

type SupermemorySearchResult = {
  memory?: unknown;
  chunk?: unknown;
  content?: unknown;
  included?: {
    document?: {
      content?: unknown;
    };
  };
};

function supermemoryApiKey() {
  const key = process.env.SUPERMEMORY_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing SUPERMEMORY_API_KEY");
  }
  return key;
}

export function isSupermemoryConfigured() {
  return Boolean(process.env.SUPERMEMORY_API_KEY?.trim());
}

export function supermemoryNamespaceForUser(userId: string) {
  return userId;
}

/** Every v5 data route hangs off the namespace it reads or writes. */
export function supermemoryNamespacePath(namespace: string, suffix = "") {
  return `/ns/${encodeURIComponent(namespace)}${suffix}`;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 12)}\n[truncated]` : text;
}

function cleanText(value: unknown, max = MAX_CONTEXT_ITEM_CHARS) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? truncate(trimmed, max) : null;
}

/** v5 profile entries are `{ id, memory }`; v4 sent bare strings. */
function profileEntryText(item: unknown) {
  if (item && typeof item === "object") {
    return cleanText((item as { memory?: unknown }).memory);
  }
  return cleanText(item);
}

function profileList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = profileEntryText(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_CONTEXT_ITEMS) break;
  }
  return out;
}

function memoryFromSearchResult(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const row = result as SupermemorySearchResult;
  return (
    cleanText(row.memory) ??
    cleanText(row.chunk) ??
    cleanText(row.content) ??
    cleanText(row.included?.document?.content)
  );
}

function searchResultList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = memoryFromSearchResult(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_CONTEXT_ITEMS) break;
  }
  return out;
}

/**
 * One authenticated call to the Supermemory REST API, parsed as JSON. Throws
 * with the upstream status and a slice of its body so callers can turn a
 * failure into copy a human can act on. Shared with `supermemoryManage.ts` and
 * `supermemorySearch.ts`.
 *
 * v5 is strict about placement: pagination and DELETE options belong in
 * `query`, everything else in `body`. A misplaced option is a 400 at best.
 */
export async function supermemoryRequest<T>({
  path,
  method,
  query,
  body,
}: {
  path: string;
  method: "GET" | "PATCH" | "POST" | "DELETE";
  query?: Record<string, string | number>;
  body?: Record<string, unknown>;
}): Promise<T> {
  const search = query
    ? `?${new URLSearchParams(
        Object.entries(query).map(([key, value]) => [key, String(value)]),
      )}`
    : "";
  const response = await fetch(`${SUPERMEMORY_API_BASE}${path}${search}`, {
    method,
    headers: {
      Authorization: `Bearer ${supermemoryApiKey()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Supermemory ${path} failed with ${response.status}${
        detail ? `: ${detail.slice(0, 240)}` : ""
      }`,
    );
  }

  if (response.status === 204) {
    return null as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function ensureSupermemorySettings() {
  if (settingsConfigured) return;
  await supermemoryRequest({
    path: "/organization",
    method: "PATCH",
    body: ORGANIZATION_BODY,
  });
  settingsConfigured = true;
}

export async function fetchSupermemoryPromptContext({
  namespace,
  query,
}: {
  namespace: string;
  query: string;
}): Promise<SupermemoryPromptContext> {
  // No ensureSupermemorySettings() here: the settings body only shapes
  // ingestion filtering, and this lookup races a timeout on the hot prompt
  // path — a cold isolate can't afford the extra round trip.
  //
  // v5's profile no longer takes a query, so the query-matched memories come
  // from a separate search. Both run at once to keep the hot path one trip.
  const trimmed = query.trim();
  const [profile, search] = await Promise.all([
    supermemoryRequest<SupermemoryProfileResponse>({
      path: supermemoryNamespacePath(namespace, "/profile"),
      method: "POST",
      body: {},
    }),
    trimmed
      ? supermemoryRequest<SupermemorySearchResponse>({
          path: supermemoryNamespacePath(namespace, "/search"),
          method: "POST",
          body: {
            query: truncate(trimmed, MAX_QUERY_CHARS),
            limit: MAX_CONTEXT_ITEMS,
            ...PROMPT_MEMORY_SEARCH,
          },
        })
      : null,
  ]);

  return {
    staticFacts: profileList(profile?.profile?.static),
    dynamicFacts: profileList(profile?.profile?.dynamic),
    memories: searchResultList(search?.results),
  };
}

export async function addSupermemoryDocument({
  namespace,
  content,
  id,
  metadata,
  dreaming,
}: {
  namespace: string;
  content: string;
  /** Our own stable id — re-adding under it replaces the document. */
  id?: string;
  metadata?: SupermemoryMetadata;
  /** "instant" extracts memories right away, at one extra operation. */
  dreaming?: "instant";
}) {
  const trimmed = content.trim();
  if (!trimmed) return;

  await ensureSupermemorySettings();
  await supermemoryRequest({
    path: supermemoryNamespacePath(namespace, "/document"),
    method: "POST",
    body: {
      content: truncate(trimmed, MAX_DOCUMENT_CHARS),
      ...(id ? { id } : {}),
      ...(metadata ? { metadata } : {}),
      ...(dreaming ? { dreaming } : {}),
    },
  });
}
