// Извещения в телеграм. Клиент только говорит «случилось вот это» —
// кому и что писать, решает сервер: токена бота у клиента нет.
//
// Вместе с просьбой шлём свой токен входа: id боя — величина публичная, по
// нему открывается повтор, и без подписи ручкой мог бы дёргать кто угодно.

import { supabase } from "./supabase";

type BattleEvent = "sent" | "resolved" | "comment";

async function post(body: Record<string, unknown>) {
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
    body: JSON.stringify(body),
    keepalive: true,
  });
}

function quiet(run: () => Promise<void>) {
  if (typeof window === "undefined") return;
  void run().catch(() => {
    // извещение — приятная мелочь, из-за него игра ломаться не должна
  });
}

export function notifyBattle(attackId: string, event: BattleEvent) {
  quiet(() => post({ attackId, event }));
}

/** Новая реплика по налёту — второму игроку уйдёт телеграм. */
export function notifyComment(attackId: string, commentId?: string) {
  quiet(() =>
    post({ attackId, event: "comment", ...(commentId ? { commentId } : {}) })
  );
}

/**
 * Нового соперника завели — ему уйдёт телеграм. Адрес отдаём серверу, а он
 * сверяет, что добавление и правда было: по одной просьбе клиента звенеть
 * в чужом чате нельзя.
 */
export function notifyRivalAdded(email: string) {
  quiet(() => post({ event: "rival", email }));
}

/** Написал сопернику — ему уйдёт телеграм с самой репликой. */
export function notifyMessage(email: string, messageId: string) {
  quiet(() => post({ event: "message", email, messageId }));
}

/** Состязание или отладочный налёт с ?raid=: второй стороны нет, пишем самому себе. */
export function notifyTestRaid(drones: number, stage?: number) {
  quiet(() =>
    post({
      event: "test",
      drones,
      ...(stage != null ? { stage } : {}),
    })
  );
}
