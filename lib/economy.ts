// Цены, доход и всё, что считается в кредитах. Числа из диздока §02.

export const CREDITS_START = 10_000;
export const CELL_COST = 10; // новая клетка склада
export const REPAIR_COST = 5; // ремонт сгоревшей клетки
export const GUN_COST = 100;
export const GUN_REFUND = 50; // возврат при снятии пушки
export const DRONE_UNIT_COST = 10;
/** Каждая целая клетка склада приносит столько в сутки. */
export const INCOME_PER_CELL = 10;
/**
 * Раз в сутки склад отгружает всё, что на нём лежит: дроны и разведчики
 * уходят вдвое дороже закупки. Не успел пустить их в дело — они проданы.
 */
export const SALE_MULTIPLIER = 2;
export const INCOME_CAP_DAYS = 14; // потолок накопления
export const CELL_LOOT_REWARD = 50; // нападавшему за каждую сожжённую клетку склада
export const INSURANCE_CELL = 10; // страховка пострадавшему за сгоревшую клетку
export const INSURANCE_DEPOT = 50; // и ещё столько, если на клетке лежал товар
export const SCOUT_UNIT_COST = 25; // разведчик дороже ударного дрона, но дешевле пушки
/**
 * Уровни. Апгрейд общий на класс: дорожает и уже лежащее на складе, и всё,
 * что купишь потом. Второй уровень стоит 5 000, третий 10 000, и так далее —
 * шаг ровный, чтобы прикидывать в уме.
 */
export const UPGRADE_STEP = 5000;
export const MAX_LEVEL = 10;

/** Цена следующего уровня. Одна и та же на всех ступенях. */
export const upgradeCost = (_level: number) => UPGRADE_STEP;

export type UpgradeKind = "drones" | "guns" | "scouts" | "mg" | "water";
export const UPGRADE_KINDS: UpgradeKind[] = ["drones", "guns", "scouts", "mg", "water"];

/** Прибавка за уровень: первый уровень — множитель 1. */
export const levelBonus = (level: number, perLevel: number) =>
  1 + perLevel * (Math.max(1, level) - 1);

export const STARTER_SIDE = 5; // стартовый склад 5×5 уже стоит в центре
export const STARTER_CELLS = STARTER_SIDE * STARTER_SIDE;
export const MIN_BASE_CELLS = STARTER_CELLS; // меньше стартового склада не основываемся

export const DAY_MS = 24 * 60 * 60 * 1000;


/**
 * Сколько кредитов накопилось с прошлого начисления.
 * Считаем по целым суткам UTC, остаток переносим на следующий заход.
 */
export function accrue(intactCells: number, lastIncomeAt: number, now: number) {
  const days = Math.floor((now - lastIncomeAt) / DAY_MS);
  if (days <= 0) return { credits: 0, days: 0, nextAt: lastIncomeAt };
  const paid = Math.min(days, INCOME_CAP_DAYS);
  return {
    credits: paid * intactCells * INCOME_PER_CELL,
    days: paid,
    // сдвигаем на все прошедшие сутки, иначе сверх потолка копилось бы дальше
    nextAt: lastIncomeAt + days * DAY_MS,
  };
}

/** Числа для интерфейса. Кривое значение показываем нулём, а не роняем экран. */
export const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("ru-RU");
