// Разовая рассылка в Telegram всем с привязанным tg_chat_id.
//
// Один раз после деплоя (подставь свой хост и секрет из TELEGRAM_BROADCAST_SECRET):
//   curl -X POST "https://YOUR_HOST/api/telegram/broadcast" \
//     -H "x-telegram-broadcast-secret: YOUR_SECRET"
//
// Ответ: { ok, sent, failed, total } — сообщения идут по очереди (~40 ms), чтобы
// не упереться в лимиты Telegram.

import { createClient } from "@supabase/supabase-js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.TELEGRAM_BROADCAST_SECRET;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://skladron.vercel.app";

const MESSAGE =
  `В складроне появились аватарки склада — поставь свою в настройках: ${SITE}`;

const PAUSE_MS = 40;

function sleep(ms: number) {
  return new Promise((done) => setTimeout(done, ms));
}

async function send(chatId: number, text: string): Promise<boolean> {
  if (!TOKEN) return false;
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return res.ok;
}

export async function POST(request: Request) {
  const header = request.headers.get("x-telegram-broadcast-secret");
  if (!SECRET || header !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!URL || !SERVICE || !TOKEN) {
    return Response.json({ ok: false, reason: "not configured" });
  }

  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

  const chatIds: number[] = [];
  const page = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("profiles")
      .select("tg_chat_id")
      .not("tg_chat_id", "is", null)
      .order("id")
      .range(from, from + page - 1);
    if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
    const rows = data ?? [];
    for (const row of rows) {
      const id = Number(row.tg_chat_id);
      if (Number.isFinite(id)) chatIds.push(id);
    }
    if (rows.length < page) break;
    from += page;
  }

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < chatIds.length; i++) {
    if (i > 0) await sleep(PAUSE_MS);
    if (await send(chatIds[i], MESSAGE)) sent++;
    else failed++;
  }

  return Response.json({ ok: true, sent, failed, total: chatIds.length });
}
