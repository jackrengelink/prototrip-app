import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type TranslationKey } from '../i18n/en';
import { nl } from '../i18n/nl';
import { readJson, writeJson } from '../lib/storage';

export type Lang = 'en' | 'nl';
export type Theme = 'system' | 'light' | 'dark';

const DICTS: Record<Lang, Record<TranslationKey, string>> = { en, nl };

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: TranslationKey, vars?: Record<string, string | number>): string {
  let s: string = DICTS[lang][key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

interface PrefsValue {
  lang: Lang;
  /** Language chosen explicitly by the user (null = automatic). */
  langChoice: Lang | null;
  setLang(lang: Lang | null): void;
  /** Called with the trip's default language once it is known. */
  setTripDefaultLang(lang: Lang | undefined): void;
  locale: string;
  t: TFunction;
  theme: Theme;
  setTheme(theme: Theme): void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

function browserLang(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('nl') ? 'nl' : 'en';
  } catch {
    return 'en';
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [langChoice, setLangChoice] = useState<Lang | null>(() => readJson<Lang | null>('lang', null));
  const [tripLang, setTripLang] = useState<Lang | undefined>(() => readJson<Lang | undefined>('tripLang', undefined));
  const [theme, setThemeState] = useState<Theme>(() => readJson<Theme>('theme', 'system'));

  const lang: Lang = langChoice ?? tripLang ?? browserLang();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const setLang = useCallback((l: Lang | null) => {
    setLangChoice(l);
    writeJson('lang', l);
  }, []);
  const setTripDefaultLang = useCallback((l: Lang | undefined) => {
    setTripLang(l);
    writeJson('tripLang', l);
  }, []);
  const setTheme = useCallback((th: Theme) => {
    setThemeState(th);
    writeJson('theme', th);
  }, []);

  const value = useMemo<PrefsValue>(
    () => ({
      lang,
      langChoice,
      setLang,
      setTripDefaultLang,
      locale: lang === 'nl' ? 'nl-NL' : 'en-GB',
      t: (key, vars) => translate(lang, key, vars),
      theme,
      setTheme,
    }),
    [lang, langChoice, setLang, setTripDefaultLang, theme, setTheme],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs outside PrefsProvider');
  return ctx;
}

export function useT(): TFunction {
  return usePrefs().t;
}
