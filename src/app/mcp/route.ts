import { handleMcpRequest } from "@/mcp/handler";

// The same framework-neutral handler the Cloudflare Worker uses.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request): Promise<Response> {
  return handleMcpRequest(request, process.env);
}

export { handle as DELETE, handle as GET, handle as POST };
