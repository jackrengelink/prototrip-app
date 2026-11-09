import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateInTz,
  dateRange,
  daysBetween,
  eventDays,
  eventTiming,
  formatDuration,
  isHappeningNow,
  timeInTz,
  zonedToUtc,
} from '../../src/shared/time';

describe('zonedToUtc', () => {
  it('converts winter and summer wall-clock times in Amsterdam', () => {
    expect(new Date(zonedToUtc('2027-01-15', '09:30', 'Europe/Amsterdam')).toISOString()).toBe('2027-01-15T08:30:00.000Z');
    expect(new Date(zonedToUtc('2027-07-15', '09:30', 'Europe/Amsterdam')).toISOString()).toBe('2027-07-15T07:30:00.000Z');
  });

  it('handles the days DST starts and ends', () => {
    // Clocks go forward on 28 March 2027 at 02:00 → 03:00.
    expect(new Date(zonedToUtc('2027-03-28', '01:30', 'Europe/Amsterdam')).toISOString()).toBe('2027-03-28T00:30:00.000Z');
    expect(new Date(zonedToUtc('2027-03-28', '03:30', 'Europe/Amsterdam')).toISOString()).toBe('2027-03-28T01:30:00.000Z');
    // Clocks go back on 31 October 2027.
    expect(new Date(zonedToUtc('2027-10-31', '12:00', 'Europe/Amsterdam')).toISOString()).toBe('2027-10-31T11:00:00.000Z');
  });

  it('works for other continents', () => {
    expect(new Date(zonedToUtc('2027-03-01', '18:00', 'Asia/Tokyo')).toISOString()).toBe('2027-03-01T09:00:00.000Z');
    expect(new Date(zonedToUtc('2027-03-01', '18:00', 'America/New_York')).toISOString()).toBe('2027-03-01T23:00:00.000Z');
  });

  it('round-trips through dateInTz / timeInTz', () => {
    const ms = zonedToUtc('2027-05-04', '23:45', 'Europe/Lisbon');
    expect(dateInTz(ms, 'Europe/Lisbon')).toBe('2027-05-04');
    expect(timeInTz(ms, 'Europe/Lisbon')).toBe('23:45');
    expect(dateInTz(ms, 'Europe/Amsterdam')).toBe('2027-05-05');
  });
});

describe('date helpers', () => {
  it('adds days across months and years', () => {
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
  it('counts days and builds ranges', () => {
    expect(daysBetween('2027-03-01', '2027-03-05')).toBe(4);
    expect(dateRange('2027-03-30', '2027-04-02')).toEqual(['2027-03-30', '2027-03-31', '2027-04-01', '2027-04-02']);
  });
  it('formats durations', () => {
    expect(formatDuration(90 * 60_000)).toBe('1h 30m');
    expect(formatDuration(45 * 60_000)).toBe('45m');
  });
});

describe('eventTiming', () => {
  const tz = 'Europe/Amsterdam';

  it('treats an end time before the start as running overnight', () => {
    const t = eventTiming({ date: '2027-03-01', startTime: '22:00', endTime: '06:00' }, tz);
    expect(t.multiDay).toBe(true);
    expect(t.endDate).toBe('2027-03-02');
    expect(t.endMs! - t.startMs).toBe(8 * 3_600_000);
    expect(eventDays(t)).toEqual(['2027-03-01', '2027-03-02']);
  });

  it('makes all-day events span whole days', () => {
    const t = eventTiming({ date: '2027-03-01', endDate: '2027-03-03' }, tz);
    expect(t.allDay).toBe(true);
    expect(eventDays(t)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03']);
  });

  it('does not list an event ending exactly at midnight on the next day', () => {
    const t = eventTiming({ date: '2027-03-01', startTime: '20:00', endTime: '00:00' }, tz);
    expect(eventDays(t)).toEqual(['2027-03-01']);
  });

  it('uses an event time zone override', () => {
    const t = eventTiming({ date: '2027-03-01', startTime: '10:00', timezone: 'Europe/London' }, tz);
    expect(new Date(t.startMs).toISOString()).toBe('2027-03-01T10:00:00.000Z');
  });

  it('knows when an event is happening', () => {
    const t = eventTiming({ date: '2027-03-01', startTime: '10:00', endTime: '11:00' }, tz);
    expect(isHappeningNow(t, t.startMs + 1)).toBe(true);
    expect(isHappeningNow(t, t.endMs!)).toBe(false);
    const point = eventTiming({ date: '2027-03-01', startTime: '10:00' }, tz);
    expect(isHappeningNow(point, point.startMs + 10 * 60_000)).toBe(true);
    expect(isHappeningNow(point, point.startMs + 20 * 60_000)).toBe(false);
  });
});
