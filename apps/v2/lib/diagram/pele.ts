"use client";

import type { DiagramType, MountOptions } from "pele/lazy";

/* Pele renders ```mermaid fences to SVG. It loads through its lazy entry,
   which pulls in one diagram type at a time on first use — a flowchart costs
   ~58 KB gzipped instead of the whole library. Everything module-level here
   is a single slot or bounded by the number of diagram types, so none of it
   grows over a long session. */

export type Pele = typeof import("pele/lazy");

/* Model-authored diagrams are untrusted input. Images would let a diagram
   make network requests the moment it paints (a prompt-injected reply could
   smuggle conversation text out inside an image URL), and links would
   navigate straight past the app's link-safety dialog. Both stay off. */
export const DIAGRAM_OPTIONS = {
  links: false,
  images: false,
  fontSize: 14,
} satisfies MountOptions;

let loaded: Pele | null = null;
let loading: Promise<Pele> | null = null;

/* Types the lazy entry has no loader for. Remembered so a diagram of that
   type fails once with a clear error instead of retrying the load forever. */
const unavailable = new Set<DiagramType>();

function loadPele(): Promise<Pele> {
  loading ??= import("pele/lazy").then(
    (module) => (loaded = module),
    (error: unknown) => {
      // A failed chunk load (offline, deploy mid-session) can be retried.
      loading = null;
      throw error;
    },
  );
  return loading;
}

export function loadedPele(): Pele | null {
  return loaded;
}

async function loadType(pele: Pele, type: DiagramType): Promise<void> {
  const available = await pele.load(type);
  if (!available) unavailable.add(type);
}

export type Prepared =
  | { kind: "ready"; pele: Pele }
  | { kind: "pending"; until: Promise<unknown> }
  | { kind: "invalid"; error: unknown };

/* Everything short of drawing: make sure the renderer and this diagram's
   type are loaded, then parse. Parsing is ~0.02 ms, cheap enough to run on
   every streamed update, and it's what keeps a half-written diagram from
   ever reaching the canvas. */
export function prepare(code: string): Prepared {
  const pele = loaded;
  if (!pele) return { kind: "pending", until: loadPele() };

  try {
    /* detectType throws too, not just parse: front matter that isn't valid
       YAML (an unclosed quote, tab indents) is a syntax error before the
       type is even known. Uncaught, it would escape the layout effect and
       take the whole thread down with it. */
    const type = pele.detectType(code);
    if (type && !pele.registered(type) && !unavailable.has(type)) {
      return { kind: "pending", until: loadType(pele, type) };
    }

    pele.parse(code);
    return { kind: "ready", pele };
  } catch (error) {
    return { kind: "invalid", error };
  }
}
