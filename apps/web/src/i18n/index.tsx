import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import en from './en.json';
import zhTW from './zh-TW.json';
import zhCN from './zh-CN.json';

export type Locale = 'en' | 'zh-TW' | 'zh-CN';

export const LOCALE_LABELS: Record<Locale, string> = {
  'en': 'English',
  'zh-TW': '中文（繁體）',
  'zh-CN': '中文（简体）',
};

const messages: Record<Locale, any> = { en, 'zh-TW': zhTW, 'zh-CN': zhCN };

const STORAGE_KEY = 'rewind_locale';

function getNestedValue(obj: any, path: string): string {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return path;
    current = current[key];
  }
  return typeof current === 'string' ? current : path;
}

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored in messages) return stored as Locale;
    } catch {}
    return 'en';
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try { localStorage.setItem(STORAGE_KEY, newLocale); } catch {}
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let value = getNestedValue(messages[locale], key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Compact language switcher component for the header.
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm cursor-pointer hover:bg-muted transition-colors"
      aria-label="Language"
    >
      {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([key, label]) => (
        <option key={key} value={key}>{label}</option>
      ))}
    </select>
  );
}
