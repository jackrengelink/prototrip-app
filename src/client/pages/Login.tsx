import { ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorText, Field, Spinner, TextInput } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import { readJson, removeKey } from '../lib/storage';
import { useData } from '../state/data';
import { type Lang, usePrefs } from '../state/prefs';

interface PublicInfo {
  name: string;
  tagline?: string;
  accentColor?: string;
  defaultLanguage?: Lang;
}

function usePublicInfo() {
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const { setTripDefaultLang } = usePrefs();
  useEffect(() => {
    fetch('/api/public-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PublicInfo | null) => {
        if (!data) return;
        setInfo(data);
        if (data.defaultLanguage) setTripDefaultLang(data.defaultLanguage);
        if (data.accentColor) document.documentElement.style.setProperty('--accent', data.accentColor);
        document.title = data.name;
      })
      .catch(() => undefined);
  }, [setTripDefaultLang]);
  return info;
}

function LangSwitch() {
  const { lang, setLang } = usePrefs();
  return (
    <div className="lang-switch">
      {(['en', 'nl'] as const).map((l) => (
        <button key={l} type="button" className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function LoginPage({ initialError }: { initialError?: string }) {
  const { t } = usePrefs();
  const { login } = useData();
  const info = usePublicInfo();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (initialError) return initialError;
    if (readJson<boolean>('sessionEnded', false)) {
      removeKey('sessionEnded');
      return t('login.sessionEnded');
    }
    return null;
  });
  const [showCode, setShowCode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(code.trim());
    } catch (err) {
      setError(errorMessage(err, t('common.offline')));
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <LangSwitch />
      <div className="login-card">
        <div className="login-hero">
          <span className="brand-mark big" aria-hidden>
            ✈
          </span>
          <h1>{info?.name ?? t('app.name')}</h1>
          {info?.tagline && <p className="login-tagline">{info.tagline}</p>}
        </div>
        <form onSubmit={submit} className="login-form">
          <h2>{t('login.title')}</h2>
          <p className="muted">{t('login.subtitle')}</p>
          <Field label={t('login.codeLabel')} htmlFor="code">
            <div className="input-icon">
              <KeyRound size={18} aria-hidden />
              <TextInput
                id="code"
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('login.codePlaceholder')}
                autoComplete="current-password"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                type={showCode ? 'text' : 'password'}
                inputMode="text"
                enterKeyHint="go"
              />
              <button
                type="button"
                className="input-eye"
                onClick={() => setShowCode((v) => !v)}
                aria-label={showCode ? t('login.hideCode') : t('login.showCode')}
                aria-pressed={showCode}
              >
                {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<ArrowRight size={20} />}>
            {busy ? t('login.joining') : t('login.submit')}
          </Button>
          <p className="login-hint">{t('login.hintLink')}</p>
          <p className="login-hint small">{t('login.hintOrganizer')}</p>
        </form>
      </div>
    </div>
  );
}

/** /join/:code – signs in with the code from a link or QR code. */
export function JoinPage() {
  const { code } = useParams();
  const { login } = useData();
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!code) {
      navigate('/', { replace: true });
      return;
    }
    login(code)
      .then(() => navigate('/', { replace: true }))
      .catch((err) => setFailed(err instanceof ApiError ? t('login.joinFailed') : errorMessage(err, t('common.offline'))));
  }, [code, login, navigate, t]);

  if (failed) return <LoginPage initialError={failed} />;
  return (
    <div className="login-page">
      <Spinner label={t('login.joining')} />
    </div>
  );
}
