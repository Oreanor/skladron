// Состояние игрока и его хранение. Сейчас localStorage; на этапе 2 за тем же
// интерфейсом окажется Supabase — игровая логика об этом знать не должна.

import {
  CREDITS_START,
  DRONE_UNIT_COST,
  REPAIR_COST,
  INCOME_PER_CELL,
  SALE_MULTIPLIER,
  STARTER_SIDE,
  accrue,
  priceAt,
} from "./economy";
import {
  CELLS,
  type Depot,
  G_BASE,
  G_BURNT,
  type Gun,
  droneCount,
  normalizeDepots,
  sanitizeGuns,
  countCells,
  decodeCells,
  encodeCells,
  regrowGround,
  starterCells,
} from "./base";
import type { AttackOrder } from "./attack";
import type { Enemy } from "./enemy";
import { randomPresetAvatar, type Avatar } from "./avatar";

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

/** Уровни классов. Растут только апгрейдом, начинаются с первого. */
export interface Levels {
  drones: number;
  guns: number;
  /** Ракетницы: дальность и скорость ракеты. */
  rockets: number;
  /** Огнетушители: радиус тушения. */
  sprays: number;
  /** Ловушки: радиус захвата. */
  traps: number;
  /** Пулемёт игрока: меткость очереди. */
  mg: number;
  /** Брандспойт: ширина струи. */
  water: number;
  /** Страховой полис: какую долю потерь возместят. */
  insurance: number;
}

export const startLevels = (): Levels => ({
  drones: 1,
  guns: 1,
  rockets: 1,
  sprays: 1,
  traps: 1,
  mg: 1,
  water: 1,
  insurance: 1,
});

export interface Player {
  name: string;
  /** Лицо: пусто — инициалы, номер — готовое, адрес — своя картинка. */
  avatar: Avatar;
  credits: number;
  levels: Levels;
  /** Сколько должен банку и когда срок. Ноль — долгов нет. */
  loan: number;
  loanDue: number | null;
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
  avatar?: Avatar;
  credits: number;
  levels?: Partial<Levels>;
  loan?: number;
  loanDue?: number | null;
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
    avatar: randomPresetAvatar(),
    credits: CREDITS_START,
    levels: startLevels(),
    loan: 0,
    loanDue: null,
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
  fresh.avatar = p.avatar;
  fresh.levels = { ...p.levels };
  // долг сносом склада не списывается
  fresh.loan = p.loan;
  fresh.loanDue = p.loanDue;
  // После сноса — не меньше стартовой казны: иначе с нуля не отстроиться.
  fresh.credits = Math.max(p.credits, CREDITS_START);
  fresh.stats = { ...p.stats, wipes: p.stats.wipes + 1 };
  fresh.enemies = p.enemies;
  return fresh;
}

export const drones = (p: Player) => droneCount(p.depots);
export const intactCells = (p: Player) => countCells(p.cells, G_BASE);
export const burntCells = (p: Player) => countCells(p.cells, G_BURNT);
/**
 * Что уйдёт с отгрузкой: сколько чего лежит и на какую сумму. Цена продажи
 * считается от закупочной с учётом уровня — иначе прокачка съедала бы всю
 * маржу: на десятом уровне дрон покупался за 47, а продавался за те же 50.
 */
export function saleOf(p: Player) {
  const drones = droneCount(p.depots);
  const dronesValue = drones * priceAt(DRONE_UNIT_COST, p.levels.drones) * SALE_MULTIPLIER;
  return { drones, dronesValue };
}

/**
 * Сколько принесёт ближайшая смена: аренда со всей целой площади плюс
 * отгрузка того, что к тому времени будет лежать на складе. Смена — это
 * двенадцать часов, то есть за сутки столько набегает дважды.
 */
export const shiftIncome = (p: Player) => {
  const sale = saleOf(p);
  return intactCells(p) * INCOME_PER_CELL + sale.dronesValue;
};

/** Склад выгорел полностью и чинить не на что — дальше только заново. */
export function isDoomed(p: Player, intact = intactCells(p)) {
  if (!p.founded) return false;
  if (intact > 0) return false;
  return p.credits < REPAIR_COST; // не хватает даже на одну клетку ремонта
}

export function load(): Player {
  if (typeof window === "undefined") return newPlayer();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return newPlayer();
    const s = JSON.parse(raw) as Stored;
    if (s.v !== 1) return newPlayer();
    const cells = regrowGround(decodeCells(s.cells));
    if (cells.length !== CELLS) return newPlayer();
    return {
      name: s.name ?? "",
      avatar: s.avatar ?? null,
      credits: s.credits,
      levels: { ...startLevels(), ...(s.levels ?? {}) },
      loan: s.loan ?? 0,
      loanDue: s.loanDue ?? null,
      cells,
      guns: sanitizeGuns(s.guns ?? []),
      depots: normalizeDepots(s.depots ?? []),
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
    avatar: p.avatar,
    credits: p.credits,
    levels: p.levels,
    loan: p.loan,
    loanDue: p.loanDue,
    cells: encodeCells(p.cells),
    guns: sanitizeGuns(p.guns),
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
  if (!p.founded) return { credits: 0, days: 0, sold: null };
  const { credits, days, nextAt } = accrue(intactCells(p), p.lastIncomeAt, now);
  if (days <= 0) return { credits: 0, days: 0, sold: null };
  // Отгрузка идёт разом, а не за каждые сутки: продаётся то, что лежит сейчас.
  const sale = saleOf(p);
  p.depots = [];
  p.lastIncomeAt = nextAt;
  p.credits += credits + sale.dronesValue;
  return { credits: credits + sale.dronesValue, days, sold: sale };
}
