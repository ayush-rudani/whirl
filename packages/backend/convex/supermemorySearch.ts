import { supermemoryNamespacePath, supermemoryRequest } from "./supermemory";

/**
 * Semantic search over the conversation transcripts Whirl stores in
 * Supermemory — the searchChatHistory tool's backend whenever memory is
 * active. Supermemory has shuffled its payloads between API versions, so
 * every response is parsed defensively: an unfamiliar shape reads as "no
 * match" rather than a thrown turn (the tool falls back to keyword search).
 *
 * v5 chunk search answers one result per chunk — `{ chunk, metadata,
 * included: { document }, system }` — rather than v3's one result per document
 * with a `chunks` array, so hits are regrouped by document here.
 */

const RESULT_LIMIT = 8;
const MAX_EXCERPT_CHARS = 500;

export type SupermemoryChatHit = {
  /** The Whirl thread the transcript came from, as the raw metadata string. */
  threadId: string;
  /** When the turn happened; null when the document doesn't carry a date. */
  sentAt: number | null;
  excerpt: string;
};

type SearchMetadata = {
  threadId?: unknown;
  createdAt?: unknown;
};

type SearchDocument = {
  id?: unknown;
  metadata?: SearchMetadata;
  createdAt?: unknown;
  system?: { createdAt?: unknown };
};

type SearchResult = {
  chunk?: unknown;
  documentId?: unknown;
  metadata?: SearchMetadata;
  included?: { document?: SearchDocument };
  system?: { createdAt?: unknown };
};

type DocumentHit = {
  threadId: string;
  sentAt: number | null;
  parts: string[];
};

function chunkText(chunk: unknown): string | null {
  const content =
    chunk && typeof chunk === "object"
      ? (chunk as { content?: unknown }).content
      : chunk;
  if (typeof content !== "string") return null;
  const trimmed = content.replace(/\s+/g, " ").trim();
  return trimmed || null;
}

function excerptOf(parts: string[]): string {
  const joined = parts.join(" … ");
  return joined.length > MAX_EXCERPT_CHARS
    ? `${joined.slice(0, MAX_EXCERPT_CHARS)}…`
    : joined;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function sentAtOf(result: SearchResult, metadata: SearchMetadata) {
  const document = result.included?.document;
  return (
    asTimestamp(metadata.createdAt) ??
    asTimestamp(document?.system?.createdAt) ??
    asTimestamp(document?.createdAt) ??
    asTimestamp(result.system?.createdAt)
  );
}

/**
 * The best transcript matches for a query, similarity-ordered by the API.
 * The current thread is excluded (the model already has it in context), and
 * anything without a thread id or readable excerpt is dropped — callers
 * still verify the thread ids against live threads before showing titles.
 */
export async function searchSupermemoryConversations({
  namespace,
  query,
  excludeThreadId,
}: {
  namespace: string;
  query: string;
  excludeThreadId?: string;
}): Promise<SupermemoryChatHit[]> {
  const response = await supermemoryRequest<{ results?: unknown }>({
    path: supermemoryNamespacePath(namespace, "/search"),
    method: "POST",
    body: {
      query,
      limit: RESULT_LIMIT,
      searchMode: "chunks",
      include: { documents: true },
    },
  });

  if (!Array.isArray(response?.results)) return [];

  // Map order is first-seen order, which keeps the API's similarity ranking.
  const byDocument = new Map<string, DocumentHit>();
  for (const raw of response.results) {
    if (!raw || typeof raw !== "object") continue;
    const result = raw as SearchResult;
    const document = result.included?.document;
    const metadata = result.metadata ?? document?.metadata ?? {};

    const threadId = metadata.threadId;
    if (typeof threadId !== "string" || !threadId) continue;
    if (excludeThreadId && threadId === excludeThreadId) continue;

    const text = chunkText(result.chunk);
    if (!text) continue;

    const documentId =
      typeof document?.id === "string"
        ? document.id
        : typeof result.documentId === "string"
          ? result.documentId
          : threadId;

    const hit = byDocument.get(documentId);
    if (hit) {
      if (!hit.parts.includes(text)) hit.parts.push(text);
    } else {
      byDocument.set(documentId, {
        threadId,
        sentAt: sentAtOf(result, metadata),
        parts: [text],
      });
    }
  }

  const hits: SupermemoryChatHit[] = [];
  const seenExcerpts = new Set<string>();
  for (const { threadId, sentAt, parts } of byDocument.values()) {
    const excerpt = excerptOf(parts);
    // Retries re-store near-identical turns under new ids; showing the model
    // the same excerpt twice just burns its context.
    const dupeKey = `${threadId}:${excerpt.toLowerCase()}`;
    if (seenExcerpts.has(dupeKey)) continue;
    seenExcerpts.add(dupeKey);

    hits.push({ threadId, sentAt, excerpt });
  }
  return hits;
}
