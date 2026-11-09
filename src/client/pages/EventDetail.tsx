import {
  AlertTriangle,
  Backpack,
  CalendarPlus,
  Clock,
  Copy,
  ExternalLink,
  Flag,
  Euro,
  ListChecks,
  Lock,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { categoryMeta } from '../../shared/categories';
import { buildIcs } from '../../shared/ics';
import { eventTiming, formatDuration, isHappeningNow, todayInTz } from '../../shared/time';
import { canEditRole, isOrganizerRole } from '../../shared/visibility';
import { CategoryBubble, GroupChips, useNow } from '../components/domain';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle } from '../components/Layout';
import { Avatar, Badge, Button, Card, EmptyState, IconButton, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { downloadText, safeFilename, shareOrCopy } from '../lib/download';
import { eventTimeText, formatDateTime, formatDayLong, formatRelative, mapsUrl, telHref } from '../lib/format';
import { Markdown } from '../lib/markdown';
import { isRecentlyUpdated } from '../lib/schedule';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

export function EventDetailPage() {
  const { id } = useParams();
  const { t, locale } = usePrefs();
  const snapshot = useSnapshot();
  const { role, mutate } = useData();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const ev = snapshot.events.find((e) => e.id === id);
  useDocumentTitle(ev?.title ?? t('event.notFound'));

  if (!ev) {
    return (
      <div className="page">
        <PageHeader title="" back="/schedule" />
        <EmptyState title={t('event.notFound')} action={<Button to="/schedule">{t('nav.schedule')}</Button>} />
      </div>
    );
  }

  const tz = snapshot.trip.timezone;
  const timing = eventTiming(ev, tz);
  const view = { ev, t: timing };
  const meta = categoryMeta(ev.category);
  const organizer = isOrganizerRole(role);
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);
  const live = isHappeningNow(timing, now) && ev.status !== 'cancelled';
  const people = (ids: string[]) => ids.map((pid) => snapshot.people.find((p) => p.id === pid)).filter(Boolean) as typeof snapshot.people;
  const inCharge = people(ev.assigneeIds);
  const tasks = organizer ? snapshot.tasks.filter((x) => x.eventId === ev.id) : [];
  const mapQuery = ev.address || ev.location;
  const today = todayInTz(tz, now);

  const addToCalendar = () => {
    const ics = buildIcs({
      calendarName: snapshot.trip.name,
      tripTimezone: tz,
      events: [ev],
      baseUrl: window.location.origin,
      includeOrganizerNotes: organizer,
      peopleNames: Object.fromEntries(snapshot.people.map((p) => [p.id, p.name])),
      groupNames: Object.fromEntries(snapshot.groups.map((g) => [g.id, g.name])),
    });
    downloadText(`${safeFilename(ev.title)}.ics`, ics, 'text/calendar');
  };

  const share = async () => {
    const res = await shareOrCopy({
      title: ev.title,
      text: `${ev.title} – ${formatDayLong(timing.startDate, locale)} ${eventTimeText(view, { tripTz: tz, locale, t })}`,
      url: window.location.href,
    });
    if (res === 'copied') toast(t('common.copied'));
  };

  const remove = async () => {
    const ok = await confirm({ title: t('common.delete'), message: t('event.deleteConfirm', { name: ev.title }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await mutate((api) => api.del(`/events/${ev.id}`));
      toast(t('common.deleted'));
      navigate(`/schedule?day=${ev.date}`, { replace: true });
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  const duplicate = () => navigate(`/event/new?copy=${ev.id}`);

  return (
    <div className="page event-detail" style={{ '--cat': meta.color } as React.CSSProperties}>
      <PageHeader
        title=""
        back={`/schedule?day=${ev.date}`}
        actions={
          <>
            <IconButton label={t('common.share')} icon={<Share2 size={20} />} onClick={share} />
            {canEdit && <IconButton label={t('common.duplicate')} icon={<Copy size={20} />} onClick={duplicate} />}
            {canEdit && <IconButton label={t('common.edit')} icon={<Pencil size={20} />} to={`/event/${ev.id}/edit`} />}
          </>
        }
      />

      <div className="detail-hero">
        <CategoryBubble category={ev.category} size={52} />
        <div>
          <div className="detail-cat">{t(`cat.${ev.category}`)}</div>
          <h1 className={ev.status === 'cancelled' ? 'strike' : ''}>{ev.title}</h1>
          <div className="detail-badges">
            {live && <Badge tone="accent" icon={<span className="live-dot" />}>{t('time.now')}</Badge>}
            {ev.status === 'cancelled' && <Badge tone="danger">{t('event.cancelled')}</Badge>}
            {ev.status === 'tentative' && <Badge tone="warn">{t('event.tentative')}</Badge>}
            {ev.status !== 'cancelled' && isRecentlyUpdated(ev, now) && <Badge tone="info">{t('event.updated')}</Badge>}
            {ev.audience === 'organizers' && (
              <Badge tone="organizer" icon={<Lock size={12} />}>
                {t('common.organizersOnly')}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {ev.status === 'cancelled' && (
        <div className="callout callout-danger">
          <AlertTriangle size={18} />
          <span>{ev.changeNote || t('event.cancelledBanner')}</span>
        </div>
      )}
      {ev.status === 'tentative' && (
        <div className="callout callout-warn">
          <AlertTriangle size={18} />
          <span>{t('event.tentativeBanner')}</span>
        </div>
      )}
      {ev.changeNote && ev.status !== 'cancelled' && (
        <div className="callout callout-info">
          <AlertTriangle size={18} />
          <span>{ev.changeNote}</span>
        </div>
      )}

      <Card className="detail-facts">
        <div className="fact">
          <Clock size={20} aria-hidden />
          <div>
            <div className="fact-label">{t('event.when')}</div>
            <div className="fact-value">
              {timing.startDate === today ? `${t('common.today')} · ` : ''}
              {formatDayLong(timing.startDate, locale)}
            </div>
            <div className="fact-value strong">{eventTimeText(view, { tripTz: tz, locale, t })}</div>
            {!timing.allDay && timing.endMs !== null && <div className="fact-sub">{formatDuration(timing.endMs - timing.startMs)}</div>}
            {!timing.allDay && timing.startMs > now && ev.status !== 'cancelled' && (
              <div className="fact-sub">{t('time.startsIn', { rel: formatRelative(timing.startMs, now, locale) })}</div>
            )}
          </div>
        </div>
        {(ev.location || ev.address) && (
          <div className="fact">
            <MapPin size={20} aria-hidden />
            <div className="grow">
              <div className="fact-label">{t('event.where')}</div>
              {ev.location && <div className="fact-value strong">{ev.location}</div>}
              {ev.address && <div className="fact-value">{ev.address}</div>}
            </div>
            {mapQuery && (
              <a className="icon-btn icon-btn-subtle" href={mapsUrl(mapQuery)} target="_blank" rel="noopener noreferrer" aria-label={t('event.openMap')} title={t('event.openMap')}>
                <Navigation size={20} />
              </a>
            )}
          </div>
        )}
        {ev.meetingPoint && (
          <div className="fact">
            <Flag size={20} aria-hidden />
            <div>
              <div className="fact-label">{t('event.meetingPoint')}</div>
              <div className="fact-value strong">{ev.meetingPoint}</div>
            </div>
          </div>
        )}
        {ev.bring && (
          <div className="fact">
            <Backpack size={20} aria-hidden />
            <div>
              <div className="fact-label">{t('event.bring')}</div>
              <div className="fact-value">{ev.bring}</div>
            </div>
          </div>
        )}
        {ev.cost && (
          <div className="fact">
            <Euro size={20} aria-hidden />
            <div>
              <div className="fact-label">{t('event.cost')}</div>
              <div className="fact-value">{ev.cost}</div>
            </div>
          </div>
        )}
        {ev.groupIds.length > 0 && (
          <div className="fact">
            <Users size={20} aria-hidden />
            <div>
              <div className="fact-label">{t('event.forGroups')}</div>
              <div className="fact-value chips-inline">
                <GroupChips ids={ev.groupIds} groups={snapshot.groups} />
              </div>
            </div>
          </div>
        )}
      </Card>

      {ev.description && (
        <Card>
          <h2 className="card-title">{t('event.details')}</h2>
          <Markdown source={ev.description} />
        </Card>
      )}

      {organizer && ev.organizerNotes && (
        <Card className="orga-notes">
          <h2 className="card-title">
            <Lock size={16} /> {t('event.organizerNotes')}
          </h2>
          <Markdown source={ev.organizerNotes} />
          <p className="fact-sub">{t('event.organizerNotesHint')}</p>
        </Card>
      )}

      {inCharge.length > 0 && (
        <Card>
          <h2 className="card-title">{t('event.inCharge')}</h2>
          <ul className="people-mini">
            {inCharge.map((p) => (
              <li key={p.id}>
                <Avatar name={p.name} size={32} />
                <span className="grow">
                  <strong>{p.name}</strong>
                  {p.roleTitle && <span className="muted small"> · {p.roleTitle}</span>}
                </span>
                {p.phone && (
                  <a className="icon-btn icon-btn-subtle" href={telHref(p.phone)} aria-label={`${t('people.call')} ${p.name}`}>
                    <Phone size={18} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ev.links.length > 0 && (
        <Card>
          <h2 className="card-title">{t('event.links')}</h2>
          <ul className="link-list">
            {ev.links.map((l, i) => (
              <li key={i}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} /> {l.label || l.url.replace(/^https?:\/\//, '')}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {organizer && (
        <Card>
          <div className="card-head">
            <h2 className="card-title">
              <ListChecks size={16} /> {t('event.relatedTasks')}
            </h2>
            <Button size="sm" variant="ghost" to={`/tasks/new?event=${ev.id}`}>
              {t('event.addTask')}
            </Button>
          </div>
          {tasks.length > 0 && (
            <ul className="mini-tasks">
              {tasks.map((task) => (
                <li key={task.id} className={task.done ? 'done' : ''}>
                  <a href={`/tasks/${task.id}`} onClick={(e) => { e.preventDefault(); navigate(`/tasks/${task.id}`); }}>
                    <span className={`task-dot${task.done ? ' done' : ''}`} />
                    <span className="grow">{task.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="detail-actions">
        <Button icon={<CalendarPlus size={18} />} onClick={addToCalendar}>
          {t('event.addToCalendar')}
        </Button>
        {mapQuery && (
          <Button icon={<Navigation size={18} />} href={mapsUrl(mapQuery)}>
            {t('event.openMap')}
          </Button>
        )}
        {canEdit && (
          <Button variant="ghost" icon={<Trash2 size={18} />} onClick={remove} className="danger-text">
            {t('common.delete')}
          </Button>
        )}
      </div>
      <p className="fact-sub center">{t('event.lastUpdated', { time: formatDateTime(Date.parse(ev.updatedAt), tz, locale) })}</p>
    </div>
  );
}
