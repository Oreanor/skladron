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

const MESSAGE = [
  "Складрон за день подрос. Коротко, что нового.",
  "",
  "Ракетницы. Тот же лафет, что у зенитки, но достают вдвое дальше. Пускают",
  "неточно, зато ракета сама доворачивает на ближайший дрон и сверяется",
  "каждый миг, кто теперь ближе. В воздухе держат одну, перезарядка три",
  "секунды, стоят вдвое против зенитки.",
  "",
  "Шары заграждения. Контейнер на десяток — полсотни кредитов. Налёт",
  "выпускает разом все, что лежат на складе: дрон, влетевший в шар, гибнет",
  "вместе с ним, и склад при этом цел. Но и снаряд твоей же зенитки лопнет",
  "шар на своём пути, так что сплошную стену вешать себе дороже.",
  "",
  "Две новые начинки дронов. Невидимка: зенитки и ракетницы её не видят",
  "вовсе — ни целятся, ни наводят ракету, остаются руки и ловушки.",
  "Размагничивание: пока висит над магнитом, тот никого не держит и",
  "отпускает захваченных.",
  "",
  "Премия за налёт больше не плоская. Она растёт с долей сожжённого: за",
  "половину склада платят на четверть больше за клетку, за весь — втрое.",
  "Добить одного выгоднее, чем пощипать десятерых.",
  "",
  "Прокачка пушек наконец даёт темп. На десятом уровне перезарядка 0,7 с",
  "вместо трёх — раньше уровень прибавлял только дальность, и прокачанная",
  "зенитка стреляла так же редко, как только что купленная.",
  "",
  "Спираль и прочие закрученные заходы перестали ползти: до склада они",
  "доходят вдвое с лишним быстрее, чем вчера.",
  "",
  "По мелочи: бой кончается, когда догорело последнее, а не в тот миг,",
  "когда пал склад; премия за отбой и подушка после вайпа; заём до десяти",
  "тысяч; шестьдесят четыре аватарки и своя картинка; повтор боя с полосой",
  "прогресса и кнопкой «Ещё раз»; комментарии к налёту.",
].join("\n");

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
