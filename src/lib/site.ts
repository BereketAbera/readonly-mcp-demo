import { DEFAULT_PUBLIC_DEMO_TOKEN, loadConfig } from "@/core/config";

export const SITE_NAME = "Lakeside read-only MCP";

/** The public token for the fictional demo data, shown on the pages on purpose. */
export function publicDemoToken(): string {
  try {
    return loadConfig(process.env).publicDemoToken ?? DEFAULT_PUBLIC_DEMO_TOKEN;
  } catch {
    return DEFAULT_PUBLIC_DEMO_TOKEN;
  }
}

/** Best-known public origin at build time; client components refine it from window.location. */
export function siteOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3202";
}

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/tools", label: "Tools" },
  { href: "/labour-cost", label: "Labour cost" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/connect", label: "Connect" },
] as const;
