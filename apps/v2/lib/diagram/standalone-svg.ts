"use client";

import { toRgb } from "@/lib/css-color";

/* Every color in a Pele SVG is `var(--pele-*)` with Pele's own defaults as
   the fallback. On the page those resolve through app/diagram.css; in a
   detached file there's no stylesheet, so the diagram would quietly reset to
   Pele's light palette — dark-mode ink on a white tab. The export resolves
   each variable off the live card and writes the result onto the root. */

const SERIES = Array.from({ length: 8 }, (_, index) => `--pele-series-${index + 1}`);

const COLOR_VARS = [
  "--pele-bg",
  "--pele-fg",
  "--pele-fg-on-light",
  "--pele-fg-on-dark",
  "--pele-muted",
  "--pele-line",
  "--pele-surface",
  "--pele-surface-alt",
  "--pele-border",
  "--pele-accent",
  "--pele-critical",
  ...SERIES,
];

/** Pele's SVG output, made to look the same opened on its own. Falls back to
 *  the markup as given if it somehow doesn't parse as SVG. */
export function standaloneSvg(svg: string, scope: Element): string {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || document.querySelector("parsererror")) return svg;

  const computed = window.getComputedStyle(scope);
  const read = (name: string) => computed.getPropertyValue(name).trim();
  const baked = [
    ...COLOR_VARS.flatMap((name) => (read(name) ? [`${name}:${toRgb(read(name))}`] : [])),
    ...(read("--pele-radius") ? [`--pele-radius:${read("--pele-radius")}`] : []),
  ];

  /* Prepended, so the root's own `--_bg:var(--pele-bg,…)` aliases resolve
     against them. The background makes the file readable on any tab. */
  const style = root.getAttribute("style") ?? "";
  root.setAttribute("style", [...baked, style, "background:var(--_bg)"].join(";"));

  return new XMLSerializer().serializeToString(root);
}
