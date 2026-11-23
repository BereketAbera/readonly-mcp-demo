import { z } from "zod";
import { daysInclusive, MAX_RANGE_DAYS } from "../core/dates";

// #region date-range
const rangeShape = {
  start: z.iso.date().describe("First day, venue-local, YYYY-MM-DD (inclusive)."),
  end: z.iso
    .date()
    .describe(`Last day, venue-local, YYYY-MM-DD (inclusive). The range may span at most ${MAX_RANGE_DAYS} days.`),
};

export function checkRange(value: { start: string; end: string }, ctx: z.RefinementCtx): void {
  if (value.end < value.start) {
    ctx.addIssue({ code: "custom", path: ["end"], message: "end must be on or after start" });
  } else if (daysInclusive(value.start, value.end) > MAX_RANGE_DAYS) {
    ctx.addIssue({ code: "custom", path: ["end"], message: `Date range is limited to ${MAX_RANGE_DAYS} days per call` });
  }
}

/** A tool input with `start` and `end` dates, validated together. */
export function rangeInput<S extends z.ZodRawShape>(extra: S) {
  return z
    .object({ ...rangeShape, ...extra })
    .superRefine((value, ctx) => checkRange(value as { start: string; end: string }, ctx));
}
// #endregion date-range
