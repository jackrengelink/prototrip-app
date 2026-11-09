import { Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Priority } from '../../shared/schemas';
import { isOrganizerRole } from '../../shared/visibility';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle } from '../components/Layout';
import { Button, Chip, EmptyState, ErrorText, Field, PageHeader, Segmented, Select, TextArea, TextInput, Toggle } from '../components/ui';
import { errorMessage } from '../lib/api';
import { formatDayShort } from '../lib/format';
import { toViews } from '../lib/schedule';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

export function TaskEditPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t, locale } = usePrefs();
  const snapshot = useSnapshot();
  const { role, mutate, meId, me } = useData();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const existing = id ? snapshot.tasks.find((x) => x.id === id) : undefined;
  useDocumentTitle(existing ? existing.title : t('tasks.newTitle'));

  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [dueTime, setDueTime] = useState(existing?.dueTime ?? '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(existing?.assigneeIds ?? (me?.role === 'organizer' && meId ? [meId] : []));
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'normal');
  const [eventId, setEventId] = useState(existing?.eventId ?? params.get('event') ?? '');
  const [done, setDone] = useState(existing?.done ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOrganizerRole(role)) {
    return (
      <div className="page">
        <EmptyState title={t('common.notFound')} />
      </div>
    );
  }
  if (id && !existing) {
    return (
      <div className="page">
        <PageHeader title="" back="/tasks" />
        <EmptyState title={t('task.notFound')} action={<Button to="/tasks">{t('tasks.title')}</Button>} />
      </div>
    );
  }

  const organizers = snapshot.people.filter((p) => p.role === 'organizer');
  const events = toViews(snapshot.events, snapshot.trip.timezone);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { title, notes, dueDate, dueTime: dueDate ? dueTime : '', assigneeIds, priority, eventId: eventId || undefined, done };
    try {
      await mutate((api) => (existing ? api.put(`/tasks/${existing.id}`, payload) : api.post('/tasks', payload)));
      toast(t('common.saved'));
      navigate(-1);
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({ title: t('common.delete'), message: t('common.confirmDelete', { name: existing.title }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await mutate((api) => api.del(`/tasks/${existing.id}`));
      toast(t('common.deleted'));
      navigate('/tasks', { replace: true });
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  return (
    <div className="page form-page">
      <PageHeader title={existing ? t('tasks.editTitle') : t('tasks.newTitle')} back />
      <form className="form" onSubmit={submit}>
        <Field label={t('task.title')} htmlFor="task-title">
          <TextInput id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus={!existing} />
        </Field>
        <div className="grid-2">
          <Field label={t('task.dueDate')} htmlFor="task-date" optional={t('common.optional')}>
            <TextInput id="task-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label={t('task.dueTime')} htmlFor="task-time" optional={t('common.optional')}>
            <TextInput id="task-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} />
          </Field>
        </div>
        {organizers.length > 0 && (
          <Field label={t('task.assignees')}>
            <div className="chip-row">
              {organizers.map((p) => (
                <Chip key={p.id} selected={assigneeIds.includes(p.id)} onClick={() => setAssigneeIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        <Field label={t('task.priority')}>
          <Segmented<Priority>
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'low', label: t('task.prio.low') },
              { value: 'normal', label: t('task.prio.normal') },
              { value: 'high', label: t('task.prio.high') },
            ]}
          />
        </Field>
        <Field label={t('task.event')} htmlFor="task-event" optional={t('common.optional')}>
          <Select id="task-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">{t('task.noEvent')}</option>
            {events.map(({ ev }) => (
              <option key={ev.id} value={ev.id}>
                {formatDayShort(ev.date, locale)} {ev.startTime ?? ''} · {ev.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('task.notes')} htmlFor="task-notes" optional={t('common.optional')}>
          <TextArea id="task-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={3000} />
        </Field>
        {existing && <Toggle checked={done} onChange={setDone} label={t('task.isDone')} />}
        <ErrorText>{error}</ErrorText>
        <div className="form-actions sticky">
          {existing && (
            <Button variant="ghost" className="danger-text" icon={<Trash2 size={18} />} onClick={remove}>
              {t('common.delete')}
            </Button>
          )}
          <span className="grow" />
          <Button variant="ghost" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
