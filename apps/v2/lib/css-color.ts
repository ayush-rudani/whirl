/* Shared by every export that serializes live, themed markup into a file
   someone may open anywhere (chart PNGs, standalone diagram SVGs). */

let context: CanvasRenderingContext2D | null = null;

function canvas(): CanvasRenderingContext2D | null {
  context ??= document.createElement("canvas").getContext("2d");
  return context;
}

/* The app's ink is written in oklch, and getComputedStyle hands oklch back
   as oklch — a modern color in a file someone may open in anything. Canvas
   normalizes any color it understands to plain rgb, so the export's colors
   don't depend on what opens it. A color canvas can't parse leaves
   fillStyle untouched, which the sentinel catches: better the original
   value than silently inheriting the last one. */
export function toRgb(color: string): string {
  const scratch = canvas();
  if (!scratch || !color) return color;
  const SENTINEL = "#123456";
  scratch.fillStyle = SENTINEL;
  scratch.fillStyle = color;
  const resolved = scratch.fillStyle;
  return resolved === SENTINEL && color !== SENTINEL ? color : resolved;
}
