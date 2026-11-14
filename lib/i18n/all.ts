// Все словари разом. Только для сервера: заголовок страницы он ставит на
// языке браузера, не дожидаясь клиента. В клиентский код не импортировать —
// утянет в бандл все тринадцать языков; там словарь берут через loadDict.

import type { Dict, Locale } from "./dict";
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

export const DICTS: Record<Locale, Dict> = { en, ru, es, pt, fr, de, it, uk, pl, tr, zh, ja, ko };
