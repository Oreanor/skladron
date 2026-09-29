// Извещения в телеграм. Клиент просит «сообщи по этому бою», а кому и что
// именно писать, решает сервер: у клиента нет ни токена бота, ни чужих чатов.

import { createClient } from "@supabase/supabase-js";
import {
  notifyRaidComment,
  notifyResolvedRaid,
  notifyRivalAdded,
  notifyRivalMessage,
  notifySentRaid,
} from "@/lib/telegramBattleNotify";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://skladron.vercel.app";

type Event = "sent" | "resolved" | "test" | "comment" | "rival" | "message";

async function send(chatId: number, text: string) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

/** Кто просит. Токен проверяем у Supabase, на слово клиенту не верим. */
async function caller(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !URL || !ANON) return null;
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await db.auth.getUser(token);
  return data.user?.id ?? null;
}

export async function POST(request: Request) {
  if (!URL || !ANON || !SERVICE || !TOKEN) {
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

  // Пробный налёт не пишется в attacks: извещаем только самого игрока.
  if (event === "test") {
    const drones = Math.floor(Number(body.drones));
    if (!Number.isFinite(drones) || drones < 1 || drones > 500) {
      return new Response("bad request", { status: 400 });
    }
    const { data: me } = await db
      .from("profiles")
      .select("tg_chat_id")
      .eq("id", uid)
      .maybeSingle();
    if (!me?.tg_chat_id) return Response.json({ ok: true, sent: false });
    await send(
      Number(me.tg_chat_id),
      `Пробный налёт на твой склад — ${drones} дронов в очереди. Открой игру: ${SITE}`
    );
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
