// Извещение нападающему об исходе удалённого налёта. Общая логика для
// /api/telegram/notify и /api/battle/resolve — один слот resolved_notified_at.

import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://skladron.vercel.app";

type ProfileRow = {
  id: string;
  base_name: string | null;
  display_name: string | null;
  email: string | null;
  tg_chat_id: string | null;
};

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

export const nameOf = (p: {
  base_name: string | null;
  display_name: string | null;
  email: string | null;
}) => p.base_name ?? p.display_name ?? p.email?.split("@")[0] ?? "склад";

async function send(chatId: number, text: string) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

/** Текст защитнику: на склад летит новый налёт. */
export function sentRaidMessage(attackerName: string, drones: number): string {
  return (
    `На твой склад летит налёт от «${attackerName}» — ${drones} дронов. ` +
    `Отбивай, когда готов: очередь не пропускается. ${SITE}`
  );
}

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
  if (attack.sent_notified_at) return { sent: false };

  const { data: people } = await db
    .from("profiles")
    .select("id, base_name, display_name, email, tg_chat_id")
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

  await send(
    Number(defender.tg_chat_id),
    sentRaidMessage(nameOf(attacker), attack.drones)
  );
  return { sent: true };
}

/** Текст для нападающего: исход с его точки зрения. */
export function resolvedRaidMessage(
  defenderName: string,
  attack: Pick<AttackRow, "id" | "result" | "loot" | "destroyed">
): string {
  const burned = (attack.result as { burned?: number } | null)?.burned ?? 0;
  const loot = attack.loot ?? 0;
  const replay = `${SITE}/replay/${attack.id}`;

  if (attack.destroyed) {
    return (
      `«${defenderName}» отыграл защиту — склад выгорел дотла. Премия ${loot} кр. ` +
      `Повтор боя: ${replay}`
    );
  }
  if (burned === 0) {
    return `«${defenderName}» отбил твой налёт без потерь. Повтор боя: ${replay}`;
  }
  return (
    `«${defenderName}» отыграл защиту. Сгорело клеток: ${burned}, премия ${loot} кр. ` +
    `Повтор боя: ${replay}`
  );
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
    .select("id, base_name, display_name, email, tg_chat_id")
    .in("id", [attack.attacker_id, attack.defender_id]);
  const attacker = people?.find((p) => p.id === attack.attacker_id) as ProfileRow | undefined;
  const defender = people?.find((p) => p.id === attack.defender_id) as ProfileRow | undefined;
  if (!attacker?.tg_chat_id || !defender) return { sent: false };

  await send(Number(attacker.tg_chat_id), resolvedRaidMessage(nameOf(defender), attack));
  return { sent: true };
}

/** Короткое извещение о новой реплике по налёту. */
export function raidCommentMessage(
  authorName: string,
  body: string,
  attackId: string
): string {
  const replay = `${SITE}/replay/${attackId}`;
  const text = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return `«${authorName}» написал по налёту: «${text}» ${replay}`;
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

  const recipient =
    comment.author_id === attack.attacker_id ? attack.defender_id : attack.attacker_id;

  const { data: people } = await db
    .from("profiles")
    .select("id, base_name, display_name, email, tg_chat_id")
    .in("id", [comment.author_id, recipient]);
  const author = people?.find((p) => p.id === comment.author_id) as ProfileRow | undefined;
  const to = people?.find((p) => p.id === recipient) as ProfileRow | undefined;
  if (!author || !to?.tg_chat_id) return { sent: false };

  await send(
    Number(to.tg_chat_id),
    raidCommentMessage(nameOf(author), comment.body, attackId)
  );
  return { sent: true };
}

/** Текст тому, кого добавили: с этого мига по нему можно летать. */
export function rivalAddedMessage(fromName: string): string {
  return (
    `Склад «${fromName}» добавил тебя во враги — теперь он видит твой адрес ` +
    `и может слать налёты. Он же появился и в твоём списке: ответить есть чем. ${SITE}`
  );
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
    .select("id, base_name, display_name, email, tg_chat_id")
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

  await send(Number(to.tg_chat_id), rivalAddedMessage(nameOf(from)));
  return { sent: true };
}

/** Текст того, кому написали. Саму реплику показываем: ради неё и пишем. */
export function rivalMessageText(fromName: string, body: string): string {
  const line = body.length > 300 ? `${body.slice(0, 300)}…` : body;
  return `Сообщение от склада «${fromName}»:\n\n${line}\n\n${SITE}`;
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
    .select("id, base_name, display_name, email, tg_chat_id")
    .in("id", [message.from_id, message.to_id]);
  const from = people?.find((p) => p.id === message.from_id) as ProfileRow | undefined;
  const to = people?.find((p) => p.id === message.to_id) as ProfileRow | undefined;
  if (!from || !to?.tg_chat_id) return { sent: false };

  await send(Number(to.tg_chat_id), rivalMessageText(nameOf(from), message.body));
  return { sent: true };
}
