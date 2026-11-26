"use client";

import { usePeleDiagram } from "@/lib/use-pele-diagram";
import { cn } from "@/lib/utils";
import { DiagramHeader } from "./diagram-header";
import { DiagramSource } from "./diagram-source";

/* A ```mermaid fence drawn as a live diagram card. Colors come from
   app/diagram.css (`.t-diagram`), so theme, accent, and platinum changes
   restyle the drawing without redrawing it. */
export function DiagramCard({
  code,
  isIncomplete,
}: {
  code: string;
  isIncomplete: boolean;
}) {
  const { canvasRef, status, failure, exportSvg } = usePeleDiagram(code, isIncomplete);
  const loading = status === "loading";

  const open = () => {
    const svg = exportSvg();
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    window.open(url, "_blank", "noopener");
    // Long enough for the new tab to read it; the URL is single-use anyway.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="t-diagram my-3 overflow-hidden rounded-xl border border-border">
      <DiagramHeader
        title={failure ? "Diagram couldn’t be drawn" : "Diagram"}
        code={code}
        onOpen={status === "ready" ? open : undefined}
      />
      {failure && <DiagramSource code={code} detail={failure.detail} line={failure.line} />}
      {/* Hidden rather than unmounted on failure: Pele owns the canvas, and
          it should still be there if a later source draws after all. The
          padding lives on the canvas itself and never changes, because Pele
          lays the diagram out to the canvas's content width. */}
      <div className={cn("relative", failure && "hidden")}>
        <div ref={canvasRef} className={cn("t-diagram-canvas p-4", loading && "min-h-28")} />
        {loading && <div className="absolute inset-0 animate-pulse bg-muted/40" />}
      </div>
    </div>
  );
}
