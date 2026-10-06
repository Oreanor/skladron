// Чертежи склада: сохранённая раскладка и цена перестройки по ней.
//
// Чертёж — склад 1 в 1: площадь, установки и контейнеры с дронами там же и с
// тем же числом. Не сохраняются только повреждения: гарь — снова целая клетка.
//
// Перестройка — снос нынешнего склада с продажей всего, что на нём стоит и
// лежит, и постройка чертежа на его месте по тем же ценам, дроны — по нынешней
// цене закупки. Снят с этого же склада — за дронов выходит ноль, и они не
// пропадают. Платится разница; вся арифметика повторяет build_blueprint в SQL
// слово в слово — окно показывает ровно то, что спишет сервер.

import {
  G_BASE,
  G_BURNT,
  G_GROUND,
  GRID,
  countKind,
  decodeRle,
  droneCount,
  encodeRle,
  isBuilding,
  type Depot,
  type Gun,
} from "./base";
import { CELL_COST, SCRAP_REWARD, STARTER_CELLS, dronePrice } from "./economy";
import { gunCost } from "./build";
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
  /** Контейнеры с дронами. У чертежей, сохранённых до них, — пусто. */
  depots: Depot[];
  createdAt: number;
}

/** Нынешний склад как чертёж: гарь — снова склад, следы — трава, остальное как есть. */
export function blueprintOf(p: Pick<Player, "cells" | "guns" | "depots">) {
  const cells = new Uint8Array(GRID * GRID);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = isBuilding(p.cells[i]) ? G_BASE : G_GROUND;
  }
  return {
    cells: encodeRle(cells),
    guns: p.guns.map((g) => (g.kind && g.kind !== "gun" ? { cx: g.cx, cy: g.cy, kind: g.kind } : { cx: g.cx, cy: g.cy })),
    // только то, что сервер принимает в depots_valid: место и число
    depots: p.depots.map((d) => ({ cx: d.cx, cy: d.cy, n: d.n })),
  };
}

const countCells = (cells: Uint8Array, v: number) => {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] === v) n++;
  return n;
};


/** Установки по нынешней цене закупки с учётом уровней. */
export function installValue(guns: Gun[], lv: Levels) {
  return (
    countKind(guns, "gun") * gunCost(lv, "gun") +
    countKind(guns, "rocket") * gunCost(lv, "rocket") +
    countKind(guns, "spray") * gunCost(lv, "spray") +
    countKind(guns, "trap") * gunCost(lv, "trap") +
    countKind(guns, "balloon") * gunCost(lv, "balloon")
  );
}

/** Содержимое контейнеров по цене закупки. */
export function goodsValue(depots: Depot[], lv: Levels) {
  return depots.reduce((n, d) => n + d.n, 0) * dronePrice(lv.drones);
}

/** Что входит в чертёж: площадь, установки по видам и дроны. */
export function blueprintCounts(b: Pick<Blueprint, "cells" | "guns" | "depots">) {
  const cells = decodeRle(b.cells);
  return {
    area: countCells(cells, G_BASE),
    gun: countKind(b.guns, "gun"),
    rocket: countKind(b.guns, "rocket"),
    spray: countKind(b.guns, "spray"),
    trap: countKind(b.guns, "trap"),
    balloon: countKind(b.guns, "balloon"),
    drones: droneCount(b.depots),
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
