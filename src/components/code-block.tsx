import { CodeBody } from "@/components/code-body";
import { CopyButton } from "@/components/copy-button";
import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  caption,
  language = "ts",
  className,
  collapseAfter,
}: {
  code: string;
  caption?: string;
  language?: "ts" | "json" | "bash" | "text";
  className?: string;
  /** Collapse excerpts longer than this many lines behind a "Show all" button. */
  collapseAfter?: number;
}) {
  const tokens = language === "ts" || language === "json" ? highlight(code) : [{ text: code, kind: "plain" as const }];
  const label = caption ?? language;
  return (
    <figure className={cn("overflow-hidden rounded-xl bg-code text-code-foreground", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <figcaption className="truncate font-mono text-xs text-[#aab6c8]">{label}</figcaption>
        <CopyButton value={code} label="Copy" />
      </div>
      <CodeBody tokens={tokens} label={`Code: ${label}`} lineCount={code.split("\n").length} collapseAfter={collapseAfter} />
    </figure>
  );
}
