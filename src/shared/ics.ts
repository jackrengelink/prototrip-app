import type { ScheduleEvent } from './schemas';
import { addDays, eventTiming } from './time';

export interface IcsOptions {
  calendarName: string;
  tripTimezone: string;
  events: ScheduleEvent[];
  /** Base URL of the app (used for links back to the event). */
  baseUrl?: string;
  /** Include organizer-only notes in descriptions. */
  includeOrganizerNotes?: boolean;
  /** Add a reminder this many minutes before each timed event. */
  reminderMinutes?: number;
  /** Map of person id -> name, used to show who is in charge. */
  peopleNames?: Record<string, string>;
  /** Map of group id -> name. */
  groupNames?: Record<string, string>;
  now?: number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function icsUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function icsDate(date: string): string {
  return date.replace(/-/g, '');
}

export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold content lines at 75 octets as required by RFC 5545 (UTF-8 aware). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (currentBytes + b > limit) {
      out.push(current);
      current = '';
      currentBytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    currentBytes += b;
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

export function buildIcs(opts: IcsOptions): string {
  const now = opts.now ?? Date.now();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProtoTrip//Trip Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(opts.calendarName)}`,
    `X-WR-TIMEZONE:${opts.tripTimezone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const ev of opts.events) {
    const t = eventTiming(ev, opts.tripTimezone);
    const summaryPrefix = ev.status === 'cancelled' ? 'CANCELLED: ' : ev.status === 'tentative' ? '(tentative) ' : '';
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@prototrip`);
    lines.push(`DTSTAMP:${icsUtc(now)}`);
    const updated = Date.parse(ev.updatedAt);
    if (!Number.isNaN(updated)) lines.push(`LAST-MODIFIED:${icsUtc(updated)}`);
    const created = Date.parse(ev.createdAt);
    if (!Number.isNaN(created)) lines.push(`CREATED:${icsUtc(created)}`);
    if (t.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(t.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(t.endDate, 1))}`);
    } else {
      lines.push(`DTSTART:${icsUtc(t.startMs)}`);
      if (t.endMs !== null) lines.push(`DTEND:${icsUtc(t.endMs)}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(summaryPrefix + ev.title)}`);
    const location = [ev.location, ev.address].filter(Boolean).join(', ');
    if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);

    const desc: string[] = [];
    if (ev.changeNote) desc.push(`⚠ ${ev.changeNote}`);
    if (ev.description) desc.push(ev.description);
    if (ev.meetingPoint) desc.push(`Meeting point: ${ev.meetingPoint}`);
    if (ev.bring) desc.push(`Bring: ${ev.bring}`);
    if (ev.cost) desc.push(`Cost: ${ev.cost}`);
    if (ev.groupIds.length && opts.groupNames) {
      const names = ev.groupIds.map((g) => opts.groupNames?.[g]).filter(Boolean);
      if (names.length) desc.push(`For: ${names.join(', ')}`);
    }
    if (ev.assigneeIds.length && opts.peopleNames) {
      const names = ev.assigneeIds.map((p) => opts.peopleNames?.[p]).filter(Boolean);
      if (names.length) desc.push(`In charge: ${names.join(', ')}`);
    }
    if (opts.includeOrganizerNotes && ev.organizerNotes) desc.push(`Organizer notes: ${ev.organizerNotes}`);
    for (const link of ev.links) desc.push(`${link.label || 'Link'}: ${link.url}`);
    if (opts.baseUrl) desc.push(`${opts.baseUrl.replace(/\/$/, '')}/event/${ev.id}`);
    if (desc.length) lines.push(`DESCRIPTION:${escapeIcsText(desc.join('\n\n'))}`);
    if (opts.baseUrl) lines.push(`URL:${opts.baseUrl.replace(/\/$/, '')}/event/${ev.id}`);

    const category = ev.category.toUpperCase();
    lines.push(`CATEGORIES:${category}`);
    lines.push(
      `STATUS:${ev.status === 'cancelled' ? 'CANCELLED' : ev.status === 'tentative' ? 'TENTATIVE' : 'CONFIRMED'}`,
    );
    lines.push('TRANSP:' + (t.allDay ? 'TRANSPARENT' : 'OPAQUE'));
    if (opts.reminderMinutes && opts.reminderMinutes > 0 && !t.allDay && ev.status !== 'cancelled') {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeIcsText(ev.title)}`);
      lines.push(`TRIGGER:-PT${Math.round(opts.reminderMinutes)}M`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
