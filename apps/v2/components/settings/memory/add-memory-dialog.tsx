"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { errorText } from "@/lib/integrations-data";
import { showToast } from "@/lib/toasts";
import { MemoryTextarea } from "./memory-textarea";

/* Write a memory by hand instead of waiting for Whirl to notice it. */
export function AddMemoryDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (content: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const trimmed = draft.trim();

  /* Clear on the way out rather than on the way in, so the next visit opens
     blank without an effect watching `open`. */
  const setOpen = (next: boolean) => {
    if (saving) return; // a dismiss shouldn't strand an in-flight save
    onOpenChange(next);
    if (!next) setDraft("");
  };

  const close = () => setOpen(false);

  const save = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setDraft("");
      onOpenChange(false);
    } catch (error) {
      showToast(errorText(error, "Couldn't save that memory. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a memory</DialogTitle>
          <DialogDescription>
            Whirl will carry this into every chat, same as anything it picks
            up on its own.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3">
          <MemoryTextarea
            value={draft}
            onChange={setDraft}
            onSubmit={() => void save()}
            onCancel={close}
            placeholder="e.g. I'm allergic to shellfish — never suggest it"
            disabled={saving}
          />
        </div>

        <DialogFooter className="items-center">
          <Button variant="ghost" disabled={saving} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!trimmed || saving}
            className="min-w-[88px]"
            onClick={() => void save()}
          >
            {saving ? <Spinner /> : "Remember"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
