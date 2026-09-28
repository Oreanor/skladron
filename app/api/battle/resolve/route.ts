// Итог настоящего налёта. Клиент присылает только запись своих рук — всё
// остальное сервер берёт из своей базы и прогоняет бой сам.
//
// Раньше исход считал и присылал защитник, а сервер лишь сверял сожжённые
// клетки с присланной им же картой. Значит, «отбился без потерь» было его
// личным решением, а нападающему за каждую сожжённую клетку капала премия,
// взявшаяся из ниоткуда: два сговорившихся склада печатали кредиты. Теперь
// с клиента не берётся ни карта, ни исход.

import { createClient } from "@supabase/supabase-js";
import { decodePgBytea, type Depot, type Gun } from "@/lib/base";
import type { AttackOrder, Pattern, WavePlan } from "@/lib/attack";
import { resolveBattle } from "@/lib/resolve";

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
  drones: number;
  pattern: Pattern;
  direction: number;
  seed: number;
  waves: WavePlan[] | null;
  drone_level: number | null;
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
    .select("id, attacker_id, defender_id, status, drones, pattern, direction, seed, waves, drone_level")
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

  // Склад, пушки и ящики — серверные, какими они лежат прямо сейчас. Их же
  // увидит нападающий в повторе: resolve_attack снимает слепок до боя.
  const [{ data: base }, { data: profile }] = await Promise.all([
    db
      .from("bases")
      .select("cells, guns, drone_cells")
      .eq("user_id", uid)
      .maybeSingle<{ cells: string; guns: Gun[]; drone_cells: Depot[] }>(),
    db
      .from("profiles")
      .select("levels")
      .eq("id", uid)
      .maybeSingle<{ levels: Record<string, number> | null }>(),
  ]);
  if (!base) return Response.json({ error: "no base" }, { status: 404 });

  const levels = profile?.levels ?? {};
  const order: AttackOrder = {
    id: attack.id,
    from: "",
    createdAt: 0,
    drones: attack.drones,
    pattern: attack.pattern,
    direction: attack.direction,
    seed: attack.seed,
    waves: attack.waves ?? undefined,
    droneLevel: attack.drone_level ?? 1,
  };

  const verdict = resolveBattle({
    cells: decodePgBytea(base.cells),
    guns: base.guns ?? [],
    depots: base.drone_cells ?? [],
    order,
    levels: {
      guns: levels.guns ?? 1,
      sprays: levels.sprays ?? 1,
      mg: levels.mg ?? 1,
      water: levels.water ?? 1,
    },
    trace,
  });

  const { data, error } = await db.rpc("resolve_attack", {
    attack_id: attackId,
    new_cells: verdict.cells,
    new_guns: verdict.guns,
    new_depots: verdict.depots,
    result: verdict.result,
    battle_trace: trace,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const row = (data as { credits: number; intact: number }[] | null)?.[0];
  return Response.json({
    ok: true,
    credits: row?.credits,
    intact: row?.intact,
    result: verdict.result,
    won: verdict.won,
  });
}
