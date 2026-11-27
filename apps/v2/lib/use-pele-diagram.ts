"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { DiagramController, type DiagramStatus } from "@/lib/diagram/diagram-controller";
import { describeDiagramError } from "@/lib/diagram/diagram-error";
import { ANALYTICS_EVENTS, captureEvent } from "@/lib/posthog";

/* React's end of a diagram: one controller per mounted card, created and
   disposed with it. The canvas element belongs to Pele — React must never
   render children into it. */
export function usePeleDiagram(code: string, isIncomplete: boolean) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<DiagramController | null>(null);
  const [status, setStatus] = useState<DiagramStatus>({ kind: "loading" });

  useLayoutEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const controller = new DiagramController(element, setStatus);
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Declared after the effect above, so the controller exists by now.
  useLayoutEffect(() => {
    controllerRef.current?.set(code, isIncomplete);
  }, [code, isIncomplete]);

  const failure = useMemo(
    () => (status.kind === "failed" ? describeDiagramError(status.error) : null),
    [status],
  );

  useEffect(() => {
    if (!failure) return;
    captureEvent(ANALYTICS_EVENTS.diagramRenderFailed, {
      reason: failure.reason,
      diagramType: failure.diagramType,
    });
  }, [failure]);

  const exportSvg = useCallback(() => controllerRef.current?.standalone() ?? null, []);

  return { canvasRef, status: status.kind, failure, exportSvg };
}
