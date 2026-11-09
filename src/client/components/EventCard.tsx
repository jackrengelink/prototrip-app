import { AlertTriangle, Lock, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { categoryMeta } from '../../shared/categories';
import type { Group } from '../../shared/schemas';
import { isHappeningNow } from '../../shared/time';
import { eventTimeText } from '../lib/format';
import { type EventView, isRecentlyUpdated, progressOf } from '../lib/schedule';
import { usePrefs } from '../state/prefs';
import { CategoryBubble, GroupChips } from './domain';
import { Badge } from './ui';

interface Props {
  view: EventView;
  tripTz: string;
  groups: Group[];
  now: number;
  forDay?: string;
  showOrganizerBadge?: boolean;
  highlight?: boolean;
  dimPast?: boolean;
}

export function EventCard({ view, tripTz, groups, now, forDay, showOrganizerBadge = true, highlight, dimPast = true }: Props) {
  const { t, locale } = usePrefs();
  const { ev, t: timing } = view;
  const meta = categoryMeta(ev.category);
  const live = isHappeningNow(timing, now) && ev.status !== 'cancelled';
  const end = timing.endMs ?? timing.startMs;
  const past = dimPast && !timing.allDay && end < now && !live;
  const timeText = eventTimeText(view, { tripTz, locale, t, forDay });
  const cancelled = ev.status === 'cancelled';
  const place = ev.location || ev.address;

  return (
    <Link
      to={`/event/${ev.id}`}
      className={`event-card${live ? ' is-live' : ''}${past ? ' is-past' : ''}${cancelled ? ' is-cancelled' : ''}${ev.audience === 'organizers' ? ' is-orga' : ''}${highlight ? ' is-highlight' : ''}`}
      style={{ '--cat': meta.color } as React.CSSProperties}
    >
      <CategoryBubble category={ev.category} size={38} />
      <div className="event-card-body">
        <div className="event-card-time">
          {live && <span className="live-dot" aria-hidden />}
          <span>{timeText}</span>
        </div>
        <div className="event-card-title">{ev.title}</div>
        {place && (
          <div className="event-card-meta">
            <MapPin size={14} aria-hidden />
            <span>{place}</span>
          </div>
        )}
        {ev.changeNote && !cancelled && (
          <div className="event-card-change">
            <AlertTriangle size={14} aria-hidden />
            <span>{ev.changeNote}</span>
          </div>
        )}
        {(cancelled || ev.status === 'tentative' || isRecentlyUpdated(ev, now) || ev.groupIds.length > 0 || (showOrganizerBadge && ev.audience === 'organizers')) && (
          <div className="event-card-badges">
            {cancelled && <Badge tone="danger">{t('event.cancelled')}</Badge>}
            {ev.status === 'tentative' && <Badge tone="warn">{t('event.tentative')}</Badge>}
            {!cancelled && isRecentlyUpdated(ev, now) && <Badge tone="info">{t('event.updated')}</Badge>}
            {showOrganizerBadge && ev.audience === 'organizers' && (
              <Badge tone="organizer" icon={<Lock size={12} />}>
                {t('event.organizerBadge')}
              </Badge>
            )}
            {ev.groupIds.length > 0 && (
              <>
                <Users size={13} aria-hidden className="muted" />
                <GroupChips ids={ev.groupIds} groups={groups} />
              </>
            )}
          </div>
        )}
        {live && (
          <div className="progress" aria-hidden>
            <span style={{ width: `${Math.round(progressOf(view, now) * 100)}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}
