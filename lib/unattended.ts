// Налёт, который никто не встретил. Если игрок не пришёл отбиваться за
// отведённые полчаса, атака всё равно проводится: пушки и огнетушители
// работают сами, а брандспойта и пулемётной очереди нет — некому.
//
// Своей симуляции тут нет намеренно. Бой без рук — это тот же бой с пустой
// записью, и считает его тот же resolveBattle, которым сервер закрывает
// настоящие налёты. Будь их две, они рано или поздно разошлись бы, и клиент
// показывал бы игроку не тот исход, что потом придёт с сервера.

import { decodeRle, type Depot, type Gun } from "./base";
import { type AttackOrder } from "./attack";
import { type BattleLevels, type BattleResult } from "./engine";
import { resolveBattle } from "./resolve";

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
  levels: BattleLevels = {}
): UnattendedOutcome {
  const verdict = resolveBattle({ cells, guns, depots, order, levels, trace: "" });
  return {
    cells: decodeRle(verdict.cells),
    guns: verdict.guns,
    depots: verdict.depots,
    result: verdict.result,
    won: verdict.won,
  };
}
