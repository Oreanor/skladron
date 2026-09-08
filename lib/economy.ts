// Цены, доход и всё, что считается в кредитах. Числа из диздока §02.

export const CREDITS_START = 10_000;
export const CELL_COST = 10; // новая клетка склада
export const REPAIR_COST = 5; // ремонт сгоревшей клетки
export const GUN_COST = 100;
export const DRONE_UNIT_COST = 25; // ударный дрон дороже разведчика
/** Сколько платят за сданные во вторсырьё остатки сгоревшей клетки. */
export const SCRAP_REWARD = 5;

/** Заём: от и до, ставка за срок и сам срок. */
export const LOAN_MIN = 1000;
export const LOAN_MAX = 5000;
export const LOAN_STEP = 500;
export const LOAN_RATE = 10; // процентов
export const LOAN_HOURS = 24;

/** Сколько придётся вернуть за такой заём. */
export const loanDebt = (amount: number) =>
  amount + Math.floor((amount * LOAN_RATE) / 100);

/** Каждая целая клетка склада приносит столько в сутки. */
export const INCOME_PER_CELL = 10;
/**
 * Раз в сутки склад отгружает всё, что на нём лежит: дроны и разведчики
 * уходят вдвое дороже закупки. Не успел пустить их в дело — они проданы.
 */
export const SALE_MULTIPLIER = 2;
export const INCOME_CAP_SHIFTS = 28; // потолок накопления — две недели смен
export const CELL_LOOT_REWARD = 50; // нападавшему за каждую сожжённую клетку склада
export const INSURANCE_CELL = 5; // страховка за сгоревшую клетку — ровно на ремонт
/** Прибавка к покрытию за каждый уровень страховки. */
export const INSURANCE_PER_LEVEL = 0.25;
/** Выше пятого уровня страховать нечего: покрытие и так полное. */
export const MAX_INSURANCE_LEVEL = 5;

/**
 * Какую долю сгоревшего товара и погибших пушек вернут. Базовый полис
 * покрывает только расчистку клеток; дальше — по четверти за уровень.
 */
export const insuranceShare = (level: number) =>
  Math.min(1, Math.max(0, level - 1) * INSURANCE_PER_LEVEL);

/** Во что обошлось то, что лежит в контейнерах. */
export const goodsValue = (
  depots: { n: number; kind?: string }[]
) =>
  depots.reduce(
    (sum, d) => sum + d.n * (d.kind === "scout" ? SCOUT_UNIT_COST : DRONE_UNIT_COST),
    0
  );

/** Страховая выплата: расчистка клеток плюс доля стоимости потерянного. */
export const insurance = (
  burned: number,
  goodsLost: number,
  gunsLost: number,
  level = 1
) =>
  burned * INSURANCE_CELL +
  Math.floor((goodsLost + gunsLost * GUN_COST) * insuranceShare(level));
export const SCOUT_UNIT_COST = 10; // разведчик проще: ни боеголовки, ни брони
/**
 * Уровни. Апгрейд общий на класс: дорожает и уже лежащее на складе, и всё,
 * что купишь потом. Второй уровень стоит 5 000, третий 10 000, и так далее —
 * шаг ровный, чтобы прикидывать в уме.
 */
export const UPGRADE_STEP = 5000;
export const MAX_LEVEL = 10;

/** Цена следующего уровня. Одна и та же на всех ступенях. */
export const upgradeCost = (_level: number) => UPGRADE_STEP;

export type UpgradeKind = "drones" | "guns" | "scouts" | "mg" | "water" | "insurance";
export const UPGRADE_KINDS: UpgradeKind[] = [
  "drones",
  "guns",
  "scouts",
  "mg",
  "water",
  "insurance",
];

/** Потолок у страховки свой: дальше полного покрытия расти некуда. */
export const maxLevel = (kind: UpgradeKind) =>
  kind === "insurance" ? MAX_INSURANCE_LEVEL : MAX_LEVEL;

/** Прибавка за уровень: первый уровень — множитель 1. */
/**
 * На столько дорожает единица товара за каждый уровень. Держим низко:
 * прокачка и так стоит по 5000 за ступень, а вещи должны оставаться
 * покупаемыми — иначе десятый уровень некому будет закупать.
 */
export const PRICE_PER_LEVEL = 0.1;

/**
 * Цена с учётом прокачки: что летит дальше и быстрее, то и стоит дороже.
 * Округляем вниз — лишняя копейка на больших закупках ни к чему.
 */
export const priceAt = (base: number, level: number) =>
  Math.floor(base * levelBonus(level, PRICE_PER_LEVEL));

export const levelBonus = (level: number, perLevel: number) =>
  1 + perLevel * (Math.max(1, level) - 1);

export const STARTER_SIDE = 5; // стартовый склад 5×5 уже стоит в центре
export const STARTER_CELLS = STARTER_SIDE * STARTER_SIDE;
export const MIN_BASE_CELLS = STARTER_CELLS; // меньше стартового склада не основываемся

/**
 * Смена — двенадцать часов. Столько живёт товар на складе и за столько же
 * набегает аренда: две отгрузки в сутки.
 */
export const SHIFT_HOURS = 12;
export const SHIFT_MS = SHIFT_HOURS * 60 * 60 * 1000;


/**
 * Сколько кредитов накопилось с прошлого начисления.
 * Считаем по целым суткам UTC, остаток переносим на следующий заход.
 */
export function accrue(intactCells: number, lastIncomeAt: number, now: number) {
  const shifts = Math.floor((now - lastIncomeAt) / SHIFT_MS);
  if (shifts <= 0) return { credits: 0, days: 0, nextAt: lastIncomeAt };
  const paid = Math.min(shifts, INCOME_CAP_SHIFTS);
  return {
    credits: paid * intactCells * INCOME_PER_CELL,
    days: paid,
    // сдвигаем на все прошедшие сутки, иначе сверх потолка копилось бы дальше
    nextAt: lastIncomeAt + shifts * SHIFT_MS,
  };
}

/** Числа для интерфейса. Кривое значение показываем нулём, а не роняем экран. */
export const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("ru-RU");
