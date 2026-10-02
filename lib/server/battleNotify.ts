// Извещение нападающему об исходе удалённого налёта. Общая логика для
// /api/telegram/notify и /api/battle/resolve — один слот resolved_notified_at.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegram as send } from "./telegram";
import { tg, tgLocale, type TgLocale } from "./tgText";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://skladron.vercel.app";

type ProfileRow = {
  id: string;
  base_name: string | null;
  display_name: string | null;
  email: string | null;
  tg_chat_id: string | null;
  locale: string | null;
};

/** Поля профиля, нужные извещению: имя отправителя, чат и язык получателя. */
const PEOPLE = "id, base_name, display_name, email, tg_chat_id, locale";

/** На каком языке писать этому игроку. */
const langOf = (p: { locale: string | null }) => tgLocale(p.locale);

type AttackRow = {
  id: string;
  attacker_id: string;
  defender_id: string;
  status: string;
  drones: number;
  result: unknown;
  loot: number | null;
  destroyed: boolean;
  sent_notified_at: string | null;
  resolved_notified_at: string | null;
};

export const nameOf = (
  p: {
    base_name: string | null;
    display_name: string | null;
    email: string | null;
  },
  l: TgLocale = "en"
) => p.base_name ?? p.display_name ?? p.email?.split("@")[0] ?? tg(l, "base");



/**
 * Атомарно занимает sent_notified_at и шлёт защитнику, если привязан Telegram.
 * Без tg_chat_id слот не трогаем — после привязки можно повторить.
 */
export async function notifySentRaid(
  db: SupabaseClient,
  attackId: string
): Promise<{ sent: boolean; error?: string }> {
  const { data: attack, error: loadError } = await db
    .from("attacks")
    .select("id, attacker_id, defender_id, drones, status, sent_notified_at")
    .eq("id", attackId)
    .maybeSingle<AttackRow>();
  if (loadError) return { sent: false, error: loadError.message };
  if (!attack || attack.status !== "pending") return { sent: false };
  // Состязание — налёт на самого себя: сообщать себе не о чем.
  if (attack.attacker_id === attack.defender_id) return { sent: false };
  if (attack.sent_notified_at) return { sent: false };

  const { data: people } = await db
    .from("profiles")
    .select(PEOPLE)
    .in("id", [attack.defender_id, attack.attacker_id]);
  const defender = people?.find((p) => p.id === attack.defender_id) as ProfileRow | undefined;
  const attacker = people?.find((p) => p.id === attack.attacker_id) as ProfileRow | undefined;
  if (!defender?.tg_chat_id || !attacker) return { sent: false };

  const stamp = new Date().toISOString();
  const { data: claimed, error: claimError } = await db
    .from("attacks")
    .update({ sent_notified_at: stamp })
    .eq("id", attackId)
    .eq("status", "pending")
    .is("sent_notified_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) return { sent: false, error: claimError.message };
  if (!claimed) return { sent: false };

  const l = langOf(defender);
  await send(
    Number(defender.tg_chat_id),
    tg(l, "sentRaid", { attacker: nameOf(attacker, l), drones: attack.drones })
  );
  return { sent: true };
}

/** Текст для нападающего: исход с его точки зрения. */
function resolvedRaidMessage(
  l: TgLocale,
  defenderName: string,
  attack: Pick<AttackRow, "id" | "result" | "loot" | "destroyed">
): string {
  const burned = (attack.result as { burned?: number } | null)?.burned ?? 0;
  const vars = {
    defender: defenderName,
    loot: attack.loot ?? 0,
    burned,
    replay: `${SITE}/replay/${attack.id}`,
  };
  if (attack.destroyed) return tg(l, "resolvedDestroyed", vars);
  if (burned === 0) return tg(l, "resolvedClean", vars);
  return tg(l, "resolvedBurned", vars);
}

/**
 * Атомарно занимает resolved_notified_at и шлёт нападающему, если привязан Telegram.
 * Повторный вызов (клиент + сервер) безопасен.
 */
export async function notifyResolvedRaid(
  db: SupabaseClient,
  attackId: string
): Promise<{ sent: boolean; error?: string }> {
  const { data: attack, error: loadError } = await db
    .from("attacks")
    .select(
      "id, attacker_id, defender_id, status, result, loot, destroyed, resolved_notified_at"
    )
    .eq("id", attackId)
    .maybeSingle<AttackRow>();
  if (loadError) return { sent: false, error: loadError.message };
  if (!attack || attack.status !== "resolved") return { sent: false };
  if (attack.attacker_id === attack.defender_id) return { sent: false };
  if (attack.resolved_notified_at) return { sent: false };

  const stamp = new Date().toISOString();
  const { data: claimed, error: claimError } = await db
    .from("attacks")
    .update({ resolved_notified_at: stamp })
    .eq("id", attackId)
    .eq("status", "resolved")
    .is("resolved_notified_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) return { sent: false, error: claimError.message };
  if (!claimed) return { sent: false };

  const { data: people } = await db
    .from("profiles")
    .select(PEOPLE)
    .in("id", [attack.attacker_id, attack.defender_id]);
  const attacker = people?.find((p) => p.id === attack.attacker_id) as ProfileRow | undefined;
  const defender = people?.find((p) => p.id === attack.defender_id) as ProfileRow | undefined;
  if (!attacker?.tg_chat_id || !defender) return { sent: false };

  const l = langOf(attacker);
  await send(Number(attacker.tg_chat_id), resolvedRaidMessage(l, nameOf(defender, l), attack));
  return { sent: true };
}

/** Короткое извещение о новой реплике по налёту. */
function raidCommentMessage(l: TgLocale, authorName: string, body: string, attackId: string) {
  const text = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return tg(l, "raidComment", { author: authorName, text, replay: `${SITE}/replay/${attackId}` });
}

/**
 * Шлёт второму участнику боя, если у него привязан Telegram.
 * Вызывается после insert комментария — без dedup, каждая реплика отдельно.
 */
export async function notifyRaidComment(
  db: SupabaseClient,
  attackId: string,
  commentId: string
): Promise<{ sent: boolean; error?: string }> {
  const { data: comment, error: cErr } = await db
    .from("battle_comments")
    .select("id, attack_id, author_id, body")
    .eq("id", commentId)
    .maybeSingle();
  if (cErr) return { sent: false, error: cErr.message };
  if (!comment || comment.attack_id !== attackId) return { sent: false };

  const { data: attack, error: aErr } = await db
    .from("attacks")
    .select("id, attacker_id, defender_id")
    .eq("id", attackId)
    .maybeSingle();
  if (aErr) return { sent: false, error: aErr.message };
  if (!attack) return { sent: false };
  if (attack.attacker_id === attack.defender_id) return { sent: false };

  const recipient =
    comment.author_id === attack.attacker_id ? attack.defender_id : attack.attacker_id;

  const { data: people } = await db
    .from("profiles")
    .select(PEOPLE)
    .in("id", [comment.author_id, recipient]);
  const author = people?.find((p) => p.id === comment.author_id) as ProfileRow | undefined;
  const to = people?.find((p) => p.id === recipient) as ProfileRow | undefined;
  if (!author || !to?.tg_chat_id) return { sent: false };

  const l = langOf(to);
  await send(Number(to.tg_chat_id), raidCommentMessage(l, nameOf(author, l), comment.body, attackId));
  return { sent: true };
}


/**
 * Извещение о новом знакомстве. Шлём один раз на пару: знакомство и
 * заводится один раз, а звенеть в телеграме на каждую повторную попытку
 * добавить — верный способ отучить людей от бота.
 *
 * Метку ставим до отправки и только если она встала: два запроса подряд
 * иначе оба увидели бы «ещё не слали» и написали бы дважды. Без
 * tg_chat_id метку не занимаем — привяжет бота, и тогда дойдёт.
 */
export async function notifyRivalAdded(
  db: SupabaseClient,
  fromId: string,
  toId: string
): Promise<{ sent: boolean; error?: string }> {
  const { data: people, error } = await db
    .from("profiles")
    .select(PEOPLE)
    .in("id", [fromId, toId]);
  if (error) return { sent: false, error: error.message };
  const from = people?.find((p) => p.id === fromId) as ProfileRow | undefined;
  const to = people?.find((p) => p.id === toId) as ProfileRow | undefined;
  if (!from || !to?.tg_chat_id) return { sent: false };

  const { error: claimError, count } = await db
    .from("rival_notices")
    .upsert({ from_id: fromId, to_id: toId }, { onConflict: "from_id,to_id", ignoreDuplicates: true, count: "exact" });
  if (claimError) return { sent: false, error: claimError.message };
  if (!count) return { sent: false }; // уже писали про эту пару

  const l = langOf(to);
  // С этого мига по тому, кого добавили, можно летать — ему и пишем.
  await send(Number(to.tg_chat_id), tg(l, "rivalAdded", { from: nameOf(from, l) }));
  return { sent: true };
}


/**
 * Извещение о новой реплике в разговоре с соперником. Метки «уже слали»
 * тут нет и не нужно: реплика каждый раз новая, а от лавины бережёт
 * потолок непрочитанного в send_message.
 */
export async function notifyRivalMessage(
  db: SupabaseClient,
  messageId: string
): Promise<{ sent: boolean; error?: string }> {
  const { data: message, error } = await db
    .from("rival_messages")
    .select("id, from_id, to_id, body")
    .eq("id", messageId)
    .maybeSingle();
  if (error) return { sent: false, error: error.message };
  if (!message) return { sent: false };

  const { data: people } = await db
    .from("profiles")
    .select(PEOPLE)
    .in("id", [message.from_id, message.to_id]);
  const from = people?.find((p) => p.id === message.from_id) as ProfileRow | undefined;
  const to = people?.find((p) => p.id === message.to_id) as ProfileRow | undefined;
  if (!from || !to?.tg_chat_id) return { sent: false };

  // Саму реплику показываем: ради неё и пишем.
  const l = langOf(to);
  const text = message.body.length > 300 ? `${message.body.slice(0, 300)}…` : message.body;
  await send(Number(to.tg_chat_id), tg(l, "rivalMessage", { from: nameOf(from, l), text }));
  return { sent: true };
}
