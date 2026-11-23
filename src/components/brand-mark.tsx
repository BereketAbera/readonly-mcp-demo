import { MARK_PATHS } from "@/components/brand-mark-paths";

/**
 * The demo's mark: two sources join, pass a one-way valve (the diode symbol)
 * and leave as one line. Drawn in design/graphics.py; see DESIGN-NOTES.md.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {MARK_PATHS.map(({ d, accent }) => (
        <path key={d} d={d} className={accent ? "fill-primary" : "fill-foreground"} />
      ))}
    </svg>
  );
}
