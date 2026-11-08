/* A doorbell for the composer's model picker. The picker's open state lives
   inside ModelSelect (and should — it is a popover's private business), so
   the palette and the hotkey can't set it directly; they ring this instead
   and whichever picker is actually on screen answers.

   Listeners are the mounted pickers themselves, each removing itself on
   unmount, so the set holds at most the composers that exist right now. */

const listeners = new Set<() => void>();

export function onModelPickerRequest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestModelPicker() {
  for (const listener of listeners) listener();
}
