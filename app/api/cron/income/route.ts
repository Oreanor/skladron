// Ежедневная отгрузка. Раз в сутки Vercel зовёт эту ручку (расписание — в
// vercel.json): сервер сам отгружает склады тех, у кого привязан телеграм,
// и пишет им, сколько дронов ушло и за сколько. Без этой ручки отгрузка шла
// только при входе в игру, и узнать о ней можно было, лишь зайдя.
//
// Vercel подписывает вызов заголовком Authorization: Bearer <CRON_SECRET> —
// секрет задаётся в переменных окружения проекта.

import { createClient } from "@supabase/supabase-js";
import { sendTelegram as send, telegramReady } from "@/lib/server/telegram";
import { nameOf } from "@/lib/server/battleNotify";
import { tg, tgLocale, type TgLocale } from "@/lib/server/tgText";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.CRON_SECRET;

/** Пауза между письмами — чтобы не упереться в лимиты Telegram. */
const PAUSE_MS = 40;

type Row = {
  id: string;
  tg_chat_id: string;
  base_name: string | null;
  display_name: string | null;
  email: string | null;
  locale: string | null;
};

type Shipment = { credits_added: number; days: number; sold_drones: number; sold_credits: number };

/** Текст отчёта: что продано и за сколько. */
function shipmentMessage(l: TgLocale, base: string, s: Shipment): string {
  return tg(l, "shipmentSold", { base, drones: s.sold_drones, credits: s.sold_credits });
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export async function GET(request: Request) {
  if (!SECRET || request.headers.get("authorization") !== `Bearer ${SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!URL || !SERVICE || !telegramReady) {
    return Response.json({ ok: false, reason: "not configured" });
  }
  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

  const people: Row[] = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from("profiles")
      .select("id, tg_chat_id, base_name, display_name, email, locale")
      .not("tg_chat_id", "is", null)
      .order("id")
      .range(from, from + page - 1);
    if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
    people.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < page) break;
  }

  let shipped = 0;
  let sent = 0;
  let failed = 0;
  for (const p of people) {
    const { data, error } = await db.rpc("collect_income_for", { uid: p.id });
    if (error) {
      failed++;
      continue;
    }
    const s = (Array.isArray(data) ? data[0] : data) as Shipment | undefined;
    // дронов не было или игрок заходил после полуночи и всё уже получил
    if (!s || s.sold_drones <= 0) continue;
    shipped++;
    const chat = Number(p.tg_chat_id);
    if (!Number.isFinite(chat)) continue;
    if (sent + failed > 0) await sleep(PAUSE_MS);
    const l = tgLocale(p.locale);
    if (await send(chat, shipmentMessage(l, nameOf(p, l), s))) sent++;
    else failed++;
  }

  return Response.json({ ok: true, players: people.length, shipped, sent, failed });
}
