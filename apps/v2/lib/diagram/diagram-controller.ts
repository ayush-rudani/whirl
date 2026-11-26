"use client";

import type { Mounted } from "pele/lazy";

import { DiagramLoadError } from "./diagram-error";
import { DIAGRAM_OPTIONS, prepare } from "./pele";
import { standaloneSvg } from "./standalone-svg";

export type DiagramStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "failed"; error: unknown };

/* One diagram's lifecycle, kept out of React so the rules are in one place:

   - While the reply streams, the fence is usually half-written. Updates are
     coalesced to one per frame (never cancelled and re-requested per token,
     which could starve a fast stream), and a source that doesn't parse yet
     is skipped so the last good drawing stays up.
   - Once the fence is complete, a source that still won't draw is a real
     failure and gets reported.
   - Pele's mount() owns the canvas element: it re-lays the diagram out when
     the column narrows, redraws once web fonts land, and adds zoom when the
     diagram shrinks to fit. dispose() stops all of that — the frame, the
     observer, the zoom listeners — and must run on unmount. */
export class DiagramController {
  private mounted: Mounted | null = null;
  private status: DiagramStatus = { kind: "loading" };
  private code = "";
  private isIncomplete = true;
  private frame = 0;
  private waiting = false;
  private disposed = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly onStatus: (status: DiagramStatus) => void,
  ) {}

  set(code: string, isIncomplete: boolean) {
    this.code = code;
    this.isIncomplete = isIncomplete;

    if (isIncomplete) {
      this.frame ||= requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
      return;
    }

    /* A finished fence draws now, inside the layout effect, so history and
       remounts paint the diagram on their first frame — no skeleton flash. */
    this.cancelFrame();
    this.draw();
  }

  /** The current drawing as a file that looks right opened on its own. */
  standalone(): string | null {
    const svg = this.mounted?.result?.svg;
    return svg ? standaloneSvg(svg, this.element) : null;
  }

  dispose() {
    this.disposed = true;
    this.cancelFrame();
    this.mounted?.destroy();
    this.mounted = null;
  }

  private draw = () => {
    if (this.disposed) return;
    const { code, isIncomplete } = this;
    const prepared = prepare(code);

    if (prepared.kind === "pending") {
      // One wait at a time; it redraws with whatever the latest source is.
      if (this.waiting) return;
      this.waiting = true;
      prepared.until.then(
        () => {
          this.waiting = false;
          this.draw();
        },
        (cause: unknown) => {
          this.waiting = false;
          if (!this.disposed) this.emit({ kind: "failed", error: new DiagramLoadError(cause) });
        },
      );
      return;
    }

    if (prepared.kind === "invalid") {
      if (!isIncomplete) this.emit({ kind: "failed", error: prepared.error });
      return;
    }

    /* Recovering from a failure: the canvas is hidden while failed, and
       Pele defers drawing into a zero-width element until it's visible
       again, so un-hide it first and let its resize observer catch up. */
    if (this.status.kind === "failed") this.emit({ kind: "ready" });

    let error: unknown;
    try {
      if (this.mounted) {
        this.mounted.update(code);
      } else {
        this.mounted = prepared.pele.mount(this.element, code, {
          ...DIAGRAM_OPTIONS,
          onRender: this.rendered,
        });
      }
      // Parsed, but the drawing itself refused (a semantic or size problem).
      error = this.mounted.error;
    } catch (thrown) {
      // update() rethrows the rare failure that lands after the old drawing
      // was already replaced; it must not take the whole message down.
      error = thrown ?? new Error("Diagram failed to draw");
    }

    if (error !== undefined && !isIncomplete) this.emit({ kind: "failed", error });
  };

  private rendered = () => {
    if (!this.disposed) this.emit({ kind: "ready" });
  };

  private emit(next: DiagramStatus) {
    // Every streamed frame re-renders; only a change of state is news.
    if (next.kind !== "failed" && next.kind === this.status.kind) return;
    this.status = next;
    this.onStatus(next);
  }

  private cancelFrame() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
