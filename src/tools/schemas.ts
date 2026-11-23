import { z } from "zod";
import { daysInclusive, MAX_DATE, MAX_RANGE_DAYS, MIN_DATE } from "../core/dates";

// #region date-range
/** A real calendar date in YYYY-MM-DD form, between 2000 and 2099. */
export function isoDate(description: string) {
  return z.iso
    .date()
    .refine((d) => d >= MIN_DATE && d <= MAX_DATE, { message: `Dates must be between ${MIN_DATE} and ${MAX_DATE}` })
    .describe(description);
}

const rangeShape = {
  start: isoDate("First day, venue-local, YYYY-MM-DD (inclusive)."),
  end: isoDate(`Last day, venue-local, YYYY-MM-DD (inclusive). The range may span at most ${MAX_RANGE_DAYS} days.`),
};

type Range = { start: string; end: string };

export function checkRange(value: Range, ctx: z.RefinementCtx): void {
  // Issues sit on the whole input so the message reads as a sentence on its own.
  const issue = (message: string) => ctx.addIssue({ code: "custom", path: [], message });
  if (value.end < value.start) {
    issue("end must be on or after start");
    return;
  }
  const days = daysInclusive(value.start, value.end);
  if (days > MAX_RANGE_DAYS) {
    issue(`Date range is limited to ${MAX_RANGE_DAYS} days per call; ${value.start} to ${value.end} is ${days} days. Split it into smaller ranges.`);
  }
}

/** A tool input with `start` and `end` dates, validated together. */
export function rangeInput<S extends z.ZodRawShape>(extra: S) {
  return z
    .object({ ...rangeShape, ...extra })
    .superRefine((value, ctx) => checkRange(value as Range, ctx));
}
// #endregion date-range
