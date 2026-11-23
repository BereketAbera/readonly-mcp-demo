import { z } from "zod";
import { daysInclusive, MAX_RANGE_DAYS } from "../core/dates";

// #region date-range
const rangeShape = {
  start: z.iso.date().describe("First day, venue-local, YYYY-MM-DD (inclusive)."),
  end: z.iso
    .date()
    .describe(
      `Last day, venue-local, YYYY-MM-DD (inclusive). The range may span at most ${MAX_RANGE_DAYS} days.`,
    ),
};

type Range = { start: string; end: string };

export function checkRange(value: Range, ctx: z.RefinementCtx): void {
  const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["end"], message });
  if (value.end < value.start) {
    issue("end must be on or after start");
  } else if (daysInclusive(value.start, value.end) > MAX_RANGE_DAYS) {
    issue(`Date range is limited to ${MAX_RANGE_DAYS} days per call`);
  }
}

/** A tool input with `start` and `end` dates, validated together. */
export function rangeInput<S extends z.ZodRawShape>(extra: S) {
  return z
    .object({ ...rangeShape, ...extra })
    .superRefine((value, ctx) => checkRange(value as Range, ctx));
}
// #endregion date-range
