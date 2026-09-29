// Извещения в телеграм. Клиент просит «сообщи по этому бою», а кому и что
// именно писать, решает сервер: у клиента нет ни токена бота, ни чужих чатов.

import { createClient } from "@supabase/supabase-js";
import { nameOf, notifyResolvedRaid } from "@/lib/telegramBattleNotify";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://skladron.vercel.app";

type Event = "sent" | "resolved" | "test";

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
  };
  const event = body.event;
  if (event !== "sent" && event !== "resolved" && event !== "test") {
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

  // id боя публичен: по нему открывается повтор, ссылками на повторы
  // обмениваются. Значит одного id мало — проверяем, что просит участник.
  const attackId = body.attackId;
  if (!attackId) return new Response("bad request", { status: 400 });

  const { data: attack } = await db
    .from("attacks")
    .select(
      "id, attacker_id, defender_id, drones, status, sent_notified_at, resolved_notified_at"
    )
    .eq("id", attackId)
    .maybeSingle();
  if (!attack) return new Response("no such battle", { status: 404 });

  // Извещает всегда тот, у кого событие и произошло: о вылете — нападавший,
  // об исходе — защитник, который бой и отыграл. Иначе одна сторона могла бы
  // дёргать ручку сколько угодно раз и заваливать вторую сообщениями.
  const author = event === "sent" ? attack.attacker_id : attack.defender_id;
  if (uid !== author) return new Response("not your side of this battle", { status: 403 });

  if (event === "resolved") {
    if (attack.status !== "resolved") return Response.json({ ok: true, sent: false });
    const { sent, error: notifyError } = await notifyResolvedRaid(db, attackId);
    if (notifyError) return Response.json({ ok: false, reason: notifyError });
    return Response.json({ ok: true, sent });
  }

  // sent
  if (attack.status !== "pending") return Response.json({ ok: true, sent: false });
  if (attack.sent_notified_at) return Response.json({ ok: true, sent: false });

  const stamp = new Date().toISOString();
  const { data: claimed, error: claimError } = await db
    .from("attacks")
    .update({ sent_notified_at: stamp })
    .eq("id", attackId)
    .eq("status", "pending")
    .is("sent_notified_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) return Response.json({ ok: false, reason: claimError.message });
  if (!claimed) return Response.json({ ok: true, sent: false });

  const { data: people } = await db
    .from("profiles")
    .select("id, base_name, display_name, email, tg_chat_id")
    .in("id", [attack.defender_id, attack.attacker_id]);
  const to = people?.find((p) => p.id === attack.defender_id);
  const from = people?.find((p) => p.id === attack.attacker_id);
  if (!to?.tg_chat_id || !from) return Response.json({ ok: true, sent: false });

  const text =
    `На твой склад летит налёт от «${nameOf(from)}» — ${attack.drones} дронов. ` +
    `Отбивай, когда готов: очередь не пропускается. ${SITE}`;

  await send(Number(to.tg_chat_id), text);
  return Response.json({ ok: true, sent: true });
}
