// Налёт, который никто не встретил. Если игрок не пришёл отбиваться за
// отведённые полчаса, атака всё равно проводится: пушки ПВО стреляют сами,
// а брандспойта и пулемётной очереди нет — некому.

import { type Depot, type Gun } from "./base";
import { type AttackOrder, buildPlan } from "./attack";
import { type BattleResult, createBattle, settle, update } from "./engine";

/** Хватает на любой рой: дальше догорание уже ничего не меняет. */
const MAX_SECONDS = 900;
const STEP = 1 / 60;

export interface UnattendedOutcome {
  cells: Uint8Array;
  guns: Gun[];
  depots: Depot[];
  result: BattleResult;
  won: boolean;
}

export function autoDefend(
  cells: Uint8Array,
  guns: Gun[],
  depots: Depot[],
  order: AttackOrder,
  gunLevel = 1
): UnattendedOutcome {
  // Пулемёта и брандспойта тут нет — некому: считаем только пушки.
  const s = createBattle(cells, guns, depots, buildPlan(order), {
    drones: order.droneLevel ?? 1,
    guns: gunLevel,
  });

  let t = 0;
  while (t < MAX_SECONDS && s.phase === "playing") {
    // никакого setAim и setFiring: склад отбивается одними пушками
    update(s, STEP);
    t += STEP;
  }

  // settle сам дотушивает: что горело к концу боя, становится пепелищем
  const out = settle(s);
  return { ...out, won: s.phase !== "lost" };
}
