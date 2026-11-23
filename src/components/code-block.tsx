import { CopyButton } from "@/components/copy-button";
import { highlight, type TokenKind } from "@/lib/highlight";
import { cn } from "@/lib/utils";

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "",
  comment: "text-[#93a1b8]",
  string: "text-[#9fe0b4]",
  keyword: "text-[#c9b8ff]",
  number: "text-[#ffd08a]",
  type: "text-[#8fd3ff]",
};

export function CodeBlock({
  code,
  caption,
  language = "ts",
  className,
}: {
  code: string;
  caption?: string;
  language?: "ts" | "json" | "bash" | "text";
  className?: string;
}) {
  const tokens = language === "ts" || language === "json" ? highlight(code) : [{ text: code, kind: "plain" as const }];
  return (
    <figure className={cn("overflow-hidden rounded-xl bg-code text-code-foreground", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <figcaption className="truncate font-mono text-xs text-[#aab6c8]">{caption ?? language}</figcaption>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono">
          {tokens.map((t, i) =>
            t.kind === "plain" ? (
              t.text
            ) : (
              <span key={i} className={TOKEN_CLASS[t.kind]}>
                {t.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </figure>
  );
}
