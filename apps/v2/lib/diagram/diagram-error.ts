"use client";

import { loadedPele } from "./pele";

export type DiagramFailureReason =
  | "syntax"
  | "semantic"
  | "limit"
  | "unsupported-diagram"
  | "load"
  | "unknown";

/** The renderer, or one of its diagram types, never arrived — a failed
 *  chunk load (offline, or a deploy that retired the old chunks). */
export class DiagramLoadError extends Error {
  constructor(cause: unknown) {
    super("The diagram renderer couldn’t load.", { cause });
    this.name = "DiagramLoadError";
  }
}

export type DiagramFailure = {
  detail: string;
  reason: DiagramFailureReason;
  /** 1-based line the problem is on, or 0 when it has no position. */
  line: number;
  diagramType: string | null;
};

/* Turn whatever stopped a diagram into a sentence for the card. Pele's own
   messages quote the source back, which the card already shows in full, so
   only the semantic ones (model-specific complaints like a merge of a branch
   that was never created) are passed through as written. React renders the
   result as text, so diagram content in a message can't become markup. */
export function describeDiagramError(error: unknown): DiagramFailure {
  const pele = loadedPele();

  if (error instanceof DiagramLoadError || !pele) {
    return {
      detail: "The diagram renderer couldn’t load. Check your connection and refresh the page.",
      reason: "load",
      line: 0,
      diagramType: null,
    };
  }

  if (!(error instanceof pele.PeleError)) {
    return {
      detail: "Something went wrong while drawing this diagram.",
      reason: "unknown",
      line: 0,
      diagramType: null,
    };
  }

  const base = { line: error.line, diagramType: error.type };

  switch (error.code) {
    case "syntax":
      return {
        ...base,
        reason: "syntax",
        detail:
          error.line > 0
            ? `There’s a syntax error on line ${error.line}.`
            : "There’s a syntax error in this diagram.",
      };
    case "semantic":
      return { ...base, reason: "semantic", detail: sentence(error.message) };
    case "limit":
      return { ...base, reason: "limit", detail: "This diagram is too large to draw." };
    default:
      return {
        ...base,
        reason: "unsupported-diagram",
        detail: "This diagram type isn’t supported.",
      };
  }
}

function sentence(message: string): string {
  const first = message.split("\n")[0]?.trim() ?? "";
  if (!first) return "This diagram describes something that can’t be drawn.";
  return /[.!?]$/.test(first) ? first : `${first}.`;
}
