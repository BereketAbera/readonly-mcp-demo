import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { NavLinks } from "@/components/nav-links";
import { SITE_NAME } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="border-b bg-card">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex items-center gap-2.5 self-start rounded-md">
          <BrandMark className="size-8 shrink-0" />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">{SITE_NAME}</span>
            <span className="block text-xs text-muted-foreground">Demo server · mocked upstream APIs</span>
          </span>
        </Link>
        <nav aria-label="Main">
          <NavLinks />
        </nav>
      </div>
    </header>
  );
}
