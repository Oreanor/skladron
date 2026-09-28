/**
 * Разрешение боя — то, что считает сервер, а не клиент.
 *
 * Бой детерминирован целиком: карта, пушки, ящики, уровни, расписание вылетов
 * и зерно случайности известны серверу, а недетерминированы только руки
 * защитника. Значит, клиенту незачем присылать исход — достаточно записи его
 * рук, а всё остальное сервер прогоняет сам и получает тот же результат.
 *
 * Раньше исход присылал защитник, а сервер лишь сверял сожжённые клетки с
 * присланной картой. Карту он присылал тоже сам, так что «отбился без потерь»
 * или «выгорел дотла» было его личным решением: во втором случае нападающему
 * капала премия за каждую клетку, взявшаяся из ниоткуда, и два сговорившихся
 * склада печатали кредиты. Теперь ни карта, ни исход с клиента не берутся.
 */

import { GRID, decodeCells, encodeRle, type Depot, type Gun } from "./base";
import { buildPlan, type AttackOrder } from "./attack";
import { levelBonus } from "./economy";
import {
  createBattle,
  setAim,
  setFiring,
  settle,
  update,
  type BattleLevels,
  type BattleResult,
  type GameState,
} from "./engine";
import { decodeTrace, type Frame } from "./replay";
import { AUTO, SIM } from "./tuning";

export interface Verdict {
  /** Склад после боя, уже в том виде, в каком ложится в базу. */
  cells: string;
  guns: { cx: number; cy: number; kind?: "spray" }[];
  depots: Depot[];
  result: BattleResult;
  /** Сколько целых клеток осталось: по ним считается, снесён ли склад. */
  intact: number;
  won: boolean;
}

/** Что дежурная смена помнит между кадрами. */
interface Crew {
  /** До какой секунды держать нынешнюю цель. */
  until: number;
  /** До какой секунды длится перевод прицела: в это время не стреляют. */
  swingUntil: number;
  at: Frame | null;
}

const newCrew = (): Crew => ({ until: -1, swingUntil: 0, at: null });

/**
 * Дежурная смена у пулемёта и брандспойта.
 *
 * Бьёт по ближайшему к складу дрону, а если дронов рядом нет — тушит
 * ближайший очаг. Живого игрока не заменяет и не должна: цель перебирает
 * раз в reaction, и пока переводит прицел — не стреляет. Прокачка пулемёта
 * и брандспойта смену ускоряет, но упирается в пол: как бы высоко ни
 * забрался уровень, автомат остаётся заметно медлительнее рук, иначе играть
 * самому будет незачем. Какой из двух уровней в ходу, зависит от того, по
 * дрону работают или по огню.
 */
function autoHands(s: GameState, crew: Crew, at: number): Frame | null {
  const held = () =>
    crew.at && (at >= crew.swingUntil ? crew.at : { ...crew.at, firing: false });
  if (at < crew.until) return held();

  const mid = GRID / 2;
  let best: { x: number; y: number } | null = null;
  let bestD = AUTO.reach * AUTO.reach;
  for (const d of s.drones) {
    if (d.hit) continue;
    const dx = d.x - mid;
    const dy = d.y - mid;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) {
      bestD = dd;
      best = { x: Math.floor(d.x), y: Math.floor(d.y) };
    }
  }

  const onDrone = best !== null;
  if (!best) {
    // Дронов поблизости нет — переключаемся на пожар.
    let fireD = Infinity;
    for (const i of s.fire.keys()) {
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const dd = (x + 0.5 - mid) ** 2 + (y + 0.5 - mid) ** 2;
      if (dd < fireD) {
        fireD = dd;
        best = { x, y };
      }
    }
  }

  // Чем по чему работаем, тем и ускоряемся: дроны — пулемёт, огонь — струя.
  const level = onDrone ? s.mgLevel : s.waterLevel;
  const faster = levelBonus(level, AUTO.perLevel);
  crew.until = at + Math.max(AUTO.reactionMin, AUTO.reaction / faster);

  const moved = !crew.at || !best || crew.at.x !== best.x || crew.at.y !== best.y;
  crew.at = best ? { x: best.x, y: best.y, firing: true } : null;
  if (moved) crew.swingUntil = at + Math.max(AUTO.swingMin, AUTO.swing / faster);
  return held();
}

export interface BattleInput {
  /** Склад защитника на момент боя — серверная копия, не присланная. */
  cells: Uint8Array | string;
  guns: Gun[];
  depots: Depot[];
  /** Заказ нападающего целиком: волны, зерно, уровень его дронов. */
  order: AttackOrder;
  /** Уровни защитника: пушки, огнетушители, пулемёт, брандспойт. */
  levels: BattleLevels;
  /** Запись рук защитника. Пустая — значит он не пришёл, и бой идёт сам. */
  trace: string;
}

/**
 * Прогоняет бой и отдаёт его единственно верный исход.
 *
 * Шаг за шагом повторяем то же, что делал бой у защитника: сначала ставим
 * прицел и гашетку такими, какими они были на этом шаге, потом двигаем
 * симуляцию. Порядок важен — поменяй его, и исход разойдётся с тем, что
 * видел игрок.
 *
 * Когда запись кончилась, а бой ещё идёт, доигрываем без рук: так же ведёт
 * себя и повтор у нападающего. Дольше SIM.unattendedSeconds не крутим —
 * к этому времени догорание уже ничего не меняет.
 */
export function resolveBattle(input: BattleInput): Verdict {
  const cells = typeof input.cells === "string" ? decodeCells(input.cells) : input.cells;
  const s = createBattle(cells, input.guns, input.depots, buildPlan(input.order), {
    ...input.levels,
    drones: input.order.droneLevel ?? 1,
    seed: input.order.seed,
  });

  const frames = decodeTrace(input.trace);
  // Пустая запись — значит защитник не пришёл вовсе, и за пулемёт с
  // брандспойтом встаёт дежурная смена. Пустой кадр посреди записи — совсем
  // другое дело: игрок был, просто убрал прицел с карты, и подменять его
  // автоматикой нельзя.
  const crew = frames.length === 0 ? newCrew() : null;

  const cap = Math.ceil(SIM.unattendedSeconds / SIM.step);
  for (let step = 0; step < cap && s.phase === "playing"; step++) {
    const f = crew ? autoHands(s, crew, step * SIM.step) : frames[step] ?? null;
    // Прицел записан клеткой, а бой считает долями: целимся в середину,
    // ровно как это делает сам бой.
    setAim(s, f ? { x: f.x + 0.5, y: f.y + 0.5 } : null);
    setFiring(s, Boolean(f?.firing));
    update(s, SIM.step);
  }

  const out = settle(s);
  let intact = 0;
  for (const v of out.cells) if (v === 1) intact++;

  return {
    cells: encodeRle(out.cells),
    guns: out.guns,
    depots: out.depots,
    result: out.result,
    intact,
    won: s.phase !== "lost",
  };
}
