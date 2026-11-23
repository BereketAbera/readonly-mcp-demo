import { ImageResponse } from "next/og";
import { SEED_END, SEED_START } from "@/mock/seed";
import { labour } from "@/lib/demo-client";
import { percent } from "@/lib/format";

export const alt = "Read-only MCP server: Connecteam and ROLLER data for ClickUp's AI, with labour cost as a share of revenue";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function OpengraphImage() {
  const result = await labour(SEED_START, SEED_END, "week");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#f5f6f8",
          color: "#0d1626",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#1a4fc2", fontWeight: 600 }}>Connecteam + ROLLER to ClickUp, read-only</div>
          <div style={{ marginTop: 18, fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
            Staff, roster and revenue data for ClickUp&apos;s AI
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", padding: "28px 36px", background: "#e7eefb", borderRadius: 24 }}>
            <div style={{ fontSize: 96, fontWeight: 700, color: "#143b8f", lineHeight: 1 }}>{percent(result.totals.labourPercent)}</div>
            <div style={{ marginTop: 12, fontSize: 26, color: "#143b8f" }}>labour cost % of net revenue, 4 weeks</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 24, color: "#4a5466" }}>
            <div>Remote MCP server · nine read-only tools</div>
            <div style={{ marginTop: 8 }}>Sample by Bereket A. · fictional data</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
