// Словари интерфейса. Ключ — смысл строки, а не её русский текст: так перевод
// не разъезжается, когда формулировку правят. Значения с {фигурными} местами
// подставляются через t("ключ", { место: значение }).
//
// Сами языки лежат в locales/ по файлу на каждый: их правят по одному, и
// листать ради этого две с половиной тысячи строк незачем. Английский —
// образец: из него выводится Key, а Dict требует того же набора ключей от
// остальных, так что пропущенный перевод не соберётся.
//
// В игру встроен только английский — он же запасной для пропущенного
// ключа. Остальные грузятся отдельным куском по loadDict: игроку незачем
// качать двенадцать чужих словарей. Все разом — в all.ts, для сервера.

import en from "./locales/en";

export const LOCALES = ["en", "ru", "es", "pt", "fr", "de", "it", "uk", "pl", "tr", "zh", "ja", "ko"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  es: "Español",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  uk: "Українська",
  pl: "Polski",
  tr: "Türkçe",
  zh: "简体中文",
  ja: "日本語",
  ko: "한국어",
};

export type Key = keyof typeof en;
export type Dict = Record<Key, string>;

export const EN: Dict = en;

const LOADERS: Record<Locale, () => Promise<{ default: Dict }>> = {
  en: async () => ({ default: en }),
  ru: () => import("./locales/ru"),
  es: () => import("./locales/es"),
  pt: () => import("./locales/pt"),
  fr: () => import("./locales/fr"),
  de: () => import("./locales/de"),
  it: () => import("./locales/it"),
  uk: () => import("./locales/uk"),
  pl: () => import("./locales/pl"),
  tr: () => import("./locales/tr"),
  zh: () => import("./locales/zh"),
  ja: () => import("./locales/ja"),
  ko: () => import("./locales/ko"),
};

/** Словарь языка: английский сразу, остальные — отдельным куском. */
export const loadDict = (locale: Locale): Promise<Dict> =>
  LOADERS[locale]().then((m) => m.default);
