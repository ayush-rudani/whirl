"use client";

import { useSyncExternalStore } from "react";

/* Reading-column width lives in localStorage under "content-width" and is
   applied as a `data-content-width` attribute on <html>, which globals.css
   turns into `--content-width` for the transcript and the composer dock.
   A blocking inline script in the root layout applies it before first
   paint (lib/boot-scripts.ts); this store is for switching it afterwards.

   The attribute, not storage, is what the hook reports — it's what's on
   screen. Storage can run ahead of it (another tab flipped the pick while
   this one wasn't listening), and the picker must never claim "Wide" over
   a default-width column. */
export type ContentWidth = "default" | "wide";

const KEY = "content-width";
const ATTRIBUTE = "data-content-width";
const CHANGE_EVENT = "whirl:content-width";

function snapshot(): ContentWidth {
  return document.documentElement.getAttribute(ATTRIBUTE) === "wide"
    ? "wide"
    : "default";
}

function apply(width: ContentWidth) {
  const el = document.documentElement;
  if (width === "wide") el.setAttribute(ATTRIBUTE, "wide");
  else el.removeAttribute(ATTRIBUTE);
}

/* Same external-store shape as lib/chat-prefs.ts, so a settings page left
   open in another tab stays in step through the storage event. */
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    apply(event.newValue === "wide" ? "wide" : "default");
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setWidth(next: ContentWidth) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // private mode etc. — the attribute still applies for this visit
  }
  apply(next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useContentWidth() {
  const width = useSyncExternalStore<ContentWidth>(
    subscribe,
    snapshot,
    () => "default",
  );
  return { width, setWidth };
}
