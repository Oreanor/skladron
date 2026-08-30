// Состояние игрока и его хранение. Сейчас localStorage; на этапе 2 за тем же
// интерфейсом окажется Supabase — игровая логика об этом знать не должна.

import { CREDITS_START, STARTER_SIDE, accrue } from "./economy";
import {
  CELLS,
  type Depot,
  G_BASE,
  G_BURNT,
  type Gun,
  droneCount,
  countCells,
  decodeCells,
  emptyCells,
  encodeCells,
  starterCells,
} from "./base";
import type { AttackOrder } from "./attack";
import type { Enemy } from "./enemy";

export interface PlayerStats {
  battles: number;
  dronesKilled: number;
  cellsBurned: number;
  cellsRepaired: number;
  wipes: number;
  raids: number;
  looted: number;
}

/** Как склад зовут: видно врагам, задаётся при основании. */
export const MAX_BASE_NAME = 24;

/** Приводит введённое имя к тому, что можно хранить и показывать. */
export function normName(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_BASE_NAME);
}

export interface Player {
  name: string;
  credits: number;
  cells: Uint8Array;
  guns: Gun[];
  depots: Depot[];
  lastIncomeAt: number;
  createdAt: number;
  founded: boolean; // прошёл ли стартовую разметку
  incoming: AttackOrder[];
  enemies: Enemy[];
  stats: PlayerStats;
}

interface Stored {
  v: 1;
  name?: string;
  credits: number;
  cells: string;
  guns: Gun[];
  depots: Depot[];
  lastIncomeAt: number;
  createdAt: number;
  founded: boolean;
  incoming: AttackOrder[];
  enemies: Enemy[];
  stats: PlayerStats;
}

const KEY = "wb.player.v1";

export function newPlayer(now = Date.now()): Player {
  return {
    name: "",
    credits: CREDITS_START,
    cells: starterCells(STARTER_SIDE),
    guns: [],
    depots: [],
    lastIncomeAt: now,
    createdAt: now,
    founded: false,
    incoming: [],
    enemies: [],
    stats: {
      battles: 0,
      dronesKilled: 0,
      cellsBurned: 0,
      cellsRepaired: 0,
      wipes: 0,
      raids: 0,
      looted: 0,
    },
  };
}

/** Вайп после полного выгорания: база и казна с нуля, история и имя остаются. */
export function wipe(p: Player, now = Date.now()): Player {
  const fresh = newPlayer(now);
  fresh.name = p.name;
  fresh.credits = Math.max(p.credits, CREDITS_START);
  fresh.stats = { ...p.stats, wipes: p.stats.wipes + 1 };
  fresh.enemies = p.enemies;
  return fresh;
}

export const drones = (p: Player) => droneCount(p.depots);
export const intactCells = (p: Player) => countCells(p.cells, G_BASE);
export const burntCells = (p: Player) => countCells(p.cells, G_BURNT);
export const dailyIncome = (p: Player) => intactCells(p) * 10;

/**
 * Склад выгорел дотла — доводим кассу до стартовых 10 000. Без этого игрок
 * остаётся с горстью кредитов, нулевым доходом и без единой целой клетки:
 * дронам негде лежать, а на ремонт всей площади денег не хватает.
 */
export function insure(p: Player) {
  if (!p.founded) return false;
  if (intactCells(p) > 0) return false;
  if (p.credits >= CREDITS_START) return false;
  p.credits = CREDITS_START;
  return true;
}

/** Склад выгорел полностью и чинить не на что — дальше только заново. */
export function isDoomed(p: Player) {
  if (!p.founded) return false;
  if (intactCells(p) > 0) return false;
  return p.credits < 5; // не хватает даже на одну клетку ремонта
}

export function load(): Player {
  if (typeof window === "undefined") return newPlayer();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return newPlayer();
    const s = JSON.parse(raw) as Stored;
    if (s.v !== 1) return newPlayer();
    const cells = decodeCells(s.cells);
    if (cells.length !== CELLS) return newPlayer();
    return {
      name: s.name ?? "",
      credits: s.credits,
      cells,
      guns: s.guns ?? [],
      depots: s.depots ?? [],
      lastIncomeAt: s.lastIncomeAt,
      createdAt: s.createdAt,
      founded: s.founded,
      incoming: s.incoming ?? [],
      enemies: s.enemies ?? [],
      stats: s.stats,
    };
  } catch {
    return newPlayer();
  }
}

export function save(p: Player) {
  if (typeof window === "undefined") return;
  const s: Stored = {
    v: 1,
    name: p.name,
    credits: p.credits,
    cells: encodeCells(p.cells),
    guns: p.guns,
    depots: p.depots,
    lastIncomeAt: p.lastIncomeAt,
    createdAt: p.createdAt,
    founded: p.founded,
    incoming: p.incoming,
    enemies: p.enemies,
    stats: p.stats,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // приватный режим или переполнение — играем без сохранения
  }
}

/** Начисляет доход за прошедшие сутки. Возвращает, сколько накапало. */
export function collectIncome(p: Player, now = Date.now()) {
  if (!p.founded) return { credits: 0, days: 0 };
  const { credits, days, nextAt } = accrue(intactCells(p), p.lastIncomeAt, now);
  p.lastIncomeAt = nextAt;
  p.credits += credits;
  return { credits, days };
}
