/*
 * Стройка: что можно поставить на складе, во что это обойдётся и что от
 * этого меняется. Без React и без словаря — отсюда лобби берёт только
 * решение и цену, а показывает его само.
 *
 * Жило это всё внутри Lobby.tsx вперемешку с рисованием и состоянием
 * панелей, и проверить цену было нечем: кредиты списываются именно тут, а
 * прогон до этого места не доставал. Теперь достаёт — scripts/check-build.
 *
 * Уговор простой: функция либо отказывает и не трогает склад вовсе, либо
 * делает всё и возвращает, сколько списано. Отрицательное списание — это
 * выплата: так возвращает снос.
 */

import {
  G_BASE,
  G_BURNT,
  G_GROUND,
  GRID,
  type Depot,
  type Gun,
  type GunKind,
  type Rect,
  DRONES_PER_CELL,
  applyRect,
  gunKind,
  idx,
  isBuilding,
  isWhole,
  rectConnects,
  repairRect,
  sanitizeGuns,
  scrapRect,
  touchesBuilding,
  burntCellsIn,
  newCellsIn,
} from "./base";
import {
  BALLOON_COST,
  CELL_COST,
  DRONE_UNIT_COST,
  GUN_COST,
  REPAIR_COST,
  ROCKET_COST,
  SCRAP_REWARD,
  SPRAY_COST,
  TRAP_COST,
  priceAt,
} from "./economy";
import type { Levels, Player } from "./player";
import type { Key } from "./i18n/dict";

/**
 * Отказ называет причину ключом словаря: подобрать слова — дело лобби, а
 * решать, можно ли, — наше.
 */
export type BuildResult =
  | { ok: true; spent: number }
  | { ok: false; why: Key; vars?: Record<string, string | number> };

const no = (why: Key, vars?: Record<string, string | number>): BuildResult =>
  ({ ok: false, why, vars });
const done = (spent: number): BuildResult => ({ ok: true, spent });

/** Молча ничего не делаем: клик мимо, повтор по той же клетке и прочее. */
const skip: BuildResult = { ok: true, spent: 0 };

const onMap = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID;

// ---------- цены ----------

/**
 * Во что обойдётся установка этого рода при нынешней прокачке. Одна
 * функция и на кнопку с ценником, и на само списание: раньше это был один
 * и тот же switch, переписанный в двух местах, и цена на кнопке могла
 * разойтись с тем, что спишется.
 */
export function gunCost(levels: Levels, kind: GunKind): number {
  switch (kind) {
    case "spray":
      return priceAt(SPRAY_COST, levels.sprays);
    case "trap":
      return priceAt(TRAP_COST, levels.traps);
    case "rocket":
      return priceAt(ROCKET_COST, levels.rockets);
    case "balloon":
      return priceAt(BALLOON_COST, levels.balloons);
    default:
      return priceAt(GUN_COST, levels.guns);
  }
}

/** Во что обойдётся полный контейнер дронов. */
export function depotCost(levels: Levels): number {
  return priceAt(DRONE_UNIT_COST, levels.drones) * DRONES_PER_CELL;
}

// ---------- клетки ----------

/** Пристройка одной клетки. Оторванных кусков склада не заводим. */
export function buildOne(p: Player, x: number, y: number, hasBuilding: boolean): BuildResult {
  if (!onMap(x, y)) return skip;
  const i = idx(x, y);
  if (isBuilding(p.cells[i])) return skip;
  if (hasBuilding && !touchesBuilding(p.cells, x, y)) return no("draft.mustBeSolid");
  if (p.credits < CELL_COST) return no("draft.noCredits");

  p.cells[i] = G_BASE;
  p.credits -= CELL_COST;
  return done(CELL_COST);
}

/** Снос одной сгоревшей клетки. Если она держит склад вместе — не даём. */
export function scrapAt(p: Player, x: number, y: number): BuildResult {
  if (!onMap(x, y)) return skip;
  const i = idx(x, y);
  if (p.cells[i] !== G_BURNT) return skip;

  const cells = p.cells.slice();
  cells[i] = G_GROUND;
  if (!isWhole(cells)) return no("scrap.splits");

  p.cells = cells;
  p.credits += SCRAP_REWARD;
  return done(-SCRAP_REWARD);
}

/** Ремонт одной сгоревшей клетки. */
export function repairAt(p: Player, x: number, y: number): BuildResult {
  if (!onMap(x, y)) return skip;
  const i = idx(x, y);
  if (p.cells[i] !== G_BURNT) return skip;
  if (p.credits < REPAIR_COST) return no("repair.noCredits");

  const cells = p.cells.slice();
  cells[i] = G_BASE;
  p.cells = cells;
  p.credits -= REPAIR_COST;
  p.stats.cellsRepaired++;
  return done(REPAIR_COST);
}

// ---------- рамка ----------

/** Что выйдет из нынешней рамки: сколько клеток, почём и можно ли вообще. */
export interface DraftPlan {
  /** Сколько клеток изменится: новых, сгоревших под ремонт или под снос. */
  cells: number;
  /** Во что обойдётся. У сноса отрицательная — это выплата. */
  cost: number;
  /** Не разорвёт ли склад и пристраивается ли к нему. */
  connects: boolean;
}

export type DraftTool = "area" | "repair" | "scrap";

export function draftPlan(
  p: Player,
  tool: DraftTool,
  rect: Rect | null,
  hasBuilding: boolean
): DraftPlan {
  const cells = rect
    ? tool === "area"
      ? newCellsIn(p.cells, rect)
      : burntCellsIn(p.cells, rect)
    : 0;
  const cost =
    cells * (tool === "scrap" ? -SCRAP_REWARD : tool === "repair" ? REPAIR_COST : CELL_COST);

  // Ремонт ничего не пристраивает, значит разрывов создать не может. Снос
  // как раз создаёт — ему примеряем результат заранее. Площади надо
  // касаться того, что уже стоит.
  let connects: boolean;
  if (tool === "repair") connects = true;
  else if (tool === "scrap") {
    if (!rect || cells === 0) connects = true;
    else {
      const next = p.cells.slice();
      scrapRect(next, rect);
      connects = isWhole(next);
    }
  } else connects = rect ? rectConnects(p.cells, rect, hasBuilding) : false;

  return { cells, cost, connects };
}

/** Утверждение рамки. Считает по тому же плану, которым рисовался ценник. */
export function applyDraft(
  p: Player,
  tool: DraftTool,
  rect: Rect | null,
  hasBuilding: boolean
): BuildResult {
  if (!rect || rect.w <= 0 || rect.h <= 0) return skip;
  const plan = draftPlan(p, tool, rect, hasBuilding);
  if (!plan.connects) return no("draft.mustBeSolid");
  if (plan.cost > p.credits) return no("draft.needCredits", { cost: plan.cost });
  if (plan.cells === 0) return skip;

  const cells = p.cells.slice();
  switch (tool) {
    case "scrap":
      scrapRect(cells, rect);
      break;
    case "repair":
      repairRect(cells, rect);
      p.stats.cellsRepaired += plan.cells;
      break;
    default:
      applyRect(cells, rect);
      break;
  }
  p.cells = cells;
  p.credits -= plan.cost;
  return done(plan.cost);
}

// ---------- установки и контейнеры ----------

const gunOn = (guns: Gun[], x: number, y: number) =>
  guns.some((g) => g.cx === x && g.cy === y);
const depotOn = (depots: Depot[], x: number, y: number) =>
  depots.some((d) => d.cx === x && d.cy === y);

/** Покупка установки прямо на карте. */
export function placeGun(p: Player, x: number, y: number, kind: GunKind): BuildResult {
  if (!onMap(x, y)) return skip;
  if (p.cells[idx(x, y)] !== G_BASE) return no("gun.onlyIntact");
  if (depotOn(p.depots, x, y)) return no("gun.cellBusy");

  const cost = gunCost(p.levels, kind);
  if (p.credits < cost) return no("gun.noCredits");

  p.guns.push(kind === "gun" ? { cx: x, cy: y } : { cx: x, cy: y, kind });
  p.credits -= cost;
  return done(cost);
}

/**
 * Контейнер покупается так же, как пушка: ткнул в свободную клетку — ящик
 * на месте, деньги списаны. Сервер об этом узнаёт отдельно, и если он
 * откажет, лобби откатывает по сохранённому слепку.
 */
export function placeDepot(p: Player, x: number, y: number): BuildResult {
  if (!onMap(x, y)) return skip;
  if (p.cells[idx(x, y)] !== G_BASE) return no("depot.onlyIntact");
  if (gunOn(p.guns, x, y)) return no("depot.gunThere");
  if (depotOn(p.depots, x, y)) return skip;

  const cost = depotCost(p.levels);
  if (p.credits < cost) return no("depot.noCredits", { cost });

  p.depots = [...p.depots, { cx: x, cy: y, n: DRONES_PER_CELL }];
  p.credits -= cost;
  return done(cost);
}

/**
 * Что стоит на клетке, куда роняют, переезжает туда, откуда взяли: перенос
 * на занятую клетку — это обмен местами. Свободная — просто перенос.
 */
function swapInto(p: Player, from: { cx: number; cy: number }, x: number, y: number) {
  p.guns = sanitizeGuns(
    p.guns.map((g) => (g.cx === x && g.cy === y ? { ...g, cx: from.cx, cy: from.cy } : g))
  );
  p.depots = p.depots.map((d) =>
    d.cx === x && d.cy === y ? { ...d, cx: from.cx, cy: from.cy } : d
  );
}

/** Перенос контейнера: на свободную клетку или обменом с тем, что там стоит. Даром. */
export function moveDepot(
  p: Player,
  from: { cx: number; cy: number },
  x: number,
  y: number
): BuildResult {
  if (!onMap(x, y)) return skip;
  if (x === from.cx && y === from.cy) return skip;
  if (p.cells[idx(x, y)] !== G_BASE) return no("depot.onlyIntact");

  const at = p.depots.findIndex((d) => d.cx === from.cx && d.cy === from.cy);
  if (at < 0) return skip;
  const moving = p.depots[at];
  p.depots = p.depots.filter((_, i) => i !== at);
  swapInto(p, from, x, y);
  p.depots = [...p.depots, { ...moving, cx: x, cy: y }];
  return done(0);
}

/** Перенос установки: на свободную целую клетку или обменом с тем, что там стоит. Даром. */
export function moveGun(
  p: Player,
  from: { cx: number; cy: number; kind: GunKind },
  x: number,
  y: number
): BuildResult {
  if (!onMap(x, y)) return skip;
  if (x === from.cx && y === from.cy) return skip;
  if (p.cells[idx(x, y)] !== G_BASE) return no("gun.onlyIntact");

  const at = p.guns.findIndex(
    (g) => g.cx === from.cx && g.cy === from.cy && gunKind(g) === from.kind
  );
  if (at < 0) return skip;
  const moving = p.guns[at];
  p.guns = p.guns.filter((_, i) => i !== at);
  swapInto(p, from, x, y);
  p.guns = sanitizeGuns([...p.guns, { ...moving, cx: x, cy: y }]);
  return done(0);
}
