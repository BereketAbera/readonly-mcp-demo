import { readFileSync } from "node:fs";
import path from "node:path";
import { cn } from "@/lib/utils";

/**
 * The diagram's two layouts, drawn by design/graphics.py (see DESIGN-NOTES.md)
 * and read at build time like the code excerpts. They are inlined rather than
 * loaded as images so their text uses the page's Geist and stays sharp.
 */
function drawing(layout: "wide" | "tall"): string {
  return readFileSync(path.join(process.cwd(), "src/components/diagrams", `one-way-path-${layout}.svg`), "utf8");
}

const SVG_FIT = "[&>svg]:h-auto [&>svg]:w-full [&>svg]:font-sans";

export function OneWayPath({ className }: { className?: string }) {
  return (
    <figure aria-labelledby="one-way-caption" className={className}>
      <div aria-hidden className={cn("hidden lg:block", SVG_FIT)} dangerouslySetInnerHTML={{ __html: drawing("wide") }} />
      <div aria-hidden className={cn("mx-auto max-w-[25rem] lg:hidden", SVG_FIT)} dangerouslySetInnerHTML={{ __html: drawing("tall") }} />
      <figcaption id="one-way-caption" className="sr-only">
        Diagram of the one-way data path. Data starts in the Connecteam (AU) and ROLLER APIs, which are mocked in this demo
        (check 9). It passes the GET-only client, which reads a fixed list of paths and whose only other call is the sign-in
        token request, so every write (POST, PUT, PATCH, DELETE) is stopped there (checks 2, 3 and 8). Then the nine
        read-only tools return named fields only, masked again, with dates checked and 31 days at most, so guest names,
        phone, email, address, birth date, bank, card, TFN, Medicare and medical flags are removed there (checks 1, 4 and
        5). Then the gate checks the bearer token, origin list and rate limit (checks 6 and 7). What reaches ClickUp Brain
        or a Super Agent: staff names, shifts, hours, labour totals, pay as department averages, bookings, products,
        payments and revenue.
      </figcaption>
    </figure>
  );
}
