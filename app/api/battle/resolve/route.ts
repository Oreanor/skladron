// Итог настоящего налёта. Клиент присылает только запись своих рук — всё
// остальное сервер берёт из своей базы и прогоняет бой сам.
//
// Раньше исход считал и присылал защитник, а сервер лишь сверял сожжённые
// клетки с присланной им же картой. Значит, «отбился без потерь» было его
// личным решением, а нападающему за каждую сожжённую клетку капала премия,
// взявшаяся из ниоткуда: два сговорившихся склада печатали кредиты. Теперь
// с клиента не берётся ни карта, ни исход.
//
// Расчёт идёт по снимку из claim_attack: между чтением склада и записью
// итога нельзя успеть купить или переставить имущество так, чтобы старый
// результат наложился на новый склад.

import { createClient } from "@supabase/supabase-js";
import { decodeCells, type Depot, type Gun } from "@/lib/base";
import type { AttackOrder, Pattern, WavePlan } from "@/lib/attack";
import { resolveBattle } from "@/lib/resolve";
import { notifyResolvedRaid } from "@/lib/telegramBattleNotify";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Кто просит. Токен проверяем у Supabase, на слово клиенту не верим. */
async function caller(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !URL || !ANON) return null;
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await db.auth.getUser(token);
  return data.user?.id ?? null;
}

interface AttackRow {
  id: string;
  attacker_id: string;
  defender_id: string;
  status: string;
}

interface ClaimRow {
  token: string;
  cells: string;
  guns: Gun[];
  depots: Depot[];
  levels: Record<string, number> | null;
  drones: number;
  pattern: Pattern;
  direction: number;
  seed: number;
  waves: WavePlan[] | null;
  drone_level: number | null;
  simulation_version: number | null;
}

export async function POST(request: Request) {
  if (!URL || !ANON || !SERVICE) {
    return Response.json({ error: "not configured" }, { status: 500 });
  }

  const { attackId, trace } = (await request.json()) as {
    attackId?: string;
    trace?: string;
  };
  if (!attackId) return Response.json({ error: "bad request" }, { status: 400 });
  // Запись — это сжатые кадры прицела. Ограничиваем длину: разжимать
  // мегабайты чужой строки на сервере незачем.
  if (typeof trace !== "string" || trace.length > 400_000) {
    return Response.json({ error: "bad trace" }, { status: 400 });
  }

  const uid = await caller(request);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });

  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

  const { data: attack } = await db
    .from("attacks")
    .select("id, attacker_id, defender_id, status")
    .eq("id", attackId)
    .maybeSingle<AttackRow>();
  if (!attack) return Response.json({ error: "no such battle" }, { status: 404 });
  // Отбивается только тот, на кого летят. Чужой бой за себя не закроешь.
  if (attack.defender_id !== uid) {
    return Response.json({ error: "not your battle" }, { status: 403 });
  }
  if (attack.status !== "pending") {
    return Response.json({ error: "attack already resolved" }, { status: 409 });
  }

  // Claim атомарно снимает слепок и версию склада. Бой считаем только по ним.
  const { data: claimed, error: claimError } = await db.rpc("claim_attack", {
    attack_id: attackId,
  });
  if (claimError) {
    const msg = claimError.message ?? "";
    if (msg.includes("already resolving")) {
      return Response.json({ error: "battle is already resolving" }, { status: 409 });
    }
    if (msg.includes("already resolved")) {
      return Response.json({ error: "attack already resolved" }, { status: 409 });
    }
    return Response.json({ error: msg || "claim failed" }, { status: 400 });
  }

  const snap = (claimed as ClaimRow[] | null)?.[0];
  if (!snap) return Response.json({ error: "claim failed" }, { status: 400 });

  const levels = snap.levels ?? {};
  const order: AttackOrder = {
    id: attack.id,
    from: "",
    createdAt: 0,
    drones: snap.drones,
    pattern: snap.pattern,
    direction: snap.direction,
    seed: snap.seed,
    waves: snap.waves ?? undefined,
    droneLevel: snap.drone_level ?? 1,
    simulationVersion: snap.simulation_version ?? 1,
  };

  /**
   * Заявку снимаем на любом отказе. Иначе сорвавшийся расчёт две минуты
   * держал бы бой занятым: повторить нельзя, а очередь у защитника одна —
   * за ней встают все следующие налёты.
   */
  const giveUp = async (message: string, status: number) => {
    await db.rpc("release_attack", { attack_id: attackId, claim_token: snap.token });
    return Response.json({ error: message }, { status });
  };

  let verdict;
  try {
    verdict = resolveBattle({
      cells: decodeCells(snap.cells),
      guns: snap.guns ?? [],
      depots: snap.depots ?? [],
      order,
      levels: {
        guns: levels.guns ?? 1,
        rockets: levels.rockets ?? 1,
        sprays: levels.sprays ?? 1,
        traps: levels.traps ?? 1,
        mg: levels.mg ?? 1,
        water: levels.water ?? 1,
      },
      trace,
    });
  } catch (err) {
    return giveUp(err instanceof Error ? err.message : "battle failed", 400);
  }

  const { data, error } = await db.rpc("resolve_attack", {
    attack_id: attackId,
    new_cells: verdict.cells,
    new_guns: verdict.guns,
    new_depots: verdict.depots,
    result: verdict.result,
    battle_trace: trace,
    claim_token: snap.token,
  });
  // Сюда попадаем и когда склад успел измениться между заявкой и записью:
  // resolve_attack сверяет снимок и отказывается. Заявку снимаем, чтобы
  // защитник мог отбиться заново, а не ждал две минуты.
  if (error) return giveUp(error.message, 400);

  try {
    await notifyResolvedRaid(db, attackId);
  } catch {
    // Telegram — приятная мелочь; исход боя уже записан.
  }

  const row = (data as { credits: number; intact: number }[] | null)?.[0];
  return Response.json({
    ok: true,
    credits: row?.credits,
    intact: row?.intact,
    result: verdict.result,
    won: verdict.won,
  });
}
