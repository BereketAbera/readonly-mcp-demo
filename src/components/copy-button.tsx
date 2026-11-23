"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Defaults suit dark code surfaces; pass LIGHT_COPY_BUTTON for light ones. */
export const LIGHT_COPY_BUTTON = "border-border bg-card text-foreground hover:bg-muted focus-visible:outline-ring";

export function CopyButton({
  value,
  label = "Copy",
  className,
  ariaLabel,
}: {
  value: string;
  label?: string;
  className?: string;
  /** Accessible name when several copy buttons share a visible label. */
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2 text-xs font-medium text-code-foreground transition-colors hover:bg-white/10 focus-visible:outline-[#8fd3ff]",
        className,
      )}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span>{copied ? "Copied" : label}</span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
