// Чертежи склада: сохранённая раскладка и цена перестройки по ней.
//
// Перестройка — это снос нынешнего склада с продажей всего, что на нём
// стоит и лежит, и постройка чертежа на его месте по тем же ценам. Платится
// разница; вся арифметика повторяет build_blueprint в SQL слово в слово —
// окно показывает ровно то, что спишет сервер.

import {
  G_BASE,
  G_BURNT,
  GRID,
  countKind,
  decodeRle,
  encodeRle,
  type Depot,
  type Gun,
} from "./base";
import {
  BALLOON_UNIT_COST,
  CELL_COST,
  DRONE_UNIT_COST,
  GUN_COST,
  ROCKET_COST,
  SCRAP_REWARD,
  SPRAY_COST,
  STARTER_CELLS,
  TRAP_COST,
  priceAt,
} from "./economy";
import type { Levels, Player } from "./player";

/** Больше чертежей держать не дают: их всё равно листать глазами. */
export const MAX_BLUEPRINTS = 20;
export const MAX_BLUEPRINT_NAME = 40;

export interface Blueprint {
  id: string;
  name: string;
  /** Клетки в RLE: только земля и целые клетки склада. */
  cells: string;
  guns: Gun[];
  depots: Depot[];
  createdAt: number;
}

/** Раскладка нынешнего склада как чертёж: гарь — снова склад, следы — трава. */
export function blueprintOf(p: Pick<Player, "cells" | "guns" | "depots">) {
  const cells = new Uint8Array(GRID * GRID);
  for (let i = 0; i < cells.length; i++) {
    const v = p.cells[i];
    cells[i] = v === G_BASE || v === G_BURNT || v === 2 ? G_BASE : 0;
  }
  return {
    cells: encodeRle(cells),
    guns: p.guns.map((g) => (g.kind && g.kind !== "gun" ? { cx: g.cx, cy: g.cy, kind: g.kind } : { cx: g.cx, cy: g.cy })),
    depots: p.depots.map((d) => (d.kind === "balloon" ? { cx: d.cx, cy: d.cy, n: d.n, kind: d.kind } : { cx: d.cx, cy: d.cy, n: d.n })),
  };
}

const countCells = (cells: Uint8Array, v: number) => {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] === v) n++;
  return n;
};

const sumKind = (depots: Depot[], balloons: boolean) =>
  depots.reduce((n, d) => ((d.kind === "balloon") === balloons ? n + d.n : n), 0);

/** Установки по нынешней цене закупки с учётом уровней. */
export function installValue(guns: Gun[], lv: Levels) {
  return (
    countKind(guns, "gun") * priceAt(GUN_COST, lv.guns) +
    countKind(guns, "rocket") * priceAt(ROCKET_COST, lv.rockets) +
    countKind(guns, "spray") * priceAt(SPRAY_COST, lv.sprays) +
    countKind(guns, "trap") * priceAt(TRAP_COST, lv.traps)
  );
}

/** Содержимое контейнеров по цене закупки. */
export function goodsValue(depots: Depot[], lv: Levels) {
  return (
    sumKind(depots, false) * priceAt(DRONE_UNIT_COST, lv.drones) +
    sumKind(depots, true) * BALLOON_UNIT_COST
  );
}

/** Что входит в чертёж: площадь, установки по видам, дроны и шары. */
export function blueprintCounts(b: Pick<Blueprint, "cells" | "guns" | "depots">) {
  const cells = decodeRle(b.cells);
  return {
    area: countCells(cells, G_BASE),
    gun: countKind(b.guns, "gun"),
    rocket: countKind(b.guns, "rocket"),
    spray: countKind(b.guns, "spray"),
    trap: countKind(b.guns, "trap"),
    drones: sumKind(b.depots, false),
    balloons: sumKind(b.depots, true),
  };
}

/**
 * Перестройка по чертежу: сколько стоит сам чертёж, сколько выручено за
 * снесённый склад и сколько из этого придётся доплатить (минус — придёт).
 */
export function rebuildCost(p: Player, b: Pick<Blueprint, "cells" | "guns" | "depots">) {
  const plan = decodeRle(b.cells);
  const price =
    Math.max(0, countCells(plan, G_BASE) - STARTER_CELLS) * CELL_COST +
    installValue(b.guns, p.levels) +
    goodsValue(b.depots, p.levels);
  const sold =
    Math.max(0, countCells(p.cells, G_BASE) - STARTER_CELLS) * CELL_COST +
    countCells(p.cells, G_BURNT) * SCRAP_REWARD +
    installValue(p.guns, p.levels) +
    goodsValue(p.depots, p.levels);
  return { price, sold, delta: price - sold };
}
