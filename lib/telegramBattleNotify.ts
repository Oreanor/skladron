// Извещение нападающему об исходе удалённого налёта. Общая логика для
// /api/telegram/notify и /api/battle/resolve — один слот resolved_notified_at.

import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://skladron.vercel.app";

type ProfileRow = {
  id: string;
  base_name: string | null;
  display_name: string | null;
  email: string | null;
  tg_chat_id: string | null;
};

type AttackRow = {
  id: string;
  attacker_id: string;
  defender_id: string;
  status: string;
  result: unknown;
  loot: number | null;
  destroyed: boolean;
  resolved_notified_at: string | null;
};

export const nameOf = (p: {
  base_name: string | null;
  display_name: string | null;
  email: string | null;
}) => p.base_name ?? p.display_name ?? p.email?.split("@")[0] ?? "склад";

async function send(chatId: number, text: string) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

/** Текст для нападающего: исход с его точки зрения. */
export function resolvedRaidMessage(
  defenderName: string,
  attack: Pick<AttackRow, "id" | "result" | "loot" | "destroyed">
): string {
  const burned = (attack.result as { burned?: number } | null)?.burned ?? 0;
  const loot = attack.loot ?? 0;
  const replay = `${SITE}/replay/${attack.id}`;

  if (attack.destroyed) {
    return (
      `«${defenderName}» отыграл защиту — склад выгорел дотла. Премия ${loot} кр. ` +
      `Повтор боя: ${replay}`
    );
  }
  if (burned === 0) {
    return `«${defenderName}» отбил твой налёт без потерь. Повтор боя: ${replay}`;
  }
  return (
    `«${defenderName}» отыграл защиту. Сгорело клеток: ${burned}, премия ${loot} кр. ` +
    `Повтор боя: ${replay}`
  );
}

/**
 * Атомарно занимает resolved_notified_at и шлёт нападающему, если привязан Telegram.
 * Повторный вызов (клиент + сервер) безопасен.
 */
export async function notifyResolvedRaid(
  db: SupabaseClient,
  attackId: string
): Promise<{ sent: boolean; error?: string }> {
  const { data: attack, error: loadError } = await db
    .from("attacks")
    .select(
      "id, attacker_id, defender_id, status, result, loot, destroyed, resolved_notified_at"
    )
    .eq("id", attackId)
    .maybeSingle<AttackRow>();
  if (loadError) return { sent: false, error: loadError.message };
  if (!attack || attack.status !== "resolved") return { sent: false };
  if (attack.resolved_notified_at) return { sent: false };

  const stamp = new Date().toISOString();
  const { data: claimed, error: claimError } = await db
    .from("attacks")
    .update({ resolved_notified_at: stamp })
    .eq("id", attackId)
    .eq("status", "resolved")
    .is("resolved_notified_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) return { sent: false, error: claimError.message };
  if (!claimed) return { sent: false };

  const { data: people } = await db
    .from("profiles")
    .select("id, base_name, display_name, email, tg_chat_id")
    .in("id", [attack.attacker_id, attack.defender_id]);
  const attacker = people?.find((p) => p.id === attack.attacker_id) as ProfileRow | undefined;
  const defender = people?.find((p) => p.id === attack.defender_id) as ProfileRow | undefined;
  if (!attacker?.tg_chat_id || !defender) return { sent: false };

  await send(Number(attacker.tg_chat_id), resolvedRaidMessage(nameOf(defender), attack));
  return { sent: true };
}
