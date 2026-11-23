"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { TokenKind } from "@/lib/highlight";
import { cn } from "@/lib/utils";

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "",
  comment: "text-[#93a1b8]",
  string: "text-[#9fe0b4]",
  keyword: "text-[#c9b8ff]",
  number: "text-[#ffd08a]",
  type: "text-[#8fd3ff]",
};

export function Tokens({ tokens }: { tokens: Array<{ text: string; kind: TokenKind }> }) {
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === "plain" ? (
          t.text
        ) : (
          <span key={i} className={TOKEN_CLASS[t.kind]}>
            {t.text}
          </span>
        ),
      )}
    </>
  );
}

/** A scrollable code area that keyboard users can focus and scroll; long excerpts start collapsed. */
export function CodeBody({
  tokens,
  label,
  lineCount,
  collapseAfter,
}: {
  tokens: Array<{ text: string; kind: TokenKind }>;
  label: string;
  lineCount: number;
  collapseAfter?: number;
}) {
  const collapsible = collapseAfter !== undefined && lineCount > collapseAfter;
  const [open, setOpen] = useState(false);
  const collapsed = collapsible && !open;
  return (
    <div className="relative">
      <pre
        tabIndex={0}
        role="region"
        aria-label={label}
        className={cn(
          "overflow-x-auto p-4 text-[13px] leading-relaxed focus-visible:outline-[#8fd3ff] focus-visible:-outline-offset-2",
          // Whole lines only: 18 lines plus the padding.
          collapsed && "max-h-[calc(18lh+2rem)] overflow-y-hidden",
        )}
      >
        <code className="font-mono">
          <Tokens tokens={tokens} />
        </code>
      </pre>
      {collapsible ? (
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2.5">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/20 bg-[#1b2740] px-2.5 text-xs font-medium text-code-foreground hover:bg-[#24324f] focus-visible:outline-[#8fd3ff]"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            {open ? "Show less" : `Show all ${lineCount} lines`}
          </button>
          {collapsed ? <span className="text-xs text-[#aab6c8]">{lineCount - 18} more lines</span> : null}
        </div>
      ) : null}
    </div>
  );
}
