/**
 * Time-zone aware helpers that work in both Node and the browser using only Intl.
 *
 * Events are stored as "wall clock" date + time in a time zone (the trip time zone,
 * or an event-specific override). These helpers convert them to absolute instants
 * so they can be sorted, compared with "now" and exported to calendars correctly.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(ms: number, tz: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(ms))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday] ?? 0,
  };
}

/** Offset (ms) of the time zone from UTC at the given instant. */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Convert a wall-clock date ("2027-03-01") and time ("09:30") in `tz` to a UTC timestamp. */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset1 = tzOffsetMs(guess, tz);
  let utc = guess - offset1;
  const offset2 = tzOffsetMs(utc, tz);
  if (offset2 !== offset1) {
    // We crossed a DST boundary; the second offset is the right one for this wall time.
    utc = guess - offset2;
  }
  return utc;
}

/** "YYYY-MM-DD" of the instant in the given zone. */
export function dateInTz(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:mm" of the instant in the given zone. */
export function timeInTz(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function todayInTz(tz: string, now: number = Date.now()): string {
  return dateInTz(now, tz);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

/** Inclusive list of dates between start and end (max 400 days, as a safety net). */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  for (let i = 0; i <= 400 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Day-of-week (0 = Sunday) for a plain date string. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Short label for a zone at a moment, e.g. "CET" / "GMT+1". */
export function tzAbbreviation(tz: string, ms: number = Date.now(), locale = 'en-GB'): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}

/* ------------------------------------------------------------------ */
/* Event timing                                                        */
/* ------------------------------------------------------------------ */

export interface TimedLike {
  date: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timezone?: string;
}

export interface EventTiming {
  /** Absolute start (for all-day events: midnight at start of first day). */
  startMs: number;
  /** Absolute end, or null for "point in time" events without an end. */
  endMs: number | null;
  allDay: boolean;
  /** Zone used to interpret the wall-clock values. */
  tz: string;
  /** First calendar day (as entered). */
  startDate: string;
  /** Last calendar day the event touches (as entered / derived). */
  endDate: string;
  /** Ends on a later calendar day than it starts. */
  multiDay: boolean;
}

/** A point event (no end time) counts as "happening now" for this long after its start. */
export const POINT_EVENT_WINDOW_MS = 15 * MINUTE;

export function eventTiming(ev: TimedLike, tripTz: string): EventTiming {
  const tz = ev.timezone || tripTz;
  if (!ev.startTime) {
    const endDate = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
    return {
      startMs: zonedToUtc(ev.date, '00:00', tz),
      endMs: zonedToUtc(addDays(endDate, 1), '00:00', tz),
      allDay: true,
      tz,
      startDate: ev.date,
      endDate,
      multiDay: endDate !== ev.date,
    };
  }
  const startMs = zonedToUtc(ev.date, ev.startTime, tz);
  if (!ev.endTime) {
    return { startMs, endMs: null, allDay: false, tz, startDate: ev.date, endDate: ev.date, multiDay: false };
  }
  let endDate = ev.endDate || ev.date;
  // "22:00 – 06:00" without an explicit end date means the event runs overnight.
  if (!ev.endDate && ev.endTime < ev.startTime) endDate = addDays(ev.date, 1);
  const endMs = zonedToUtc(endDate, ev.endTime, tz);
  return { startMs, endMs, allDay: false, tz, startDate: ev.date, endDate, multiDay: endDate !== ev.date };
}

/** Effective end used for "is it happening now?" checks. */
export function effectiveEndMs(t: EventTiming): number {
  if (t.endMs !== null) return t.endMs;
  return t.startMs + POINT_EVENT_WINDOW_MS;
}

export function isHappeningNow(t: EventTiming, now: number): boolean {
  if (t.allDay) return false;
  return t.startMs <= now && now < effectiveEndMs(t);
}

/** Calendar days on which an event should be listed (start day + days it continues on). */
export function eventDays(t: EventTiming): string[] {
  if (!t.multiDay) return [t.startDate];
  if (t.allDay) return dateRange(t.startDate, t.endDate);
  // A timed event that ends exactly at midnight does not really touch the end day.
  const days = dateRange(t.startDate, t.endDate);
  if (t.endMs !== null && timeInTz(t.endMs, t.tz) === '00:00') days.pop();
  return days.length ? days : [t.startDate];
}

export function compareTimings(a: EventTiming, b: EventTiming): number {
  if (a.allDay !== b.allDay && a.startDate === b.startDate) return a.allDay ? -1 : 1;
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  const ae = a.endMs ?? a.startMs;
  const be = b.endMs ?? b.startMs;
  return ae - be;
}

/** Human duration like "1h 30m" / "45m" / "2d 3h". */
export function formatDuration(ms: number, short = true): string {
  const totalMin = Math.max(0, Math.round(ms / MINUTE));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && (!d || !short)) parts.push(`${m}m`);
  if (!parts.length) parts.push('0m');
  return parts.join(' ');
}

export { MINUTE, DAY };
