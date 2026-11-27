"use client";

import type { ReactNode } from "react";
import { IconArrowUpRight, IconCheck, IconCopy, IconSitemap } from "@tabler/icons-react";

import { showToast } from "@/lib/toasts";
import { useFlash } from "@/lib/use-flash";

export function DiagramHeader({
  title,
  code,
  onOpen,
}: {
  title: string;
  code: string;
  /** Present once there's a drawing worth opening. */
  onOpen?: () => void;
}) {
  const [copied, flashCopied] = useFlash();

  const copy = () => {
    // Wrapped so a missing clipboard (insecure context) lands in the catch.
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(code))
      .then(flashCopied, () => showToast("Couldn’t copy the diagram source."));
  };

  return (
    <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/35 px-3">
      <IconSitemap size={15} className="text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
      <HeaderButton label="Copy diagram source" onClick={copy}>
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </HeaderButton>
      {onOpen && (
        <HeaderButton label="Open diagram in a new tab" onClick={onOpen}>
          <IconArrowUpRight size={14} />
        </HeaderButton>
      )}
    </div>
  );
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
