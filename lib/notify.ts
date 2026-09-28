// Извещения в телеграм. Клиент только говорит «случилось вот это по такому
// бою» — кому и что писать, решает сервер: токена бота у клиента нет.
//
// Вместе с просьбой шлём свой токен входа: id боя — величина публичная, по
// нему открывается повтор, и без подписи ручкой мог бы дёргать кто угодно.

import { supabase } from "./supabase";

async function ask(attackId: string, event: "sent" | "resolved") {
  const db = supabase();
  if (!db) return;
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return; // без входа извещать не от чьего имени
  await fetch("/api/telegram/notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ attackId, event }),
    keepalive: true,
  });
}

export function notifyBattle(attackId: string, event: "sent" | "resolved") {
  if (typeof window === "undefined") return;
  void ask(attackId, event).catch(() => {
    // извещение — приятная мелочь, из-за него игра ломаться не должна
  });
}
