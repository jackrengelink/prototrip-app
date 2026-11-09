import { useMemo } from 'react';
import { eventRelevantForPerson } from '../shared/visibility';
import { bucketByDay, type EventView, toViews } from './lib/schedule';
import { useData, useSnapshot } from './state/data';

export function useViews(): EventView[] {
  const snapshot = useSnapshot();
  return useMemo(() => toViews(snapshot.events, snapshot.trip.timezone), [snapshot.events, snapshot.trip.timezone]);
}

/** Events relevant to the chosen person (everything when no person is chosen). */
export function useMyViews(): EventView[] {
  const views = useViews();
  const { me } = useData();
  return useMemo(() => (me ? views.filter((v) => eventRelevantForPerson(v.ev, me)) : views), [views, me]);
}

export function useBuckets(views: EventView[]) {
  return useMemo(() => bucketByDay(views), [views]);
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** Human readable city from an IANA zone, e.g. "Europe/Copenhagen" -> "Copenhagen". */
export function zoneCity(tz: string): string {
  return tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
}
