// Вебхук бота. Умеет одно: по «/start код» запомнить чат игрока, чтобы
// потом слать ему извещения. Всё остальное вежливо игнорируем.

import { createClient } from "@supabase/supabase-js";
import { sendTelegram as reply } from "@/lib/server/telegram";
import { tg, tgLocale } from "@/lib/server/tgText";

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
    message?: { chat?: { id?: number }; text?: string; from?: { language_code?: string } };
  };
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (!chatId) return Response.json({ ok: true });
  // профиля ещё не знаем — отвечаем на языке самого телеграма
  const asked = tgLocale(update.message?.from?.language_code);

  const code = /^\/start\s+(\S+)/.exec(text)?.[1];
  if (!code) {
    await reply(chatId, tg(asked, "noCode"));
    return Response.json({ ok: true });
  }

  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("profiles")
    .update({ tg_chat_id: chatId })
    .eq("tg_code", code)
    .select("base_name, email, locale")
    .maybeSingle();

  if (error || !data) {
    await reply(chatId, tg(asked, "badCode"));
    return Response.json({ ok: true });
  }

  const l = tgLocale(data.locale, update.message?.from?.language_code);
  const name = data.base_name ?? data.email ?? tg(l, "base");
  await reply(chatId, tg(l, "linked", { name }));
  return Response.json({ ok: true });
}
