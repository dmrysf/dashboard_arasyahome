import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createTranslator, initialLocale, saveLocale, type Locale, type Translator } from "./index";

export type I18nValue = Translator & { setLocale: (locale: Locale) => void };

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Holds the interface language. Switching re-renders the interface in place; it never touches the session,
 * the server or any business data. `<html lang>` and the document title follow the active language.
 */
export function I18nProvider({ children, locale: fixed }: { children: ReactNode; locale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => fixed ?? initialLocale());
  const setLocale = useCallback((next: Locale) => { saveLocale(next); setLocaleState(next); }, []);
  const value = useMemo<I18nValue>(() => ({ ...createTranslator(locale), setLocale }), [locale, setLocale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = value.t.brand.title;
  }, [locale, value]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18n context is missing.");
  return value;
}
