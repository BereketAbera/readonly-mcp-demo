import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="space-y-6 pb-10">
      <PageIntro eyebrow="404" title="That page isn't part of the demo">
        The address may be mistyped, or the page may have moved. Everything the demo shows is reachable from these pages:
      </PageIntro>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg" className="h-10 px-4">
          <Link href="/">
            Overview <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-10 px-4">
          <Link href="/tools">Tools</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-10 px-4">
          <Link href="/connect">Connect</Link>
        </Button>
      </div>
    </div>
  );
}
