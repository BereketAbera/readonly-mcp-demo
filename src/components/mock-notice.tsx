import { FlaskConical } from "lucide-react";

export function MockNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      aria-label="About the data"
      className="flex gap-3 rounded-xl border border-[#f0d28a] bg-warning-soft px-4 py-3 text-sm text-warning"
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="leading-relaxed">
        <strong className="font-semibold">Mocked upstreams, fictional data.</strong>{" "}
        {compact
          ? "Connecteam and ROLLER are in-memory mocks shaped like their public API docs. Every tool result is marked as mock data."
          : "Connecteam and ROLLER are in-memory mocks that follow the request and response shapes in their public developer docs, including their OAuth client-credentials token endpoints. Nothing here has been run against the real APIs, and every tool result is marked as mock data."}
      </p>
    </aside>
  );
}
