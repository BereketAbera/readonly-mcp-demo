import type { ReactNode } from "react";

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
      {children ? <div className="mt-3 text-base leading-relaxed text-muted-foreground text-pretty">{children}</div> : null}
    </div>
  );
}
