// Извещения в телеграм. Клиент просит «сообщи по этому бою», а кому и что
// именно писать, решает сервер: у клиента нет ни токена бота, ни чужих чатов.

import { createClient } from "@supabase/supabase-js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://skladron.vercel.app";

type Event = "sent" | "resolved";

async function send(chatId: number, text: string) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

const nameOf = (p: { base_name: string | null; display_name: string | null; email: string | null }) =>
  p.base_name ?? p.display_name ?? p.email?.split("@")[0] ?? "склад";

export async function POST(request: Request) {
  if (!URL || !SERVICE || !TOKEN) return Response.json({ ok: false, reason: "not configured" });

  const { attackId, event } = (await request.json()) as { attackId?: string; event?: Event };
  if (!attackId || (event !== "sent" && event !== "resolved")) {
    return new Response("bad request", { status: 400 });
  }

  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data: attack } = await db
    .from("attacks")
    .select("id, attacker_id, defender_id, drones, status, result, loot")
    .eq("id", attackId)
    .maybeSingle();
  if (!attack) return new Response("no such battle", { status: 404 });

  // Пишем всегда второй стороне: о новом налёте — защитнику, об исходе —
  // нападавшему. Так извещение не зависит от того, кто дёрнул ручку.
  const toId = event === "sent" ? attack.defender_id : attack.attacker_id;
  const fromId = event === "sent" ? attack.attacker_id : attack.defender_id;

  const { data: people } = await db
    .from("profiles")
    .select("id, base_name, display_name, email, tg_chat_id")
    .in("id", [toId, fromId]);
  const to = people?.find((p) => p.id === toId);
  const from = people?.find((p) => p.id === fromId);
  if (!to?.tg_chat_id || !from) return Response.json({ ok: true, sent: false });

  const burned = (attack.result as { burned?: number } | null)?.burned ?? 0;
  const text =
    event === "sent"
      ? `На твой склад летит налёт от «${nameOf(from)}» — ${attack.drones} дронов. ` +
        `Полчаса на то, чтобы отбиться: ${SITE}`
      : `«${nameOf(from)}» отбил твой налёт. Сгорело клеток: ${burned}, премия ${attack.loot} кр. ` +
        `Повтор боя: ${SITE}/replay/${attack.id}`;

  await send(Number(to.tg_chat_id), text);
  return Response.json({ ok: true, sent: true });
}
