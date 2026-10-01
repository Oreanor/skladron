// Вебхук бота. Умеет одно: по «/start код» запомнить чат игрока, чтобы
// потом слать ему извещения. Всё остальное вежливо игнорируем.

import { createClient } from "@supabase/supabase-js";
import { sendTelegram as reply } from "@/lib/server/telegram";

// Телеграм присылает секрет в заголовке — им и отсекаем чужие запросы.
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  // Падаем закрыто: без секрета ручку не пускаем вовсе. Раньше при пустой
  // переменной проверка просто пропускалась, и недонастроенный деплой
  // оказывался открытым вебхуком.
  if (!SECRET) return new Response("not configured", { status: 500 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return new Response("no", { status: 401 });
  }
  if (!URL || !SERVICE) return new Response("not configured", { status: 500 });

  const update = (await request.json()) as {
    message?: { chat?: { id?: number }; text?: string };
  };
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (!chatId) return Response.json({ ok: true });

  const code = /^\/start\s+(\S+)/.exec(text)?.[1];
  if (!code) {
    await reply(chatId, "Открой игру, зайди в меню и нажми «Телеграм» — там будет ссылка.");
    return Response.json({ ok: true });
  }

  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("profiles")
    .update({ tg_chat_id: chatId })
    .eq("tg_code", code)
    .select("base_name, email")
    .maybeSingle();

  if (error || !data) {
    await reply(chatId, "Такой ссылки не знаю. Возьми свежую в меню игры.");
    return Response.json({ ok: true });
  }

  const name = data.base_name ?? data.email ?? "склад";
  await reply(chatId, `Готово. Буду писать сюда про налёты на «${name}» и про исход твоих.`);
  return Response.json({ ok: true });
}
