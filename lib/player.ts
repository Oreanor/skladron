// Состояние игрока и его хранение. Сейчас localStorage; на этапе 2 за тем же
// интерфейсом окажется Supabase — игровая логика об этом знать не должна.

import {
  CREDITS_START,
  REPAIR_COST,
  saleValue,
  STARTER_SIDE,
  accrue,
} from "./economy";
import {
  type Depot,
  G_BASE,
  G_BURNT,
  type Gun,
  droneCount,
  sanitizeGuns,
  countCells,
  decodeCells,
  encodeCells,
  regrowGround,
  starterCells,
} from "./base";
import type { AttackOrder } from "./attack";
import type { Enemy } from "./enemy";
import type { CompetitionBest } from "./competition";
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
  /** Пусковые шаров: шире круг и на два шара больше за уровень. */
  balloons: number;
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
  balloons: 1,
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
  /**
   * Старший открытый номер состязания (1…100). Следующий открывается, когда
   * на нынешнем склад уцелел; проигрыш номер не откатывает.
   */
  competitionAt: number;
  /** Лучшая попытка по каждому пройденному номеру. */
  competitionBest: Record<number, CompetitionBest>;
}

/**
 * Игрок в браузере — как есть, только карта строкой. Формат один: сохранение
 * другой версии не чинится, а заменяется новым игроком.
 */
type Stored = Omit<Player, "cells"> & { v: 2; cells: string };

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
    competitionAt: 1,
    competitionBest: {},
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
  fresh.competitionAt = p.competitionAt;
  fresh.competitionBest = p.competitionBest;
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
  const dronesValue = saleValue(drones, p.levels.drones);
  return { drones, dronesValue };
}

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
    if (s.v !== 2) return newPlayer();
    const { v: _v, cells, ...rest } = s;
    // у старого сохранения может не быть новых классов — дополняем первыми
    return {
      ...rest,
      levels: { ...startLevels(), ...rest.levels },
      cells: regrowGround(decodeCells(cells)),
    };
  } catch {
    return newPlayer();
  }
}

export function save(p: Player) {
  if (typeof window === "undefined") return;
  const s: Stored = {
    ...p,
    v: 2,
    cells: encodeCells(p.cells),
    guns: sanitizeGuns(p.guns),
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
