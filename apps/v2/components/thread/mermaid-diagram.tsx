"use client";

import type { CustomRendererProps } from "streamdown";

import { DiagramCard } from "./diagram/diagram-card";

/* Streamdown's renderer for ```mermaid fences. The fence keeps Mermaid's
   name — that's the syntax models write — but it's drawn by Pele. */
export function MermaidDiagram({ code, isIncomplete }: CustomRendererProps) {
  return <DiagramCard code={code} isIncomplete={isIncomplete} />;
}
