import { AlertOctagon, AlertTriangle, Info, Lock, Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Announcement, AnnouncementLevel, Audience } from '../../shared/schemas';
import { canEditRole } from '../../shared/visibility';
import { useNow } from '../components/domain';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle, useShell } from '../components/Layout';
import { Badge, Button, EmptyState, ErrorText, Field, IconButton, PageHeader, Segmented, TextArea, TextInput, Toggle } from '../components/ui';
import { errorMessage } from '../lib/api';
import { formatDateTime, formatRelative } from '../lib/format';
import { Markdown } from '../lib/markdown';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

const LEVEL_ICON = { info: Info, important: AlertTriangle, urgent: AlertOctagon } as const;

function AnnouncementCard({ a, isNew, canEdit }: { a: Announcement; isNew: boolean; canEdit: boolean }) {
  const { t, locale } = usePrefs();
  const snapshot = useSnapshot();
  const { mutate } = useData();
  const { toast, confirm } = useFeedback();
  const now = useNow(60_000);
  const Icon = LEVEL_ICON[a.level] ?? Info;
  const created = Date.parse(a.createdAt);

  const remove = async () => {
    const ok = await confirm({ title: t('common.delete'), message: t('common.confirmDelete', { name: a.title }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await mutate((api) => api.del(`/announcements/${a.id}`));
      toast(t('common.deleted'));
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  return (
    <article id={a.id} className={`announcement level-${a.level}${isNew ? ' is-new' : ''}`}>
      <div className="announcement-head">
        <span className="announcement-icon">
          <Icon size={20} />
        </span>
        <div className="grow">
          <h2>{a.title}</h2>
          <div className="announcement-meta">
            <span title={formatDateTime(created, snapshot.trip.timezone, locale)}>{formatRelative(created, now, locale)}</span>
            {a.author && <span>· {a.author}</span>}
            {a.pinned && (
              <Badge tone="accent" icon={<Pin size={12} />}>
                {t('news.pinned')}
              </Badge>
            )}
            {a.audience === 'organizers' && (
              <Badge tone="organizer" icon={<Lock size={12} />}>
                {t('common.organizersOnly')}
              </Badge>
            )}
            {isNew && <Badge tone="info">{t('news.newBadge')}</Badge>}
          </div>
        </div>
        {canEdit && (
          <div className="announcement-actions">
            <IconButton label={t('common.edit')} icon={<Pencil size={18} />} to={`/news/${a.id}/edit`} />
            <IconButton label={t('common.delete')} icon={<Trash2 size={18} />} onClick={remove} />
          </div>
        )}
      </div>
      {a.body && <Markdown source={a.body} />}
    </article>
  );
}

export function NewsPage() {
  const { t } = usePrefs();
  useDocumentTitle(t('news.title'));
  const snapshot = useSnapshot();
  const { role } = useData();
  const { newsSeenAt, markNewsSeen } = useShell();
  const location = useLocation();
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);

  useEffect(() => {
    markNewsSeen();
  }, [snapshot.announcements.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (location.hash) {
      window.setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [location.hash]);

  const items = [...snapshot.announcements].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page news-page">
      <PageHeader title={t('news.title')} actions={canEdit && <IconButton label={t('news.new')} icon={<Plus size={22} />} to="/news/new" />} />
      {items.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={32} />}
          title={t('news.empty')}
          action={canEdit ? <Button variant="primary" to="/news/new" icon={<Plus size={18} />}>{t('news.new')}</Button> : undefined}
        />
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {items.map((a) => (
            <AnnouncementCard key={a.id} a={a} isNew={Date.parse(a.createdAt) > newsSeenAt} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AnnouncementEditPage() {
  const { id } = useParams();
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { role, mutate, me } = useData();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const existing = id ? snapshot.announcements.find((a) => a.id === id) : undefined;
  useDocumentTitle(existing ? t('news.edit') : t('news.new'));

  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [audience, setAudience] = useState<Audience>(existing?.audience ?? 'everyone');
  const [level, setLevel] = useState<AnnouncementLevel>(existing?.level ?? 'info');
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [author, setAuthor] = useState(existing?.author ?? me?.name.split(' ')[0] ?? '');
  const [notify, setNotify] = useState(!existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEditRole(role, snapshot.trip.organizersCanEdit)) {
    return (
      <div className="page">
        <EmptyState title={t('manage.editorOnly')} />
      </div>
    );
  }
  if (id && !existing) {
    return (
      <div className="page">
        <PageHeader title="" back="/news" />
        <EmptyState title={t('common.notFound')} />
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { title, body, audience, level, pinned, author, notify };
    try {
      await mutate((api) => (existing ? api.put(`/announcements/${existing.id}`, payload) : api.post('/announcements', payload)));
      toast(t('common.saved'));
      navigate('/news', { replace: true });
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
      setBusy(false);
    }
  };

  return (
    <div className="page form-page">
      <PageHeader title={existing ? t('news.edit') : t('news.new')} back />
      <form className="form" onSubmit={submit}>
        <Field label={t('news.titleField')} htmlFor="news-title">
          <TextInput id="news-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus={!existing} />
        </Field>
        <Field label={t('news.body')} hint={t('eventForm.markdownHint')} htmlFor="news-body" optional={t('common.optional')}>
          <TextArea id="news-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={4} />
        </Field>
        <Field label={t('news.level')}>
          <Segmented<AnnouncementLevel>
            value={level}
            onChange={setLevel}
            options={[
              { value: 'info', label: t('news.level.info') },
              { value: 'important', label: t('news.level.important') },
              { value: 'urgent', label: t('news.level.urgent') },
            ]}
          />
        </Field>
        <Field label={t('eventForm.audience')}>
          <Segmented<Audience>
            value={audience}
            onChange={setAudience}
            options={[
              { value: 'everyone', label: t('common.everyone') },
              { value: 'organizers', label: t('common.organizersOnly') },
            ]}
          />
        </Field>
        <Field label={t('news.author')} htmlFor="news-author" optional={t('common.optional')}>
          <TextInput id="news-author" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={120} />
        </Field>
        <Toggle checked={pinned} onChange={setPinned} label={t('news.pin')} />
        <div className="notify-box">
          <Toggle checked={notify} onChange={setNotify} label={t('news.notify')} hint={t('news.notifyHint')} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="form-actions sticky">
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
