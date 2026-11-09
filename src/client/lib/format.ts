import { tzAbbreviation, timeInTz } from '../../shared/time';
import type { TFunction } from '../state/prefs';
import type { EventView } from './schedule';

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

/** Noon UTC of a plain date – safe to format with timeZone UTC. */
function dateToUtcNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function formatTime(ms: number, tz: string): string {
  return timeInTz(ms, tz);
}

export function formatDayLong(date: string, locale: string): string {
  return fmt(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dateToUtcNoon(date));
}

export function formatDayShort(date: string, locale: string): string {
  return fmt(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dateToUtcNoon(date));
}

export function formatDayMonth(date: string, locale: string): string {
  return fmt(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dateToUtcNoon(date));
}

export function formatWeekdayShort(date: string, locale: string): string {
  return fmt(locale, { weekday: 'short', timeZone: 'UTC' }).format(dateToUtcNoon(date)).replace('.', '');
}

export function formatDateFull(date: string, locale: string): string {
  return fmt(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dateToUtcNoon(date));
}

export function formatDateRange(start: string | undefined, end: string | undefined, locale: string): string {
  if (!start) return '';
  if (!end || end === start) return fmt(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dateToUtcNoon(start));
  const f = fmt(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  try {
    return (f as Intl.DateTimeFormat & { formatRange(a: Date, b: Date): string }).formatRange(dateToUtcNoon(start), dateToUtcNoon(end));
  } catch {
    return `${f.format(dateToUtcNoon(start))} – ${f.format(dateToUtcNoon(end))}`;
  }
}

export function formatDateTime(ms: number, tz: string, locale: string): string {
  return fmt(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date(ms));
}

export function formatRelative(targetMs: number, nowMs: number, locale: string): string {
  const diff = targetMs - nowMs;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 45_000) return rtf.format(0, 'second');
  if (abs < 60 * 60_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 24 * 60 * 60_000) {
    const hours = diff / 3_600_000;
    return rtf.format(Math.abs(hours) < 3 ? Math.round(hours * 2) / 2 : Math.round(hours), 'hour');
  }
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}

export function dayLabel(date: string, today: string, locale: string, t: TFunction): string {
  if (date === today) return `${t('common.today')} · ${formatDayLong(date, locale)}`;
  return formatDayLong(date, locale);
}

/** Time text for an event row, e.g. "09:30 – 12:00", "All day", "22:00 – 06:00 (next day)". */
export function eventTimeText(view: EventView, opts: { tripTz: string; locale: string; t: TFunction; forDay?: string }): string {
  const { t: tm } = view;
  const { t, locale } = opts;
  const tzSuffix = tm.tz !== opts.tripTz && !tm.allDay ? ` ${tzAbbreviation(tm.tz, tm.startMs, locale)}` : '';
  if (tm.allDay) {
    if (tm.multiDay) return `${t('time.allDay')} · ${t('time.untilDate', { date: formatDayMonth(tm.endDate, locale) })}`;
    return t('time.allDay');
  }
  const start = formatTime(tm.startMs, tm.tz);
  const end = tm.endMs !== null ? formatTime(tm.endMs, tm.tz) : null;
  if (opts.forDay && opts.forDay !== tm.startDate) {
    // Shown on a later day of a multi-day event.
    if (opts.forDay === tm.endDate && end) return `${t('time.continues')} · ${t('time.until', { time: end })}${tzSuffix}`;
    return t('time.continues');
  }
  if (!end) return `${start}${tzSuffix}`;
  if (tm.multiDay) {
    const days = Math.round((Date.parse(`${tm.endDate}T00:00:00Z`) - Date.parse(`${tm.startDate}T00:00:00Z`)) / 86_400_000);
    if (days === 1) return `${start} – ${end} ${t('time.nextDay')}${tzSuffix}`;
    return `${start} – ${formatDayShort(tm.endDate, locale)} ${end}${tzSuffix}`;
  }
  return `${start} – ${end}${tzSuffix}`;
}

export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+') && !digits.startsWith('00')) return null;
  return `https://wa.me/${digits.replace(/^\+|^00/, '')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}
