import { ArrowDown, ArrowRight, Bot, Database, Lock, ShieldCheck, Wrench } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

function Stage({
  icon: Icon,
  title,
  children,
  tone = "default",
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children: ReactNode;
  tone?: "default" | "mock";
}) {
  return (
    <div
      className={
        tone === "mock"
          ? "rounded-xl border border-dashed border-[#c9a24f] bg-warning-soft/60 p-3.5"
          : "rounded-xl border bg-card p-3.5 shadow-[0_1px_0_rgba(13,22,38,0.04)]"
      }
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" aria-hidden />
        {title}
      </div>
      <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-muted-foreground" aria-hidden>
      <ArrowDown className="size-4 lg:hidden" />
      <ArrowRight className="hidden size-4 lg:block" />
    </div>
  );
}

export function Architecture() {
  return (
    <figure aria-labelledby="arch-title">
      <figcaption id="arch-title" className="sr-only">
        Request path: ClickUp&apos;s AI calls the MCP endpoint, which checks the origin, bearer token and rate limit, runs one of
        nine read-only tools, and reads the mocked Connecteam and ROLLER APIs through GET-only clients.
      </figcaption>
      <div className="grid gap-2 lg:grid-cols-[1fr_auto_1.15fr_auto_1.1fr_auto_1.1fr_auto_1.2fr] lg:items-center">
        <Stage icon={Bot} title="ClickUp AI (MCP client)">
          ClickUp Brain or a Super Agent, connected over Streamable HTTP with its own bearer token.
        </Stage>
        <Arrow />
        <Stage icon={Lock} title="POST /mcp">
          Origin check, bearer token compared in constant time, per-token rate limit, one message per request.
        </Stage>
        <Arrow />
        <Stage icon={Wrench} title="9 read-only tools">
          Zod-validated inputs with a 31-day cap. Personal fields removed from results.
        </Stage>
        <Arrow />
        <Stage icon={ShieldCheck} title="GET-only clients">
          Fixed path allowlists. OAuth client-credentials tokens cached until expiry.
        </Stage>
        <Arrow />
        <div className="grid gap-2">
          <Stage icon={Database} title="Connecteam API (mocked)" tone="mock">
            AU region: staff, shifts, time clock, pay rates.
          </Stage>
          <Stage icon={Database} title="ROLLER API (mocked)" tone="mock">
            REST and Reporting APIs, with an endpoint-scoped key.
          </Stage>
        </div>
      </div>
    </figure>
  );
}
