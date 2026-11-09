import { Check, Phone, RotateCcw, Search, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PublicPerson, ScheduleEvent } from '../../shared/schemas';
import { errorMessage } from '../lib/api';
import { formatTime, telHref } from '../lib/format';
import { normalizeText } from '../lib/schedule';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';
import { GroupChips } from './domain';
import { useFeedback } from './feedback';
import { Avatar, Button, Card, Modal, TextInput } from './ui';

/** People expected at an event: participants of its groups, or all participants. */
export function expectedPeople(ev: Pick<ScheduleEvent, 'groupIds'>, people: PublicPerson[]): PublicPerson[] {
  return people
    .filter((p) => p.role === 'participant' && (ev.groupIds.length === 0 || p.groupIds.some((g) => ev.groupIds.includes(g))))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function HeadCountCard({ ev }: { ev: ScheduleEvent }) {
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { mutate, refresh, meId } = useData();
  const { toast, confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const expected = useMemo(() => expectedPeople(ev, snapshot.people), [ev, snapshot.people]);
  const serverChecks = snapshot.checkins?.[ev.id] ?? {};
  const isPresent = (id: string) => pending[id] ?? !!serverChecks[id];
  const presentCount = expected.filter((p) => isPresent(p.id)).length;

  // While the list is open, pick up ticks from other organizers quickly.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  if (!expected.length) return null;

  const toggle = async (person: PublicPerson) => {
    const next = !isPresent(person.id);
    setPending((prev) => ({ ...prev, [person.id]: next }));
    try {
      await mutate((api) => api.post(`/events/${ev.id}/checkins`, { personId: person.id, present: next, by: meId }));
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    } finally {
      setPending((prev) => {
        const copy = { ...prev };
        delete copy[person.id];
        return copy;
      });
    }
  };

  const reset = async () => {
    if (!(await confirm({ title: t('headcount.reset'), message: t('headcount.resetConfirm'), confirmLabel: t('headcount.reset'), danger: true }))) return;
    try {
      await mutate((api) => api.del(`/events/${ev.id}/checkins`));
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  const nq = normalizeText(q.trim());
  const visible = nq ? expected.filter((p) => normalizeText(p.name).includes(nq)) : expected;
  const missing = visible.filter((p) => !isPresent(p.id));
  const here = visible.filter((p) => isPresent(p.id));
  const allHere = presentCount === expected.length;

  return (
    <Card className="headcount-card">
      <div className="card-head">
        <h2 className="card-title">
          <UsersRound size={16} /> {t('headcount.title')}
        </h2>
        <span className={`headcount-number${allHere ? ' all' : ''}`}>
          {presentCount}/{expected.length}
        </span>
      </div>
      <div className="progress" aria-hidden>
        <span style={{ width: `${Math.round((presentCount / expected.length) * 100)}%` }} />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Button size="sm" variant="primary" icon={<Check size={16} />} onClick={() => setOpen(true)}>
          {presentCount ? t('headcount.continue') : t('headcount.start')}
        </Button>
        {presentCount > 0 && (
          <Button size="sm" variant="ghost" icon={<RotateCcw size={16} />} onClick={reset}>
            {t('headcount.reset')}
          </Button>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`${t('headcount.title')} · ${presentCount}/${expected.length}`}>
        <p className="muted small">{allHere ? t('headcount.allHere') : t('headcount.tapHint')}</p>
        <div className="search-box" style={{ marginTop: 10 }}>
          <Search size={18} aria-hidden />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('people.search')} aria-label={t('people.search')} type="search" />
        </div>
        {missing.length > 0 && <h3 className="headcount-heading missing">{t('headcount.missing', { n: missing.length })}</h3>}
        <ul className="headcount-list">
          {missing.map((p) => (
            <li key={p.id}>
              <button type="button" className="headcount-item" onClick={() => toggle(p)}>
                <span className="task-check">{null}</span>
                <Avatar name={p.name} size={30} />
                <span className="grow">
                  <strong>{p.name}</strong>
                  <span className="chips-inline">
                    <GroupChips ids={p.groupIds} groups={snapshot.groups} />
                  </span>
                </span>
              </button>
              {p.phone && (
                <a className="icon-btn icon-btn-subtle" href={telHref(p.phone)} aria-label={`${t('people.call')} ${p.name}`}>
                  <Phone size={18} />
                </a>
              )}
            </li>
          ))}
        </ul>
        {here.length > 0 && <h3 className="headcount-heading">{t('headcount.present', { n: here.length })}</h3>}
        <ul className="headcount-list">
          {here.map((p) => {
            const info = serverChecks[p.id];
            const by = info?.by ? snapshot.people.find((x) => x.id === info.by) : undefined;
            return (
              <li key={p.id} className="is-present">
                <button type="button" className="headcount-item" onClick={() => toggle(p)}>
                  <span className="task-check on">
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <Avatar name={p.name} size={30} />
                  <span className="grow">
                    <strong>{p.name}</strong>
                    {info && (
                      <span className="muted small block">
                        {formatTime(Date.parse(info.at), snapshot.trip.timezone)}
                        {by ? ` · ${by.name.split(' ')[0]}` : ''}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </Card>
  );
}
