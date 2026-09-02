// Извещения в телеграм. Клиент только говорит «случилось вот это по такому
// бою» — кому и что писать, решает сервер: токена бота у клиента нет.

export function notifyBattle(attackId: string, event: "sent" | "resolved") {
  if (typeof window === "undefined") return;
  void fetch("/api/telegram/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attackId, event }),
    keepalive: true,
  }).catch(() => {
    // извещение — приятная мелочь, из-за него игра ломаться не должна
  });
}
