import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Stat({ label, value, note, emphasis = false }: { label: string; value: ReactNode; note?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", emphasis && "border-primary/30 bg-accent/60")}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-semibold tracking-tight", emphasis ? "text-3xl text-accent-foreground" : "text-2xl")}>{value}</p>
      {note ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p> : null}
    </div>
  );
}
