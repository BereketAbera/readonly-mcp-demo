"use client";

import { Play } from "lucide-react";
import { RUN_TOOL_EVENT } from "@/components/run-tool";
import { Button } from "@/components/ui/button";

/** Loads a tool into the "Run a tool" panel and moves focus there. */
export function RunThisTool({ name }: { name: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.dispatchEvent(new CustomEvent(RUN_TOOL_EVENT, { detail: name }))}
      aria-label={`Run this tool: ${name}`}
    >
      <Play aria-hidden /> Run this tool
    </Button>
  );
}
