"use client";

// Кружок с инициалами вместо строки «имя + выйти»: в шапке дорога каждая
// точка ширины. По клику — имя, язык, тема и выход. Тот же список настроек
// показывается на телефоне внутри шторки меню.

import { useEffect, useRef, useState } from "react";
import { BookOpen, LogOut, Moon, RotateCcw, Sun } from "lucide-react";
import { LOCALES, LOCALE_NAMES, useSettings, type Locale } from "@/lib/i18n";
import { SectionTitle } from "./ui";

/** Одна-две буквы: из имени берём инициалы слов, иначе первые буквы адреса. */
export function initials(name: string | null, email: string | null) {
  const source = (name ?? "").trim();
  if (source) {
    const words = source.split(/\s+/).slice(0, 2);
    const letters = words.map((w) => [...w][0] ?? "").join("");
    if (letters) return letters.toUpperCase();
  }
  const local = (email ?? "").split("@")[0];
  return ([...local].slice(0, 2).join("") || "?").toUpperCase();
}

const ROW =
  "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm " +
  "text-neutral-300 transition hover:bg-neutral-800";

/** Переключатель темы: одна кнопка вместо двух строк списка. */
function ThemeSwitch() {
  const { theme, setTheme, t } = useSettings();
  const light = theme === "light";

  return (
    <button
      role="switch"
      aria-checked={light}
      aria-label={t("menu.theme")}
      onClick={() => setTheme(light ? "dark" : "light")}
      className={`${ROW} justify-between`}
    >
      <span className="flex items-center gap-2">
        {light ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {light ? t("menu.themeLight") : t("menu.themeDark")}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          light ? "bg-emerald-500" : "bg-neutral-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-neutral-100 transition-all ${
            light ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/** Язык, тема и выход — одинаковые и в выпадашке, и в мобильной шторке. */
export function SettingsList({
  onRules,
  onRestart,
  onSignOut,
}: {
  /** Показать правила игры. */
  onRules?: () => void;
  /** Начать игру сначала — спрашивает подтверждение снаружи. */
  onRestart?: () => void;
  onSignOut?: () => void;
}) {
  const { locale, setLocale, t } = useSettings();

  return (
    <>

      <div className="px-2 pb-1 pt-2">
        <SectionTitle>{t("menu.language")}</SectionTitle>
      </div>
      <div className="px-2 pb-1">
        <select
          value={locale}
          aria-label={t("menu.language")}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="w-full cursor-pointer rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
        >
          {LOCALES.map((l: Locale) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-1 border-t border-neutral-800 px-2 pb-1 pt-2">
        <SectionTitle>{t("menu.theme")}</SectionTitle>
      </div>
      <ThemeSwitch />

      {onRules && (
        <div className="mt-1 border-t border-neutral-800 pt-1">
          <button onClick={onRules} className={ROW}>
            <BookOpen className="h-4 w-4" />
            <span className="flex-1">{t("menu.rules")}</span>
          </button>
        </div>
      )}

      {onRestart && (
        <div className="mt-1 border-t border-neutral-800 pt-1">
          <button onClick={onRestart} className={ROW}>
            <RotateCcw className="h-4 w-4" />
            <span className="flex-1">{t("restart.menu")}</span>
          </button>
        </div>
      )}

      {onSignOut && (
        <div className="mt-1 border-t border-neutral-800 pt-1">
          <button onClick={onSignOut} className={`${ROW} text-red-300`}>
            <LogOut className="h-4 w-4" />
            <span className="flex-1">{t("menu.signOut")}</span>
          </button>
        </div>
      )}
    </>
  );
}

export default function AccountMenu({
  name,
  email,
  onRules,
  onRestart,
  onSignOut,
}: {
  name: string | null;
  email: string | null;
  onRules?: () => void;
  onRestart?: () => void;
  /** Без аккаунта выхода нет — остаются язык и тема. */
  onSignOut?: () => void;
}) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("panel.account")}
        aria-expanded={open}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 text-xs font-bold uppercase tracking-wide text-neutral-200 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        {initials(name, email)}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 p-2 shadow-2xl">
          <div className="truncate px-2 pb-1 pt-1 text-sm font-semibold text-neutral-100">
            {name ?? email ?? t("app.localMode")}
          </div>
          {name && email && (
            <div className="truncate px-2 pb-2 font-mono text-[11px] text-neutral-500">
              {email}
            </div>
          )}
          <div className="border-t border-neutral-800" />
          <SettingsList
            onRules={
              onRules
                ? () => {
                    setOpen(false);
                    onRules();
                  }
                : undefined
            }
            onRestart={
              onRestart
                ? () => {
                    setOpen(false);
                    onRestart();
                  }
                : undefined
            }
            onSignOut={onSignOut}
          />
        </div>
      )}
    </div>
  );
}
