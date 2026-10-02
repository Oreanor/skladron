/**
 * Ответы сервера — для людей. Сервер и база отвечают по-английски и для
 * разработчика («attack claim expired», «not enough credits: need 50…»), а
 * игроку это ничего не говорит. Здесь такие ответы узнаются по шаблону и
 * превращаются в фразу на его языке.
 *
 * Незнакомое не прячем: пишем «что-то пошло не так» и сам код ответа в
 * скобках — по нему потом и находится причина.
 */

import type { Translate } from "./i18n";
import type { Key } from "./i18n/dict";

/** Шаблон ответа → что сказать. Первый подошедший и побеждает. */
const RULES: [RegExp, Key][] = [
  // связь и вход
  [/failed to fetch|networkerror|load failed|fetch failed|network request failed/i, "error.network"],
  [/HTTP 5\d\d|not configured|internal server error|bad gateway|service unavailable/i, "error.server"],
  [/not authenticated|unauthorized|jwt expired|invalid jwt/i, "error.auth"],

  // бой, который надо переиграть или который уже закрыт
  [/unsupported simulation version/i, "error.version"],
  [
    /base changed during battle|attack claim (expired|mismatch)|already resolving|battle is resolving|claim failed/i,
    "error.battleRetry",
  ],
  [/attack already resolved|attack not found|no such battle|attack report not found/i, "error.battleGone"],
  [/not your battle|not a participant/i, "error.notYours"],

  // деньги и склад
  [/not enough credits/i, "error.credits"],
  [/not enough drones|drone count may only change/i, "error.drones"],
  [/not enough free cells/i, "error.freeCells"],
  [/already at max level/i, "error.maxLevel"],
  [/previous loan .* is not repaid/i, "error.loanOpen"],
  [/nothing to repay/i, "error.noLoan"],
  [/loan must be between/i, "error.loanRange"],

  // соперники и налёты
  [/has not joined yet|no such player/i, "error.noPlayer"],
  [/target warehouse is not founded/i, "error.notFounded"],
  [/cannot (attack|scout|write to|add) yourself/i, "error.self"],
  [/too many raids already queued/i, "error.queueFull"],
  [/too many enemies/i, "error.tooManyEnemies"],
  [/duplicate enemy email/i, "enemies.already"],
  [/bad enemy email/i, "enemies.notEmail"],
  [/add each other first/i, "error.notRivals"],
  [/too many unread messages/i, "error.tooManyUnread"],
  [/empty message/i, "error.emptyMessage"],
  [/competition is not open/i, "error.missionLocked"],
  [/base name too long|empty base name/i, "error.baseName"],

  // Склад в игре и на сервере разошёлся: прислали карту, пушки или ящики,
  // которых сервер не ждал. Лечится перезагрузкой — правда на сервере.
  [
    /^bad |map must cover|map longer|empty map|battle may |may not degrade|depots must hold|burned cell count|trace|no base|no profile/i,
    "error.desync",
  ],
];

/** Сообщение ошибки, откуда бы она ни пришла: Error, ответ Supabase, строка. */
function rawMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(e ?? "");
}

/** Понятная игроку причина ошибки на его языке. */
export function explain(e: unknown, t: Translate): string {
  const raw = rawMessage(e).trim();
  for (const [pattern, key] of RULES) {
    if (pattern.test(raw)) return t(key);
  }
  return raw ? t("error.unknown", { detail: raw }) : t("error.unknownBare");
}

/**
 * То же, но отдельной строкой, а не после «Не удалось …:». Фразы в словаре
 * со строчной — они обычно идут после двоеточия; сами по себе — с заглавной.
 */
export function explainAlone(e: unknown, t: Translate): string {
  const text = explain(e, t);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
