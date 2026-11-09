import { FileDown, Plus, Printer, Search, SlidersHorizontal, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../../shared/categories';
import { toCsv } from '../../shared/csv';
import type { CategoryId, Snapshot } from '../../shared/schemas';
import { todayInTz, tzAbbreviation } from '../../shared/time';
import { canEditRole, isOrganizerRole } from '../../shared/visibility';
import { CategoryIcon, useNow } from '../components/domain';
import { EventCard } from '../components/EventCard';
import { useDocumentTitle } from '../components/Layout';
import { Button, Chip, EmptyState, IconButton, Segmented, TextInput } from '../components/ui';
import { deviceTimeZone, useBuckets, useViews, zoneCity } from '../hooks';
import { formatDayLong, formatDayMonth, formatTime, formatWeekdayShort } from '../lib/format';
import { downloadText, safeFilename } from '../lib/download';
import {
  type AudienceView,
  applyFilter,
  type EventView,
  filterActive,
  type ScheduleFilter,
  tripDayNumber,
  tripDays,
} from '../lib/schedule';
import { readJson, writeJson } from '../lib/storage';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

function useFilter(organizer: boolean, hasMe: boolean) {
  const [filter, setFilter] = useState<ScheduleFilter>(() => {
    const saved = readJson<Partial<ScheduleFilter>>('scheduleFilter', {});
    return {
      audience: organizer ? (saved.audience ?? 'all') : 'all',
      mine: saved.mine ?? (!organizer && hasMe),
      query: '',
      categories: [],
      groups: [],
    };
  });
  const update = (patch: Partial<ScheduleFilter>) => {
    setFilter((prev) => {
      const next = { ...prev, ...patch };
      writeJson('scheduleFilter', { audience: next.audience, mine: next.mine });
      return next;
    });
  };
  return [filter, update] as const;
}

function exportCsv(snapshot: Snapshot) {
  const groupName = (id: string) => snapshot.groups.find((g) => g.id === id)?.name ?? '';
  const personName = (id: string) => snapshot.people.find((p) => p.id === id)?.name ?? '';
  const rows = [
    ['Date', 'Start', 'End', 'End date', 'Title', 'Location', 'Address', 'Category', 'Audience', 'Groups', 'In charge', 'Description', 'Organizer notes', 'Bring', 'Meeting point', 'Cost', 'Link', 'Status', 'Time zone'],
    ...[...snapshot.events]
      .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
      .map((e) => [
        e.date,
        e.startTime ?? '',
        e.endTime ?? '',
        e.endDate ?? '',
        e.title,
        e.location ?? '',
        e.address ?? '',
        e.category,
        e.audience,
        e.groupIds.map(groupName).join(', '),
        e.assigneeIds.map(personName).join(', '),
        e.description ?? '',
        e.organizerNotes ?? '',
        e.bring ?? '',
        e.meetingPoint ?? '',
        e.cost ?? '',
        e.links[0]?.url ?? '',
        e.status,
        e.timezone ?? '',
      ]),
  ];
  downloadText(`${safeFilename(snapshot.trip.name)}-schedule.csv`, '﻿' + toCsv(rows), 'text/csv');
}

export function SchedulePage() {
  const { t, locale } = usePrefs();
  useDocumentTitle(t('schedule.title'));
  const snapshot = useSnapshot();
  const { role, me } = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const now = useNow(30_000);
  const organizer = isOrganizerRole(role);
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);
  const tz = snapshot.trip.timezone;
  const today = todayInTz(tz, now);
  const allViews = useViews();
  const [filter, updateFilter] = useFilter(organizer, !!me);
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const effectiveFilter = { ...filter, mine: filter.mine && !!me };
  const filtered = useMemo(() => applyFilter(allViews, effectiveFilter, role ?? 'participant', me), [allViews, effectiveFilter.audience, effectiveFilter.mine, effectiveFilter.query, effectiveFilter.categories, effectiveFilter.groups, role, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const allBuckets = useBuckets(allViews);
  const buckets = useBuckets(filtered);
  const days = useMemo(() => tripDays(snapshot.trip, allBuckets), [snapshot.trip, allBuckets]);

  const defaultDay = days.includes(today) ? today : days.find((d) => d > today) ?? days[0] ?? 'all';
  const dayParam = params.get('day');
  const searching = !!filter.query.trim();
  const selectedDay = searching ? 'all' : dayParam && (dayParam === 'all' || days.includes(dayParam)) ? dayParam : defaultDay;

  const selectDay = (d: string) => {
    const next = new URLSearchParams(params);
    next.set('day', d);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('.day-chip.on');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedDay]);

  // Swipe left/right to change day.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || selectedDay === 'all') return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const idx = days.indexOf(selectedDay);
    const next = days[idx + (dx < 0 ? 1 : -1)];
    if (next) selectDay(next);
  };

  const visibleDays = selectedDay === 'all' ? [...buckets.keys()] : [selectedDay];
  const totalShown = visibleDays.reduce((n, d) => n + (buckets.get(d)?.timed.length ?? 0) + (buckets.get(d)?.allDay.length ?? 0), 0);

  const deviceTz = deviceTimeZone();
  const showTzNote = deviceTz !== tz && tzAbbreviation(deviceTz, now) !== tzAbbreviation(tz, now);

  const renderDay = (day: string, withHeader: boolean) => {
    const bucket = buckets.get(day);
    const items: EventView[] = bucket ? [...bucket.allDay, ...bucket.timed] : [];
    const dayNo = tripDayNumber(snapshot.trip, day);
    let nowInserted = false;
    return (
      <div key={day} className="day-block">
        {withHeader && (
          <h2 className={`day-heading${day === today ? ' today' : ''}`}>
            <span>{formatDayLong(day, locale)}</span>
            {dayNo && <span className="day-no">{t('schedule.dayN', { n: dayNo })}</span>}
            {day === today && <span className="today-pill">{t('common.today')}</span>}
          </h2>
        )}
        {items.length === 0 ? (
          <p className="muted empty-day">{t('schedule.emptyDay')}</p>
        ) : (
          <div className="event-list">
            {items.map((v, i) => {
              const isTimedToday = day === today && !v.t.allDay && i >= (bucket?.allDay.length ?? 0);
              const showNow = isTimedToday && !nowInserted && v.t.startMs > now;
              if (showNow) nowInserted = true;
              return (
                <Fragment key={`${v.ev.id}-${day}`}>
                  {showNow && (
                    <div className="now-line" aria-label={t('time.now')}>
                      <span>{formatTime(now, tz)}</span>
                    </div>
                  )}
                  <EventCard view={v} tripTz={tz} groups={snapshot.groups} now={now} forDay={day} showOrganizerBadge={organizer} />
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page schedule-page">
      <div className="schedule-top">
        <div className="page-header compact">
          <div className="page-header-text">
            <h1>{t('schedule.title')}</h1>
          </div>
          <div className="page-header-actions">
            <IconButton label={t('common.search')} icon={<Search size={20} />} onClick={() => setShowSearch((s) => !s)} className={showSearch || searching ? 'on' : ''} />
            <IconButton
              label={t('schedule.filters')}
              icon={<SlidersHorizontal size={20} />}
              onClick={() => setShowFilters((s) => !s)}
              className={showFilters || filter.categories.length || filter.groups.length ? 'on' : ''}
            />
            <IconButton
              label={t('common.print')}
              icon={<Printer size={20} />}
              className="hide-mobile"
              onClick={() => {
                selectDay('all');
                window.setTimeout(() => window.print(), 300);
              }}
            />
            {organizer && <IconButton label={t('schedule.export')} icon={<FileDown size={20} />} className="hide-mobile" onClick={() => exportCsv(snapshot)} />}
          </div>
        </div>

        {(showSearch || searching) && (
          <div className="search-box">
            <Search size={18} aria-hidden />
            <TextInput
              autoFocus
              value={filter.query}
              onChange={(e) => updateFilter({ query: e.target.value })}
              placeholder={t('schedule.searchPlaceholder')}
              aria-label={t('common.search')}
              type="search"
            />
            {filter.query && <IconButton label={t('common.clear')} icon={<X size={18} />} onClick={() => updateFilter({ query: '' })} />}
          </div>
        )}

        {(organizer || me) && (
          <div className="schedule-modes">
            {organizer && (
              <Segmented<AudienceView>
                size="sm"
                value={filter.audience}
                onChange={(v) => updateFilter({ audience: v })}
                label={t('eventForm.audience')}
                options={[
                  { value: 'all', label: t('schedule.viewAll') },
                  { value: 'participants', label: t('schedule.viewParticipants') },
                  { value: 'organizers', label: t('schedule.viewOrganizers') },
                ]}
              />
            )}
            {me && (
              <Chip selected={filter.mine} onClick={() => updateFilter({ mine: !filter.mine })}>
                {t('schedule.mine')}
              </Chip>
            )}
          </div>
        )}

        {showFilters && (
          <div className="filter-panel">
            <div className="filter-label">{t('schedule.categories')}</div>
            <div className="chip-row">
              {CATEGORIES.filter((c) => allViews.some((v) => v.ev.category === c.id)).map((c) => (
                <Chip
                  key={c.id}
                  selected={filter.categories.includes(c.id)}
                  icon={<CategoryIcon category={c.id} size={14} />}
                  onClick={() =>
                    updateFilter({
                      categories: filter.categories.includes(c.id) ? filter.categories.filter((x) => x !== c.id) : [...filter.categories, c.id as CategoryId],
                    })
                  }
                >
                  {t(`cat.${c.id}`)}
                </Chip>
              ))}
            </div>
            {snapshot.groups.length > 0 && (
              <>
                <div className="filter-label">{t('schedule.groups')}</div>
                <div className="chip-row">
                  {snapshot.groups.map((g) => (
                    <Chip
                      key={g.id}
                      color={g.color}
                      selected={filter.groups.includes(g.id)}
                      onClick={() => updateFilter({ groups: filter.groups.includes(g.id) ? filter.groups.filter((x) => x !== g.id) : [...filter.groups, g.id] })}
                    >
                      {g.name}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {!searching && days.length > 0 && (
          <div className="day-strip" ref={stripRef} role="tablist">
            <button type="button" role="tab" aria-selected={selectedDay === 'all'} className={`day-chip all${selectedDay === 'all' ? ' on' : ''}`} onClick={() => selectDay('all')}>
              <span className="day-chip-top">{t('common.all')}</span>
              <span className="day-chip-num">∑</span>
            </button>
            {days.map((d) => {
              const n = tripDayNumber(snapshot.trip, d);
              const count = (buckets.get(d)?.timed.length ?? 0) + (buckets.get(d)?.allDay.length ?? 0);
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={selectedDay === d}
                  className={`day-chip${selectedDay === d ? ' on' : ''}${d === today ? ' today' : ''}${count === 0 ? ' empty' : ''}`}
                  onClick={() => selectDay(d)}
                  title={formatDayLong(d, locale)}
                >
                  <span className="day-chip-top">{formatWeekdayShort(d, locale)}</span>
                  <span className="day-chip-num">{formatDayMonth(d, locale).split(' ')[0]}</span>
                  <span className="day-chip-bottom">{n ? t('schedule.dayN', { n }) : formatDayMonth(d, locale).split(' ').slice(1).join(' ')}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="schedule-body" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {filter.mine && me && (
          <p className="filter-note">
            {t('schedule.mineHint')} · <button type="button" className="link-btn inline" onClick={() => updateFilter({ mine: false })}>{t('schedule.viewAll')}</button>
          </p>
        )}
        {allViews.length === 0 ? (
          <EmptyState
            icon={<Plus size={32} />}
            title={t('schedule.empty')}
            action={canEdit ? <Button variant="primary" to="/event/new" icon={<Plus size={18} />}>{t('schedule.addEvent')}</Button> : undefined}
          />
        ) : totalShown === 0 && (filterActive(effectiveFilter) || selectedDay === 'all') ? (
          <EmptyState
            title={t('schedule.noResults')}
            action={
              <Button variant="secondary" onClick={() => updateFilter({ audience: 'all', mine: false, query: '', categories: [], groups: [] })}>
                {t('schedule.clearFilters')}
              </Button>
            }
          />
        ) : selectedDay === 'all' ? (
          visibleDays.map((d) => renderDay(d, true))
        ) : (
          renderDay(selectedDay, true)
        )}
        {showTzNote && <p className="tz-note">{t('time.tzNote', { tz: zoneCity(tz), abbr: tzAbbreviation(tz, now, locale) })}</p>}
      </div>

      {canEdit && (
        <button
          type="button"
          className="fab"
          aria-label={t('schedule.addEvent')}
          onClick={() => navigate(`/event/new${selectedDay !== 'all' ? `?date=${selectedDay}` : ''}`)}
        >
          <Plus size={26} />
        </button>
      )}
    </div>
  );
}
