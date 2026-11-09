import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Clock,
  MapPin,
  Megaphone,
  Navigation,
  Phone,
  Siren,
  Smartphone,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryMeta } from '../../shared/categories';
import type { Announcement, Snapshot } from '../../shared/schemas';
import { addDays, daysBetween, todayInTz, tzAbbreviation } from '../../shared/time';
import { isOrganizerRole } from '../../shared/visibility';
import { CategoryBubble, useNow } from '../components/domain';
import { EventCard } from '../components/EventCard';
import { useDocumentTitle, useShell } from '../components/Layout';
import { Avatar, Badge, Button, Card, EmptyState, Section } from '../components/ui';
import { deviceTimeZone, useBuckets, useMyViews, zoneCity } from '../hooks';
import { eventTimeText, formatDateRange, formatDayLong, formatRelative, mapsUrl, telHref } from '../lib/format';
import { Markdown } from '../lib/markdown';
import { type EventView, nowAndNext } from '../lib/schedule';
import { canPromptInstall, onInstallChange, promptInstall } from '../lib/install';
import { isIos, isStandalone } from '../lib/push';
import { readJson, writeJson } from '../lib/storage';
import { useData, useSnapshot } from '../state/data';
import { usePrefs, useT } from '../state/prefs';
import { taskBucket } from './Tasks';

function TripHero({ snapshot, today }: { snapshot: Snapshot; today: string }) {
  const { t, locale } = usePrefs();
  const { trip } = snapshot;
  let status: string | null = null;
  if (trip.startDate) {
    const until = daysBetween(today, trip.startDate);
    const end = trip.endDate ?? trip.startDate;
    if (until > 1) status = t('home.startsInDays', { n: until });
    else if (until === 1) status = t('home.startsTomorrow');
    else if (until === 0) status = t('home.startsToday');
    else if (today <= end) status = t('home.dayOf', { n: daysBetween(trip.startDate, today) + 1, total: daysBetween(trip.startDate, end) + 1 });
    else status = t('home.tripOver');
  }
  return (
    <div className="hero">
      <div className="hero-text">
        <h1>{trip.name}</h1>
        {(trip.tagline || trip.destination) && <p className="hero-sub">{trip.tagline || trip.destination}</p>}
        {trip.startDate && (
          <p className="hero-dates">
            <CalendarDays size={16} aria-hidden /> {formatDateRange(trip.startDate, trip.endDate, locale)}
          </p>
        )}
      </div>
      {status && <div className="hero-status">{status}</div>}
    </div>
  );
}

function SetupChecklist({ snapshot }: { snapshot: Snapshot }) {
  const t = useT();
  const [hidden, setHidden] = useState(() => readJson<boolean>('setupHidden', false));
  if (hidden || snapshot.role !== 'admin') return null;
  const steps = [
    { done: !!snapshot.trip.startDate && !!snapshot.trip.endDate, label: t('setup.details'), to: '/manage#trip' },
    { done: snapshot.events.length > 0, label: t('setup.schedule'), to: '/manage#import' },
    { done: snapshot.people.length > 0, label: t('setup.people'), to: '/people' },
    { done: false, label: t('setup.info'), to: '/info' },
    { done: false, label: t('setup.share'), to: '/manage#access' },
  ];
  if (steps[0].done && steps[1].done && steps[2].done) return null;
  return (
    <Card className="setup-card">
      <div className="card-head">
        <h2>{t('setup.title')}</h2>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            writeJson('setupHidden', true);
            setHidden(true);
          }}
        >
          <X size={16} /> {t('setup.dismiss')}
        </button>
      </div>
      <ol className="setup-steps">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? 'done' : ''}>
            <Link to={s.to}>
              {s.done ? <Check size={18} /> : <Circle size={18} />}
              <span>{s.label}</span>
              <ChevronRight size={16} className="muted" />
            </Link>
          </li>
        ))}
      </ol>
      {snapshot.events.length === 0 && (
        <p className="muted small">
          <Link to="/manage#danger">{t('setup.demo')}</Link>
        </p>
      )}
    </Card>
  );
}

function InstallNudge() {
  const t = useT();
  const [hidden, setHidden] = useState(() => readJson<boolean>('installHidden', false) || isStandalone());
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), []);
  if (hidden) return null;
  const hide = () => {
    writeJson('installHidden', true);
    setHidden(true);
  };
  return (
    <Card className="identity-card install-card">
      <Smartphone size={24} className="accent" />
      <div className="grow">
        <strong>{t('me.install')}</strong>
        <p className="muted small">{isIos() ? t('me.installIos') : t('me.installText')}</p>
      </div>
      {canInstall ? (
        <Button size="sm" variant="primary" onClick={() => void promptInstall().then((ok) => ok && hide())}>
          {t('me.installButton')}
        </Button>
      ) : (
        !isIos() && (
          <Button size="sm" variant="ghost" to="/me">
            {t('home.installHow')}
          </Button>
        )
      )}
      <button type="button" className="icon-btn" aria-label={t('setup.dismiss')} onClick={hide}>
        <X size={18} />
      </button>
    </Card>
  );
}

function NowNext({ views, now, snapshot }: { views: EventView[]; now: number; snapshot: Snapshot }) {
  const { t, locale } = usePrefs();
  const { current, next } = nowAndNext(views, now);
  const tz = snapshot.trip.timezone;
  if (!current.length && !next) return null;
  return (
    <div className="now-next">
      {current.map((v) => (
        <Link key={v.ev.id} to={`/event/${v.ev.id}`} className="now-card" style={{ '--cat': categoryMeta(v.ev.category).color } as React.CSSProperties}>
          <div className="now-label">
            <span className="live-dot" /> {t('home.nowTitle')}
          </div>
          <div className="now-main">
            <CategoryBubble category={v.ev.category} size={44} />
            <div>
              <div className="now-title">{v.ev.title}</div>
              <div className="now-meta">
                <Clock size={14} /> {eventTimeText(v, { tripTz: tz, locale, t })}
                {v.t.endMs && <span className="muted"> · {t('time.endsIn', { rel: formatRelative(v.t.endMs, now, locale) })}</span>}
              </div>
              {(v.ev.location || v.ev.meetingPoint) && (
                <div className="now-meta">
                  <MapPin size={14} /> {v.ev.meetingPoint || v.ev.location}
                </div>
              )}
            </div>
          </div>
        </Link>
      ))}
      {next && (
        <Link to={`/event/${next.ev.id}`} className="next-card">
          <div className="now-label next">
            <ArrowRight size={14} /> {t('home.nextTitle')} · {formatRelative(next.t.startMs, now, locale)}
          </div>
          <div className="now-main">
            <CategoryBubble category={next.ev.category} size={40} />
            <div className="grow">
              <div className="now-title">{next.ev.title}</div>
              <div className="now-meta">
                <Clock size={14} /> {eventTimeText(next, { tripTz: tz, locale, t })}
                {next.t.startDate !== todayInTz(tz, now) && <span className="muted"> · {formatDayLong(next.t.startDate, locale)}</span>}
              </div>
              {(next.ev.meetingPoint || next.ev.location) && (
                <div className="now-meta">
                  <MapPin size={14} /> {next.ev.meetingPoint || next.ev.location}
                </div>
              )}
              {next.ev.bring && <div className="now-bring">🎒 {next.ev.bring}</div>}
            </div>
            {(next.ev.address || next.ev.location) && (
              <a
                className="icon-btn icon-btn-subtle"
                href={mapsUrl(next.ev.address || next.ev.location || '')}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('event.openMap')}
                onClick={(e) => e.stopPropagation()}
              >
                <Navigation size={18} />
              </a>
            )}
          </div>
        </Link>
      )}
    </div>
  );
}

function AnnouncementPreview({ items }: { items: Announcement[] }) {
  const { t, locale } = usePrefs();
  const now = useNow(60_000);
  if (!items.length) return null;
  return (
    <Section title={t('home.pinned')} actions={<Link to="/news" className="link-btn">{t('nav.news')} <ChevronRight size={16} /></Link>}>
      <div className="stack" style={{ gap: 8 }}>
        {items.map((a) => (
          <Link key={a.id} to={`/news#${a.id}`} className={`announce-mini level-${a.level}`}>
            <Megaphone size={18} aria-hidden />
            <div>
              <strong>{a.title}</strong>
              <span className="muted small"> · {formatRelative(Date.parse(a.createdAt), now, locale)}</span>
              {a.body && <Markdown source={a.body.split('\n')[0]} className="clamp-2" />}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function MyTasksCard({ snapshot, meId, today }: { snapshot: Snapshot; meId: string | null; today: string }) {
  const t = useT();
  const open = snapshot.tasks.filter((x) => !x.done && (!meId || x.assigneeIds.includes(meId)));
  const sorted = [...open].sort((a, b) => (a.dueDate || '9999') .localeCompare(b.dueDate || '9999') || (a.dueTime || '').localeCompare(b.dueTime || ''));
  return (
    <Section title={meId ? t('home.myTasks') : t('home.openTasks')} actions={<Link to="/tasks" className="link-btn">{t('home.allTasks')} <ChevronRight size={16} /></Link>}>
      {sorted.length === 0 ? (
        <p className="muted">{t('home.noOpenTasks')}</p>
      ) : (
        <ul className="mini-tasks">
          {sorted.slice(0, 5).map((task) => {
            const bucket = taskBucket(task, today);
            return (
              <li key={task.id}>
                <Link to={`/tasks/${task.id}`}>
                  <Circle size={16} className={task.priority === 'high' ? 'danger' : 'muted'} />
                  <span className="grow">{task.title}</span>
                  {bucket === 'overdue' && <Badge tone="danger">{t('tasks.overdue')}</Badge>}
                  {bucket === 'today' && <Badge tone="warn">{t('tasks.today')}</Badge>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function ContactsCard({ snapshot }: { snapshot: Snapshot }) {
  const t = useT();
  const organizers = snapshot.people.filter((p) => p.role === 'organizer' && p.phone);
  const number = snapshot.trip.emergencyNumber;
  if (!number && !organizers.length) return null;
  return (
    <Section title={t('home.emergency')}>
      <Card className="contacts-card">
        {number && (
          <a className="emergency-row" href={telHref(number)}>
            <Siren size={22} />
            <span className="grow">
              <strong>{t('home.callEmergency', { number })}</strong>
            </span>
            <Phone size={18} />
          </a>
        )}
        {organizers.slice(0, 4).map((p) => (
          <a key={p.id} className="contact-row" href={telHref(p.phone!)}>
            <Avatar name={p.name} size={32} />
            <span className="grow">
              <strong>{p.name}</strong>
              {p.roleTitle && <span className="muted small"> · {p.roleTitle}</span>}
            </span>
            <Phone size={18} className="accent" />
          </a>
        ))}
        {organizers.length > 4 && (
          <Link to="/people" className="link-btn">
            {t('home.contactOrganizers')} <ChevronRight size={16} />
          </Link>
        )}
      </Card>
    </Section>
  );
}

export function HomePage() {
  const { t, locale } = usePrefs();
  useDocumentTitle(t('nav.today'));
  const snapshot = useSnapshot();
  const { me, meId, role } = useData();
  const { openPicker, newsSeenAt } = useShell();
  const now = useNow(30_000);
  const views = useMyViews();
  const buckets = useBuckets(views);
  const tz = snapshot.trip.timezone;
  const today = todayInTz(tz, now);
  const organizer = isOrganizerRole(role);

  // Which day to preview: today if there is something, otherwise the next day with events.
  const previewDay = useMemo(() => {
    if (buckets.has(today)) return today;
    const future = [...buckets.keys()].find((d) => d > today);
    return future ?? null;
  }, [buckets, today]);
  const bucket = previewDay ? buckets.get(previewDay) : undefined;
  const previewViews = bucket ? [...bucket.allDay, ...bucket.timed] : [];

  const highlights = snapshot.announcements
    .filter((a) => a.pinned || a.level === 'urgent' || Date.parse(a.createdAt) > newsSeenAt)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  const deviceTz = deviceTimeZone();
  const showTzNote = deviceTz !== tz && tzAbbreviation(deviceTz, now) !== tzAbbreviation(tz, now);

  let previewTitle = t('home.todayTitle');
  if (previewDay && previewDay !== today) {
    if (previewDay === addDays(today, 1)) previewTitle = t('home.tomorrowTitle');
    else if (previewDay === snapshot.trip.startDate) previewTitle = t('home.firstDayTitle', { date: formatDayLong(previewDay, locale) });
    else previewTitle = formatDayLong(previewDay, locale);
  }

  return (
    <div className="page home">
      <TripHero snapshot={snapshot} today={today} />
      <SetupChecklist snapshot={snapshot} />

      {snapshot.people.length > 0 && !me && (
        <Card className="identity-card">
          <UserRound size={24} className="accent" />
          <div className="grow">
            <strong>{t('home.pickName')}</strong>
            <p className="muted small">{t('home.pickNameText')}</p>
          </div>
          <Button size="sm" variant="primary" onClick={openPicker}>
            {t('home.pickNameButton')}
          </Button>
        </Card>
      )}

      <InstallNudge />

      <AnnouncementPreview items={highlights} />

      {snapshot.trip.welcomeMessage && snapshot.trip.startDate && today < snapshot.trip.startDate && (
        <Card className="welcome-card">
          <Markdown source={snapshot.trip.welcomeMessage} />
        </Card>
      )}

      <NowNext views={views} now={now} snapshot={snapshot} />

      <Section
        title={previewTitle}
        actions={
          <Link to={previewDay ? `/schedule?day=${previewDay}` : '/schedule'} className="link-btn">
            {t('home.fullSchedule')} <ChevronRight size={16} />
          </Link>
        }
      >
        {previewViews.length ? (
          <div className="event-list">
            {previewViews.map((v) => (
              <EventCard key={`${v.ev.id}-${previewDay}`} view={v} tripTz={tz} groups={snapshot.groups} now={now} forDay={previewDay ?? undefined} />
            ))}
          </div>
        ) : snapshot.events.length === 0 ? (
          <EmptyState icon={<CalendarDays size={32} />} title={t('home.empty')} />
        ) : (
          <p className="muted">{t('home.noMoreToday')}</p>
        )}
        {showTzNote && <p className="tz-note">{t('time.tzNote', { tz: zoneCity(tz), abbr: tzAbbreviation(tz, now, locale) })}</p>}
      </Section>

      {organizer && <MyTasksCard snapshot={snapshot} meId={meId && me?.role === 'organizer' ? meId : null} today={today} />}

      {snapshot.trip.welcomeMessage && (!snapshot.trip.startDate || today >= snapshot.trip.startDate) && snapshot.events.length === 0 && (
        <Card className="welcome-card">
          <Markdown source={snapshot.trip.welcomeMessage} />
        </Card>
      )}

      <ContactsCard snapshot={snapshot} />
    </div>
  );
}
