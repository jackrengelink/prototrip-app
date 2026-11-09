import { ArrowDown, ArrowUp, ChevronRight, Lock, Pencil, Phone, Plus, RotateCcw, Siren, Trash2, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Audience } from '../../shared/schemas';
import { canEditRole } from '../../shared/visibility';
import { useFeedback } from '../components/feedback';
import { useDocumentTitle } from '../components/Layout';
import { Avatar, Button, Card, EmptyState, ErrorText, Field, IconButton, PageHeader, Section, Segmented, TextArea, TextInput } from '../components/ui';
import { errorMessage } from '../lib/api';
import { telHref } from '../lib/format';
import { countChecklistItems, Markdown, useChecklist } from '../lib/markdown';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

export function InfoPage() {
  const { t } = usePrefs();
  useDocumentTitle(t('info.title'));
  const snapshot = useSnapshot();
  const { role, mutate } = useData();
  const { toast } = useFeedback();
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);
  const [reordering, setReordering] = useState(false);
  const pages = snapshot.infoPages;
  const organizers = snapshot.people.filter((p) => p.role === 'organizer');

  const move = async (index: number, dir: -1 | 1) => {
    const ids = pages.map((p) => p.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await mutate((api) => api.post('/info-pages/reorder', { ids }));
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  return (
    <div className="page info-page">
      <PageHeader
        title={t('info.title')}
        actions={
          canEdit && (
            <>
              {pages.length > 1 && <Button size="sm" variant={reordering ? 'primary' : 'ghost'} onClick={() => setReordering((r) => !r)}>{reordering ? t('common.done') : <ArrowDown size={16} />}</Button>}
              <IconButton label={t('info.newPage')} icon={<Plus size={22} />} to="/info/new" />
            </>
          )
        }
      />

      {snapshot.trip.emergencyNumber && (
        <a className="emergency-banner" href={telHref(snapshot.trip.emergencyNumber)}>
          <Siren size={24} />
          <span className="grow">
            <span className="small">{t('info.emergencyNumber')}</span>
            <strong>{snapshot.trip.emergencyNumber}</strong>
          </span>
          <Phone size={20} />
        </a>
      )}

      {pages.length === 0 ? (
        <EmptyState title={t('info.empty')} />
      ) : (
        <ul className="info-list">
          {pages.map((p, i) => (
            <li key={p.id}>
              <Link to={`/info/${p.id}`} className="info-item">
                <span className="info-icon">{p.icon || '📄'}</span>
                <span className="grow">
                  <strong>{p.title}</strong>
                  {p.audience === 'organizers' && (
                    <span className="muted small">
                      {' '}
                      <Lock size={12} /> {t('common.organizersOnly')}
                    </span>
                  )}
                </span>
                {!reordering && <ChevronRight size={18} className="muted" />}
              </Link>
              {reordering && (
                <span className="reorder-buttons">
                  <IconButton label={t('info.moveUp')} icon={<ArrowUp size={18} />} onClick={() => move(i, -1)} disabled={i === 0} />
                  <IconButton label={t('info.moveDown')} icon={<ArrowDown size={18} />} onClick={() => move(i, 1)} disabled={i === pages.length - 1} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {organizers.length > 0 && (
        <Section title={t('info.contacts')} actions={<Link to="/people" className="link-btn"><Users size={16} /> {t('nav.people')}</Link>}>
          <Card>
            <ul className="people-mini">
              {organizers.map((p) => (
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
        </Section>
      )}
    </div>
  );
}

export function InfoPageView() {
  const { id } = useParams();
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { role } = useData();
  const page = snapshot.infoPages.find((p) => p.id === id);
  useDocumentTitle(page?.title ?? t('info.notFound'));
  const checklist = useChecklist(page ? `info-${page.id}` : undefined);
  if (!page) {
    return (
      <div className="page">
        <PageHeader title="" back="/info" />
        <EmptyState title={t('info.notFound')} />
      </div>
    );
  }
  const canEdit = canEditRole(role, snapshot.trip.organizersCanEdit);
  const hasChecklist = countChecklistItems(page.body) > 0;
  return (
    <div className="page info-view">
      <PageHeader
        title={
          <>
            <span className="title-icon">{page.icon || '📄'}</span> {page.title}
          </>
        }
        back="/info"
        actions={canEdit && <IconButton label={t('common.edit')} icon={<Pencil size={20} />} to={`/info/${page.id}/edit`} />}
      />
      {page.audience === 'organizers' && (
        <div className="callout callout-organizer">
          <Lock size={16} /> {t('common.organizersOnly')}
        </div>
      )}
      <Card className="prose-card">
        <Markdown source={page.body} checklist={checklist} />
      </Card>
      {hasChecklist && (
        <p className="muted small center">
          {t('info.checklistNote')}{' '}
          <button
            type="button"
            className="link-btn inline"
            onClick={checklist.reset}
          >
            <RotateCcw size={14} /> {t('info.resetChecklist')}
          </button>
        </p>
      )}
    </div>
  );
}

export function InfoEditPage() {
  const { id } = useParams();
  const { t } = usePrefs();
  const snapshot = useSnapshot();
  const { role, mutate } = useData();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const existing = id ? snapshot.infoPages.find((p) => p.id === id) : undefined;
  useDocumentTitle(existing ? t('info.editPage') : t('info.newPage'));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '📄');
  const [body, setBody] = useState(existing?.body ?? '');
  const [audience, setAudience] = useState<Audience>(existing?.audience ?? 'everyone');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
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
        <PageHeader title="" back="/info" />
        <EmptyState title={t('info.notFound')} />
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = { title, icon, body, audience };
    if (existing) payload.order = existing.order;
    try {
      const res = await mutate((api) => (existing ? api.put(`/info-pages/${existing.id}`, payload) : api.post('/info-pages', payload)));
      toast(t('common.saved'));
      navigate(`/info/${existing?.id ?? res.id}`, { replace: true });
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
      await mutate((api) => api.del(`/info-pages/${existing.id}`));
      toast(t('common.deleted'));
      navigate('/info', { replace: true });
    } catch (err) {
      toast(errorMessage(err, t('common.offline')), 'error');
    }
  };

  return (
    <div className="page form-page">
      <PageHeader title={existing ? t('info.editPage') : t('info.newPage')} back />
      <form className="form" onSubmit={submit}>
        <div className="grid-icon-title">
          <Field label={t('info.icon')} htmlFor="info-icon">
            <TextInput id="info-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={16} className="emoji-input" />
          </Field>
          <Field label={t('info.pageTitle')} htmlFor="info-title">
            <TextInput id="info-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
          </Field>
        </div>
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
        <Field label={t('info.body')} hint={t('info.bodyHint')}>
          <Segmented<'write' | 'preview'>
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'write', label: t('info.write') },
              { value: 'preview', label: t('info.preview') },
            ]}
          />
          {tab === 'write' ? (
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} maxLength={30000} rows={14} className="mono" aria-label={t('info.body')} />
          ) : (
            <Card className="prose-card preview">
              <Markdown source={body} />
            </Card>
          )}
        </Field>
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
