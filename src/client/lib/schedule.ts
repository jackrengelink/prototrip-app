import type { CategoryId, PublicPerson, PublicTrip, Role, ScheduleEvent } from '../../shared/schemas';
import {
  compareTimings,
  dateRange,
  daysBetween,
  effectiveEndMs,
  eventDays,
  eventTiming,
  type EventTiming,
  isHappeningNow,
} from '../../shared/time';
import { eventRelevantForPerson, isOrganizerRole } from '../../shared/visibility';

export interface EventView {
  ev: ScheduleEvent;
  t: EventTiming;
}

export function toViews(events: ScheduleEvent[], tripTz: string): EventView[] {
  return events
    .map((ev) => ({ ev, t: eventTiming(ev, tripTz) }))
    .sort((a, b) => compareTimings(a.t, b.t) || a.ev.title.localeCompare(b.ev.title));
}

const UPDATED_WINDOW_MS = 48 * 3_600_000;

/** Show an "Updated" badge when an event was edited after it was first published. */
export function isRecentlyUpdated(ev: ScheduleEvent, now: number): boolean {
  const created = Date.parse(ev.createdAt);
  const updated = Date.parse(ev.updatedAt);
  if (Number.isNaN(created) || Number.isNaN(updated)) return false;
  return updated - created > 10 * 60_000 && now - updated < UPDATED_WINDOW_MS;
}

export interface DayBucket {
  date: string;
  /** All-day items and multi-day items that continue on this day. */
  allDay: EventView[];
  timed: EventView[];
}

export function bucketByDay(views: EventView[]): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  const get = (date: string) => {
    let b = map.get(date);
    if (!b) {
      b = { date, allDay: [], timed: [] };
      map.set(date, b);
    }
    return b;
  };
  for (const v of views) {
    const days = eventDays(v.t);
    days.forEach((day, i) => {
      if (v.t.allDay || i > 0) get(day).allDay.push(v);
      else get(day).timed.push(v);
    });
  }
  return new Map([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Days to show as tabs: the trip's date range plus any days with events outside it. */
export function tripDays(trip: Pick<PublicTrip, 'startDate' | 'endDate'>, buckets: Map<string, DayBucket>): string[] {
  const set = new Set<string>(buckets.keys());
  if (trip.startDate && trip.endDate && daysBetween(trip.startDate, trip.endDate) <= 60) {
    for (const d of dateRange(trip.startDate, trip.endDate)) set.add(d);
  }
  return [...set].sort();
}

export function tripDayNumber(trip: Pick<PublicTrip, 'startDate' | 'endDate'>, date: string): number | null {
  if (!trip.startDate) return null;
  const n = daysBetween(trip.startDate, date) + 1;
  if (n < 1) return null;
  if (trip.endDate && date > trip.endDate) return null;
  return n;
}

export function nowAndNext(views: EventView[], now: number): { current: EventView[]; next: EventView | undefined; laterToday: EventView[] } {
  const active = views.filter((v) => v.ev.status !== 'cancelled' && !v.t.allDay);
  const current = active.filter((v) => isHappeningNow(v.t, now));
  const upcoming = active.filter((v) => v.t.startMs > now);
  return { current, next: upcoming[0], laterToday: upcoming.slice(1) };
}

export function progressOf(v: EventView, now: number): number {
  const end = effectiveEndMs(v.t);
  if (end <= v.t.startMs) return 0;
  return Math.min(1, Math.max(0, (now - v.t.startMs) / (end - v.t.startMs)));
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export type AudienceView = 'all' | 'participants' | 'organizers';

export interface ScheduleFilter {
  audience: AudienceView;
  mine: boolean;
  query: string;
  categories: CategoryId[];
  groups: string[];
}

export const EMPTY_FILTER: ScheduleFilter = { audience: 'all', mine: false, query: '', categories: [], groups: [] };

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function filterActive(f: ScheduleFilter): boolean {
  return f.audience !== 'all' || f.mine || !!f.query.trim() || f.categories.length > 0 || f.groups.length > 0;
}

export function applyFilter(views: EventView[], f: ScheduleFilter, role: Role, me: PublicPerson | undefined): EventView[] {
  const q = normalizeText(f.query.trim());
  return views.filter(({ ev }) => {
    if (isOrganizerRole(role)) {
      if (f.audience === 'participants' && ev.audience !== 'everyone') return false;
      if (f.audience === 'organizers' && ev.audience !== 'organizers') return false;
    }
    if (f.mine && me && !eventRelevantForPerson(ev, me)) return false;
    if (f.categories.length && !f.categories.includes(ev.category)) return false;
    if (f.groups.length && !ev.groupIds.some((g) => f.groups.includes(g))) return false;
    if (q) {
      const hay = normalizeText([ev.title, ev.location, ev.address, ev.meetingPoint, ev.description, ev.bring].filter(Boolean).join(' '));
      if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
    }
    return true;
  });
}
