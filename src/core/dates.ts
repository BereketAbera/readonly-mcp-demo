/**
 * Date helpers. Every date a tool accepts is a venue-local calendar date
 * (YYYY-MM-DD). Upstream APIs mix local dates and Unix seconds, so the
 * conversions live here and nowhere else.
 */

/** Largest inclusive range any tool will query in one call. */
export const MAX_RANGE_DAYS = 31;

/** Earliest and latest dates any tool accepts. */
export const MIN_DATE = "2000-01-01";
export const MAX_DATE = "2099-12-31";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Calendar arithmetic on YYYY-MM-DD strings, built from UTC parts (never by slicing an ISO timestamp). */
export function addDays(date: string, days: number): string {
  const d = new Date(toUtcMs(date) + days * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Number of calendar days from start to end, counting both ends. */
export function daysInclusive(start: string, end: string): number {
  return Math.round((toUtcMs(end) - toUtcMs(start)) / DAY_MS) + 1;
}

/**
 * Every date from start to end, inclusive. The loop is count-based, so it
 * always ends, and it refuses ranges longer than `limit` days.
 */
export function eachDate(start: string, end: string, limit = MAX_RANGE_DAYS): string[] {
  const count = daysInclusive(start, end);
  if (!Number.isFinite(count) || count <= 0) return [];
  if (count > limit) throw new RangeError(`A range of ${count} days is over the ${limit}-day limit`);
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
  return (new Date(toUtcMs(date)).getUTCDay() + 6) % 7;
}

export function isWeekend(date: string): boolean {
  return weekdayIndex(date) >= 5;
}

/** Monday of the ISO week that contains `date`. */
export function weekStart(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 16 Nov" */
export function dayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${SHORT_DAYS[weekdayIndex(date)]} ${d} ${SHORT_MONTHS[m - 1]}`;
}

/** "16 Nov" */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]}`;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

function zonedParts(unixSeconds: number, timeZone: string) {
  const parts = formatter(timeZone).formatToParts(new Date(unixSeconds * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    seconds: Number(get("second")),
  };
}

/** Venue-local calendar date of a Unix timestamp. */
export function localDate(unixSeconds: number, timeZone: string): string {
  return zonedParts(unixSeconds, timeZone).date;
}

/** Venue-local wall-clock time (HH:mm) of a Unix timestamp. */
export function localTime(unixSeconds: number, timeZone: string): string {
  return zonedParts(unixSeconds, timeZone).time;
}

function offsetSeconds(unixSeconds: number, timeZone: string): number {
  const p = zonedParts(unixSeconds, timeZone);
  const [hh, mm] = p.time.split(":").map(Number);
  const asUtc = toUtcMs(p.date) / 1000 + hh * 3600 + mm * 60 + p.seconds;
  return asUtc - unixSeconds;
}

/** Unix seconds for a venue-local date and time ("HH:mm"). Handles DST zones. */
export function zonedUnix(date: string, time: string, timeZone: string): number {
  const [hh, mm] = time.split(":").map(Number);
  const naive = toUtcMs(date) / 1000 + hh * 3600 + mm * 60;
  let guess = naive - offsetSeconds(naive, timeZone);
  const corrected = naive - offsetSeconds(guess, timeZone);
  if (corrected !== guess) guess = corrected;
  return guess;
}
