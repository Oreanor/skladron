// Отправка сообщения ботом. Одна на всех: и извещения о боях, и ответы бота,
// и рассылка — раньше у каждой ручки была своя копия.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/** Бот настроен — есть кем писать. */
export const telegramReady = Boolean(TOKEN);

/** Пишет в чат. Без токена молча ничего не делает; true — Telegram принял. */
export async function sendTelegram(chatId: number, text: string): Promise<boolean> {
  if (!TOKEN) return false;
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return res.ok;
}
