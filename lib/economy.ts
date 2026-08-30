// Цены, доход и всё, что считается в кредитах. Числа из диздока §02.

export const CREDITS_START = 10_000;
export const CELL_COST = 10; // новая клетка склада
export const REPAIR_COST = 5; // ремонт сгоревшей клетки
export const GUN_COST = 100;
export const GUN_REFUND = 50; // возврат при снятии пушки
export const DRONE_UNIT_COST = 10;
export const INCOME_PER_CELL = 10; // за целую клетку за сутки
export const INCOME_CAP_DAYS = 14; // потолок накопления
export const ATTACK_LEAK_REWARD = 50; // атакующему за дрон, долетевший до склада
export const DRONE_KILL_REWARD = 50; // защитнику за каждый сбитый дрон
export const STARTER_SIDE = 10; // стартовый склад 10×10 уже стоит в центре
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
