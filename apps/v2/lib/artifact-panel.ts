"use client";

import { useSyncExternalStore } from "react";

/* Which artifact (document or full HTML page) the side panel is showing,
   plus its desktop fullscreen state, as a tiny module-level store (mirrors
   lib/toasts.ts) — the cards that open it and the panel that renders it
   live in different corners of the thread face. */

export type ArtifactPanelTarget =
  { kind: "document"; documentId: string } | { kind: "html"; htmlId: string };

type PanelState = {
  target: ArtifactPanelTarget | null;
  /** Desktop only: the panel fills the content area and the chat hides.
   *  Reset whenever the panel closes. */
  fullscreen: boolean;
};

let state: PanelState = { target: null, fullscreen: false };
const listeners = new Set<() => void>();

/* Artifacts that already auto-opened once (or were opened deliberately) —
   a fresh create pops the panel so the user watches it being written, but
   only the first time; closing it mid-stream must stick. */
const autoOpened = new Set<string>();

function set(next: PanelState) {
  state = next;
  for (const listener of listeners) listener();
}

export function openDocumentPanel(documentId: string) {
  autoOpened.add(documentId);
  set({ ...state, target: { kind: "document", documentId } });
}

export function openHtmlPanel(htmlId: string) {
  autoOpened.add(htmlId);
  set({ ...state, target: { kind: "html", htmlId } });
}

/* An artifact asked for from another thread (the palette's Artifacts list).
   Hopping threads closes the panel, so it can't just open now — it waits
   here until the chat face lands on its thread (settleArtifactPanel). One
   slot: a newer request replaces an older one that never landed. */
let queued: { threadId: string; target: ArtifactPanelTarget } | null = null;

/** Opens an artifact in its own thread: right away if that thread is the one
 *  showing, otherwise once `navigate` has taken the chat face there. */
export function openArtifactInThread(
  threadId: string,
  target: ArtifactPanelTarget,
  { currentThreadId, navigate }: {
    currentThreadId: string | null;
    navigate: (threadId: string) => void;
  },
) {
  if (currentThreadId === threadId) {
    queued = null;
    set({ ...state, target });
    autoOpened.add(target.kind === "document" ? target.documentId : target.htmlId);
    return;
  }
  queued = { threadId, target };
  navigate(threadId);
}

/** The chat face calls this whenever its thread changes: the panel belongs
 *  to the conversation that opened it, so it closes — unless an artifact
 *  was queued for exactly this thread, which opens instead. */
export function settleArtifactPanel(threadId: string | null) {
  const next = queued !== null && queued.threadId === threadId ? queued : null;
  queued = null;
  if (next) {
    const { target } = next;
    autoOpened.add(target.kind === "document" ? target.documentId : target.htmlId);
    set({ target, fullscreen: false });
    return;
  }
  closeArtifactPanel();
}

export function closeArtifactPanel() {
  if (state.target === null && !state.fullscreen) return;
  set({ target: null, fullscreen: false });
}

export function toggleArtifactFullscreen() {
  set({ ...state, fullscreen: !state.fullscreen });
}

export function autoOpenStreamingDocument(documentId: string) {
  if (autoOpened.has(documentId)) return;
  openDocumentPanel(documentId);
}

export function autoOpenStreamingHtml(htmlId: string) {
  if (autoOpened.has(htmlId)) return;
  openHtmlPanel(htmlId);
}

const CLOSED: PanelState = { target: null, fullscreen: false };

export function useArtifactPanel(): PanelState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => state,
    () => CLOSED,
  );
}
