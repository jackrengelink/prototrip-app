import { Check, ChevronRight, Link2, Plus } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Task } from '../../shared/schemas';
import { addDays, todayInTz } from '../../shared/time';
import { isOrganizerRole } from '../../shared/visibility';
import { useNow } from '../components/domain';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle, useShell } from '../components/Layout';
import { Avatar, Badge, Button, EmptyState, IconButton, PageHeader, Segmented, TextInput } from '../components/ui';
import { errorMessage } from '../lib/api';
import { formatDayShort } from '../lib/format';
import { readJson, writeJson } from '../lib/storage';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

export type TaskBucket = 'overdue' | 'today' | 'upcoming' | 'nodate';

export function taskBucket(task: Pick<Task, 'dueDate' | 'done'>, today: string): TaskBucket {
  if (!task.dueDate) return 'nodate';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

type TaskView = 'mine' | 'open' | 'done';

export function TaskRow({ task, today }: { task: Task; today: string }) {
  const { t, locale } = usePrefs();
  const snapshot = useSnapshot();
  const { mutate, meId } = useData();
  const { toast } = useFeedback();
  const [pending, setPending] = useState<boolean | null>(null);
  const done = pending ?? task.done;
  const bucket = taskBucket(task, today);
  const assignees = task.assigneeIds.map((id) => snapshot.people.find((p) => p.id === id)).filter(Boolean) as typeof snapshot.people;
  const event = task.eventId ? snapshot.events.find((e) => e.id === task.eventId) : undefined;
  const doneBy = task.doneBy ? snapshot.people.find((p) => p.id === task.doneBy) : undefined;

  const toggle = async () => {
    const next = !done;
    setPending(next);
    try {
      await mutate((api) => api.patch(`/tasks/${task.id}/done`, { done: next, by: meId ?? undefined }));
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    } finally {
      setPending(null);
    }
  };

  return (
    <li className={`task-row${done ? ' done' : ''} prio-${task.priority}`}>
      <button type="button" className={`task-check${done ? ' on' : ''}`} onClick={toggle} aria-label={done ? `✓ ${task.title}` : task.title} aria-pressed={done}>
        {done && <Check size={16} strokeWidth={3} />}
      </button>
      <Link to={`/tasks/${task.id}`} className="task-main">
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {task.priority === 'high' && !done && <Badge tone="danger">{t('task.prio.high')}</Badge>}
          {task.dueDate && (
            <span className={`task-due ${done ? '' : bucket}`}>
              {task.dueDate === today ? t('common.today') : task.dueDate === addDays(today, 1) ? t('common.tomorrow') : formatDayShort(task.dueDate, locale)}
              {task.dueTime ? ` ${task.dueTime}` : ''}
            </span>
          )}
          {event && (
            <span className="task-event">
              <Link2 size={12} /> {event.title}
            </span>
          )}
          {done && doneBy && <span className="muted">{t('tasks.doneBy', { name: doneBy.name.split(' ')[0] })}</span>}
        </span>
      </Link>
      <span className="task-people">
        {assignees.slice(0, 3).map((p) => (
          <span key={p.id} title={p.name}>
            <Avatar name={p.name} size={26} />
          </span>
        ))}
      </span>
    </li>
  );
}

export function TasksPage() {
  const { t } = usePrefs();
  useDocumentTitle(t('tasks.title'));
  const snapshot = useSnapshot();
  const { role, me, meId, mutate } = useData();
  const { openPicker } = useShell();
  const { toast } = useFeedback();
  const now = useNow(60_000);
  const today = todayInTz(snapshot.trip.timezone, now);
  const amOrganizer = me?.role === 'organizer';
  const [view, setViewState] = useState<TaskView>(() => readJson<TaskView>('taskView', amOrganizer ? 'mine' : 'open'));
  const [quick, setQuick] = useState('');
  const [adding, setAdding] = useState(false);
  const setView = (v: TaskView) => {
    setViewState(v);
    writeJson('taskView', v);
  };

  const tasks = useMemo(() => {
    let list = snapshot.tasks;
    if (view === 'mine') list = list.filter((x) => !x.done && meId && x.assigneeIds.includes(meId));
    else if (view === 'open') list = list.filter((x) => !x.done);
    else list = list.filter((x) => x.done);
    const prioRank = { high: 0, normal: 1, low: 2 } as const;
    return [...list].sort(
      (a, b) =>
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
        (a.dueTime || '99').localeCompare(b.dueTime || '99') ||
        prioRank[a.priority] - prioRank[b.priority] ||
        a.title.localeCompare(b.title),
    );
  }, [snapshot.tasks, view, meId]);

  if (!isOrganizerRole(role)) {
    return (
      <div className="page">
        <EmptyState title={t('common.notFound')} action={<Button to="/">{t('common.goHome')}</Button>} />
      </div>
    );
  }

  const total = snapshot.tasks.length;
  const doneCount = snapshot.tasks.filter((x) => x.done).length;

  const quickAdd = async (e: FormEvent) => {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    setAdding(true);
    try {
      await mutate((api) => api.post('/tasks', { title, assigneeIds: view === 'mine' && meId ? [meId] : [] }));
      setQuick('');
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    } finally {
      setAdding(false);
    }
  };

  const groups: { key: string; label: string; items: Task[] }[] = [];
  if (view === 'done') groups.push({ key: 'done', label: '', items: tasks });
  else {
    const by = (b: TaskBucket) => tasks.filter((x) => taskBucket(x, today) === b);
    groups.push(
      { key: 'overdue', label: t('tasks.overdue'), items: by('overdue') },
      { key: 'today', label: t('tasks.today'), items: by('today') },
      { key: 'upcoming', label: t('tasks.upcoming'), items: by('upcoming') },
      { key: 'nodate', label: t('tasks.noDate'), items: by('nodate') },
    );
  }

  return (
    <div className="page tasks-page">
      <PageHeader title={t('tasks.title')} subtitle={total ? t('tasks.progress', { done: doneCount, total }) : undefined} actions={<IconButton label={t('tasks.newTitle')} icon={<Plus size={22} />} to="/tasks/new" />} />
      {total > 0 && (
        <div className="progress big" aria-hidden>
          <span style={{ width: `${Math.round((doneCount / total) * 100)}%` }} />
        </div>
      )}
      <Segmented<TaskView>
        value={view}
        onChange={setView}
        options={[
          { value: 'mine', label: t('tasks.mine') },
          { value: 'open', label: t('tasks.open') },
          { value: 'done', label: t('tasks.done') },
        ]}
      />

      {view === 'mine' && !amOrganizer && (
        <div className="callout callout-info clickable" onClick={openPicker}>
          <span className="grow">{t('tasks.pickNameFirst')}</span>
          <ChevronRight size={18} />
        </div>
      )}

      {view !== 'done' && (
        <form className="quick-add" onSubmit={quickAdd}>
          <Plus size={18} aria-hidden />
          <TextInput value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t('tasks.quickAdd')} aria-label={t('tasks.quickAdd')} maxLength={200} />
          {quick.trim() && (
            <Button type="submit" size="sm" variant="primary" loading={adding}>
              {t('common.add')}
            </Button>
          )}
        </form>
      )}

      {tasks.length === 0 ? (
        <EmptyState title={t('tasks.empty')} />
      ) : (
        groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.key} className={`task-group task-group-${g.key}`}>
              {g.label && <h2 className="section-title small">{g.label}</h2>}
              <ul className="task-list">
                {g.items.map((task) => (
                  <TaskRow key={task.id} task={task} today={today} />
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
