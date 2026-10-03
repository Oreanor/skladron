// Словари интерфейса. Ключ — смысл строки, а не её русский текст: так перевод
// не разъезжается, когда формулировку правят. Значения с {фигурными} местами
// подставляются через t("ключ", { место: значение }).
//
// Сами языки лежат в locales/ по файлу на каждый: их правят по одному, и
// листать ради этого две с половиной тысячи строк незачем. Английский —
// образец: из него выводится Key, а Dict требует того же набора ключей от
// остальных, так что пропущенный перевод не соберётся.

import en from "./locales/en";
import ru from "./locales/ru";
import es from "./locales/es";
import pt from "./locales/pt";
import fr from "./locales/fr";
import de from "./locales/de";
import it from "./locales/it";
import uk from "./locales/uk";
import pl from "./locales/pl";
import tr from "./locales/tr";
import zh from "./locales/zh";
import ja from "./locales/ja";
import ko from "./locales/ko";

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

export const DICTS: Record<Locale, Dict> = { en, ru, es, pt, fr, de, it, uk, pl, tr, zh, ja, ko };
