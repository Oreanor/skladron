// Извещения в телеграм. Клиент просит «сообщи по этому бою», а кому и что
// именно писать, решает сервер: у клиента нет ни токена бота, ни чужих чатов.

import { createClient } from "@supabase/supabase-js";
import { caller } from "@/lib/server/auth";
import { sendTelegram as send, telegramReady } from "@/lib/server/telegram";
import {
  notifyRaidComment,
  notifyResolvedRaid,
  notifyRivalAdded,
  notifyRivalMessage,
  notifySentRaid,
} from "@/lib/server/battleNotify";
import { tg, tgLocale } from "@/lib/server/tgText";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Event = "sent" | "resolved" | "test" | "comment" | "rival" | "message";

export async function POST(request: Request) {
  if (!URL || !SERVICE || !telegramReady) {
    return Response.json({ ok: false, reason: "not configured" });
  }

  const body = (await request.json()) as {
    attackId?: string;
    event?: Event;
    drones?: number;
    commentId?: string;
    email?: string;
    messageId?: string;
  };
  const event = body.event;
  const known: Event[] = ["sent", "resolved", "test", "comment", "rival", "message"];
  if (!event || !known.includes(event)) {
    return new Response("bad request", { status: 400 });
  }

  const uid = await caller(request);
  if (!uid) return new Response("unauthorized", { status: 401 });

  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // Отладочный налёт: второй стороны нет, извещаем только игрока.
  if (event === "test") {
    const drones = Math.floor(Number(body.drones));
    if (!Number.isFinite(drones) || drones < 1 || drones > 500) {
      return new Response("bad request", { status: 400 });
    }
    const { data: me } = await db
      .from("profiles")
      .select("tg_chat_id, locale")
      .eq("id", uid)
      .maybeSingle();
    if (!me?.tg_chat_id) return Response.json({ ok: true, sent: false });
    await send(Number(me.tg_chat_id), tg(tgLocale(me.locale), "testRaid", { drones }));
    return Response.json({ ok: true, sent: true });
  }

  // Реплика в разговоре. Проверка простая и надёжная: писать извещение
  // вправе только тот, чьё это сообщение, — а кому оно уйдёт, записано в
  // самой строке, и подменить адресата клиент не может.
  if (event === "message") {
    const messageId = body.messageId;
    if (!messageId) return new Response("bad request", { status: 400 });
    const { data: message } = await db
      .from("rival_messages")
      .select("id, from_id")
      .eq("id", messageId)
      .maybeSingle();
    if (!message) return new Response("no such message", { status: 404 });
    if (message.from_id !== uid) return new Response("not your message", { status: 403 });

    const { sent, error: notifyError } = await notifyRivalMessage(db, messageId);
    if (notifyError) return Response.json({ ok: false, reason: notifyError });
    return Response.json({ ok: true, sent });
  }

  // Знакомство: пишем тому, кого добавили. На слово не верим — сверяемся
  // с его же списком врагов. Знакомство взаимное, и add_rival кладёт туда
  // карточку просящего; нет карточки — значит и добавления не было, а
  // ручку дёргают мимо игры.
  if (event === "rival") {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) return new Response("bad request", { status: 400 });

    const { data: me } = await db
      .from("profiles")
      .select("id, email")
      .eq("id", uid)
      .maybeSingle();
    const { data: target } = await db
      .from("profiles")
      .select("id, enemies")
      .ilike("email", email)
      .maybeSingle();
    if (!me?.email || !target) return Response.json({ ok: true, sent: false });
    if (target.id === uid) return new Response("bad request", { status: 400 });

    const mine = me.email.toLowerCase();
    const listed = (target.enemies as { email?: string }[] | null)?.some(
      (e) => (e.email ?? "").toLowerCase() === mine
    );
    if (!listed) return new Response("no such rival", { status: 403 });

    const { sent, error: notifyError } = await notifyRivalAdded(db, uid, target.id);
    if (notifyError) return Response.json({ ok: false, reason: notifyError });
    return Response.json({ ok: true, sent });
  }

  // id боя публичен: по нему открывается повтор, ссылками на повторы
  // обмениваются. Значит одного id мало — проверяем, что просит участник.
  const attackId = body.attackId;
  if (!attackId) return new Response("bad request", { status: 400 });

  if (event === "comment") {
    let commentId = body.commentId;
    if (!commentId) {
      const { data: latest } = await db
        .from("battle_comments")
        .select("id")
        .eq("attack_id", attackId)
        .eq("author_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      commentId = latest?.id;
    }
    if (!commentId) return Response.json({ ok: true, sent: false });

    const { data: comment } = await db
      .from("battle_comments")
      .select("id, author_id, attack_id")
      .eq("id", commentId)
      .maybeSingle();
    if (!comment || comment.attack_id !== attackId) {
      return new Response("no such comment", { status: 404 });
    }
    if (comment.author_id !== uid) {
      return new Response("not your comment", { status: 403 });
    }
    const { sent, error: notifyError } = await notifyRaidComment(db, attackId, commentId);
    if (notifyError) return Response.json({ ok: false, reason: notifyError });
    return Response.json({ ok: true, sent });
  }

  const { data: attack } = await db
    .from("attacks")
    .select(
      "id, attacker_id, defender_id, drones, status, sent_notified_at, resolved_notified_at"
    )
    .eq("id", attackId)
    .maybeSingle();
  if (!attack) return new Response("no such battle", { status: 404 });

  if (event === "resolved") {
    // Об исходе просит только защитник, который бой отыграл.
    if (uid !== attack.defender_id) {
      return new Response("not your side of this battle", { status: 403 });
    }
    if (attack.status !== "resolved") return Response.json({ ok: true, sent: false });
    const { sent, error: notifyError } = await notifyResolvedRaid(db, attackId);
    if (notifyError) return Response.json({ ok: false, reason: notifyError });
    return Response.json({ ok: true, sent });
  }

  // sent — участник боя (нападающий после вылета или защитник при опросе очереди).
  if (uid !== attack.attacker_id && uid !== attack.defender_id) {
    return new Response("not your side of this battle", { status: 403 });
  }
  const { sent, error: notifyError } = await notifySentRaid(db, attackId);
  if (notifyError) return Response.json({ ok: false, reason: notifyError });
  return Response.json({ ok: true, sent });
}
