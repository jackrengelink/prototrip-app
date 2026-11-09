import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  eventTemplateCsv,
  importEventsFromRows,
  importPeopleFromRows,
  parseCsv,
  peopleTemplateCsv,
  type EventImportResult,
  type PeopleImportResult,
  type RowIssue,
} from '../../shared/csv';
import { useFeedback } from '../components/feedback';
import { Badge, Button, ErrorText, Segmented, TextArea } from '../components/ui';
import { errorMessage } from '../lib/api';
import { downloadText, readFileAsText } from '../lib/download';
import { formatDayShort } from '../lib/format';
import { useData, useSnapshot } from '../state/data';
import { usePrefs } from '../state/prefs';

function Issues({ title, items, tone }: { title: string; items: RowIssue[]; tone: 'danger' | 'warn' }) {
  const { t } = usePrefs();
  if (!items.length) return null;
  return (
    <div className={`import-issues ${tone}`}>
      <strong>
        <AlertTriangle size={16} /> {title}
      </strong>
      <ul>
        {items.slice(0, 12).map((x, i) => (
          <li key={i}>
            <span className="muted">{t('import.row', { n: x.row })}:</span> {x.message}
          </li>
        ))}
        {items.length > 12 && <li>…</li>}
      </ul>
    </div>
  );
}

function SourceInput({ text, setText }: { text: string; setText(v: string): void }) {
  const { t } = usePrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useFeedback();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (/\.xlsx?$/i.test(file.name)) {
              toast('Excel: File → Save as / Download → CSV', 'info');
              return;
            }
            setText(await readFileAsText(file));
            e.target.value = '';
          }}
        />
        <Button icon={<Upload size={18} />} onClick={() => fileRef.current?.click()}>
          {t('import.chooseFile')}
        </Button>
      </div>
      <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('import.paste')} rows={5} autoGrow={false} className="mono small" aria-label={t('import.paste')} />
    </div>
  );
}

export function ScheduleImport() {
  const { t, locale } = usePrefs();
  const snapshot = useSnapshot();
  const { mutate } = useData();
  const { toast, confirm } = useFeedback();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);
  const fallbackYear = Number((snapshot.trip.startDate ?? new Date().toISOString()).slice(0, 4));

  const result: EventImportResult | null = useMemo(() => (text.trim() ? importEventsFromRows(parseCsv(text), { fallbackYear }) : null), [text, fallbackYear]);

  const run = async () => {
    if (!result || !result.events.length) return;
    if (mode === 'replace' && !(await confirm({ title: t('import.modeReplace'), message: t('import.replaceConfirm'), confirmLabel: t('import.run'), danger: true }))) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await mutate((api) => api.post<{ imported: number; createdGroups: string[]; unknownPeople: string[] }>('/events/import', { events: result.events, mode }));
      const lines = [t('import.done', { n: res.imported })];
      if (res.createdGroups.length) lines.push(t('import.createdGroups', { names: res.createdGroups.join(', ') }));
      if (res.unknownPeople.length) lines.push(t('import.unknownPeople', { names: res.unknownPeople.join(', ') }));
      setSummary(lines);
      toast(lines[0]);
      setText('');
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-box">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3>
          <FileSpreadsheet size={18} /> {t('import.scheduleTitle')}
        </h3>
        <Button size="sm" variant="ghost" onClick={() => downloadText('prototrip-schedule-template.csv', '﻿' + eventTemplateCsv(), 'text/csv')}>
          {t('import.template')}
        </Button>
      </div>
      <p className="muted small">{t('import.text')}</p>
      <p className="muted small">{t('import.tips')}</p>
      <SourceInput text={text} setText={setText} />
      {result && (
        <div className="import-preview">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={result.events.length ? 'success' : 'neutral'} icon={<CheckCircle2 size={12} />}>
              {t('import.ready', { n: result.events.length })}
            </Badge>
            {result.errors.length > 0 && <Badge tone="danger">{t('import.problems', { n: result.errors.length })}</Badge>}
            {result.warnings.length > 0 && <Badge tone="warn">{t('import.warnings', { n: result.warnings.length })}</Badge>}
          </div>
          {result.recognizedColumns.length > 0 && <p className="muted small">{t('import.columns', { cols: result.recognizedColumns.join(', ') })}</p>}
          {result.ignoredColumns.length > 0 && <p className="muted small">{t('import.ignored', { cols: result.ignoredColumns.join(', ') })}</p>}
          <Issues title={t('import.problems', { n: result.errors.length })} items={result.errors} tone="danger" />
          <Issues title={t('import.warnings', { n: result.warnings.length })} items={result.warnings} tone="warn" />
          {result.events.length > 0 && (
            <div className="table-wrap">
              <table className="preview-table">
                <tbody>
                  {result.events.slice(0, 8).map((e, i) => (
                    <tr key={i}>
                      <td>{formatDayShort(e.date, locale)}</td>
                      <td>{e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : t('time.allDay')}</td>
                      <td>
                        <strong>{e.title}</strong>
                        {e.audience === 'organizers' && <span className="muted"> · {t('event.organizerBadge')}</span>}
                        {e.groupNames.length > 0 && <span className="muted"> · {e.groupNames.join(', ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.events.length > 8 && <p className="muted small">+ {result.events.length - 8}</p>}
            </div>
          )}
          <Segmented<'append' | 'replace'>
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'append', label: t('import.modeAppend') },
              { value: 'replace', label: t('import.modeReplace') },
            ]}
          />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" onClick={run} loading={busy} disabled={!result.events.length || result.errors.length > 0}>
            {t('import.run')} ({result.events.length})
          </Button>
        </div>
      )}
      {summary && (
        <div className="callout callout-success">
          <CheckCircle2 size={18} />
          <div>
            {summary.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PeopleImport() {
  const { t } = usePrefs();
  const { mutate } = useData();
  const { toast, confirm } = useFeedback();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result: PeopleImportResult | null = useMemo(() => (text.trim() ? importPeopleFromRows(parseCsv(text)) : null), [text]);

  const run = async () => {
    if (!result || !result.people.length) return;
    if (mode === 'replace' && !(await confirm({ title: t('import.modeReplacePeople'), message: t('import.replaceConfirm'), confirmLabel: t('import.run'), danger: true }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await mutate((api) => api.post<{ added: number; updated: number; createdGroups: string[] }>('/people/import', { people: result.people, mode }));
      toast(t('import.done', { n: res.added + res.updated }));
      setText('');
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-box" id="import-people">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3>
          <FileSpreadsheet size={18} /> {t('import.peopleTitle')}
        </h3>
        <Button size="sm" variant="ghost" onClick={() => downloadText('prototrip-people-template.csv', '﻿' + peopleTemplateCsv(), 'text/csv')}>
          {t('import.template')}
        </Button>
      </div>
      <p className="muted small">{t('import.text')}</p>
      <SourceInput text={text} setText={setText} />
      {result && (
        <div className="import-preview">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={result.people.length ? 'success' : 'neutral'}>{t('import.ready', { n: result.people.length })}</Badge>
            {result.errors.length > 0 && <Badge tone="danger">{t('import.problems', { n: result.errors.length })}</Badge>}
          </div>
          {result.recognizedColumns.length > 0 && <p className="muted small">{t('import.columns', { cols: result.recognizedColumns.join(', ') })}</p>}
          <Issues title={t('import.problems', { n: result.errors.length })} items={result.errors} tone="danger" />
          {result.people.length > 0 && (
            <p className="small">
              {result.people
                .slice(0, 12)
                .map((p) => `${p.name}${p.role === 'organizer' ? ' (orga)' : ''}`)
                .join(', ')}
              {result.people.length > 12 ? ', …' : ''}
            </p>
          )}
          <Segmented<'append' | 'replace'>
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'append', label: t('import.modeAppendPeople') },
              { value: 'replace', label: t('import.modeReplacePeople') },
            ]}
          />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" onClick={run} loading={busy} disabled={!result.people.length || result.errors.length > 0}>
            {t('import.run')} ({result.people.length})
          </Button>
        </div>
      )}
    </div>
  );
}
