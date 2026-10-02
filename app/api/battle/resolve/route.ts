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
import { SIMULATION_VERSION } from "@/lib/tuning";
import { notifyResolvedRaid } from "@/lib/server/battleNotify";
import { caller } from "@/lib/server/auth";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  levels: Record<"guns" | "rockets" | "sprays" | "traps" | "balloons" | "mg" | "water", number>;
  drones: number;
  pattern: Pattern;
  direction: number;
  seed: number;
  waves: WavePlan[];
  drone_level: number;
  simulation_version: number;
}

export async function POST(request: Request) {
  if (!URL || !SERVICE) {
    return Response.json({ error: "not configured" }, { status: 500 });
  }

  const { attackId, trace, version } = (await request.json()) as {
    attackId?: string;
    trace?: string;
    /** Версия движка, которым защитник играл бой у себя. */
    version?: number;
  };
  if (!attackId) return Response.json({ error: "bad request" }, { status: 400 });
  // Бой засчитываем только той версией движка, которой его и играли. Вкладка
  // со старым кодом играла по старым правилам, а сервер пересчитал бы её
  // запись по новым — и молча записал бы другой исход: на экране «уцелело
  // 90%», а в базе сгорел склад. Отказ — и игрок перезагружает страницу.
  if (version !== SIMULATION_VERSION) {
    return Response.json(
      { error: `unsupported simulation version: client ${version}, server ${SIMULATION_VERSION}` },
      { status: 409 }
    );
  }
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

  const order: AttackOrder = {
    id: attack.id,
    from: "",
    createdAt: 0,
    drones: snap.drones,
    pattern: snap.pattern,
    direction: snap.direction,
    seed: snap.seed,
    waves: snap.waves,
    droneLevel: snap.drone_level,
    simulationVersion: snap.simulation_version,
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
      guns: snap.guns,
      depots: snap.depots,
      order,
      levels: {
        guns: snap.levels.guns,
        rockets: snap.levels.rockets,
        sprays: snap.levels.sprays,
        traps: snap.levels.traps,
        balloons: snap.levels.balloons,
        mg: snap.levels.mg,
        water: snap.levels.water,
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
