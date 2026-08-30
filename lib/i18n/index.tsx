"use client";

// Язык и тема живут вместе: обе настройки личные, обе лежат в localStorage и
// обе нужны почти каждому компоненту. Язык по умолчанию — язык браузера, если
// он у нас есть, иначе английский.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DICTS, LOCALES, type Key, type Locale } from "./dict";

export { LOCALES, LOCALE_NAMES, type Locale } from "./dict";

export type Theme = "dark" | "light";

const LOCALE_KEY = "wb.locale";
const THEME_KEY = "wb.theme";

/** Первый из языков браузера, который мы умеем. Иначе английский. */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of wanted) {
    const base = tag.toLowerCase().split("-")[0];
    const hit = LOCALES.find((l) => l === base);
    if (hit) return hit;
  }
  return "en";
}

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return allowed.includes(raw as T) ? (raw as T) : null;
  } catch {
    return null; // приватный режим — просто живём с умолчаниями
  }
}

export type Translate = (key: Key, vars?: Record<string, string | number>) => string;

interface Settings {
  locale: Locale;
  setLocale: (l: Locale) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: Translate;
}

const Ctx = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // На сервере языка браузера нет, поэтому стартуем с английского и заменяем
  // его до первой отрисовки — так разметка сервера и клиента не расходятся.
  const [locale, setLocaleState] = useState<Locale>("en");
  const [theme, setThemeState] = useState<Theme>("dark");

  useLayoutEffect(() => {
    setLocaleState(readStored(LOCALE_KEY, LOCALES) ?? detectLocale());
    setThemeState(readStored<Theme>(THEME_KEY, ["dark", "light"]) ?? "dark");
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // не сохранилось — переживём до конца сессии
    }
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // то же самое: настройка останется только на эту сессию
    }
  }, []);

  const t = useCallback<Translate>(
    (key, vars) => {
      const raw = DICTS[locale][key] ?? DICTS.en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in vars ? String(vars[name]) : whole
      );
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, theme, setTheme, t }),
    [locale, setLocale, theme, setTheme, t]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("SettingsProvider отсутствует над деревом");
  return ctx;
}

/** Короткий доступ там, где нужен только перевод. */
export function useT(): Translate {
  return useSettings().t;
}
