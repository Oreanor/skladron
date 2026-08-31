// Атака: заказ и превращение его в расписание вылетов.

import { GRID } from "./base";
import type { BattleResult } from "./engine";

export type Pattern = "swarm" | "lines" | "random" | "drip";

/** Сколько атака ждёт живого защитника, прежде чем пройти сама. */
export const RAID_TTL_MS = 30 * 60 * 1000;

/** Потолок одного налёта. Движок тянет и больше, но пятисот за глаза. */
export const MAX_RAID = 500;

// ---------- размер налёта ----------
// Цифры сняты прогоном боя без игрока: пушки палят сами, рой растёт. Одна
// живая пушка успевает снять около трёх дронов за налёт — её держит не
// меткость, а перезарядка в три секунды. Примерно половину роя игрок
// разбирает руками: пулемётом и брандспойтом. Остальное прорывается, и рой
// считаем так, чтобы прорывов было столько, сколько реально успеть затушить.

/** Сколько дронов пушка снимает за налёт сама. */
export const DRONES_PER_GUN = 3;
/** Какую долю роя игрок снимает руками, если играет, а не смотрит. */
export const PLAYER_SHARE = 0.5;
/** Надбавка за размер склада: по большому есть куда бить. */
export const RAID_PER_CELL = 0.06;

/** Сколько прорывов игрок ещё успевает затушить на складе такого размера. */
function leaksOk(intact: number) {
  return Math.min(40, 10 + intact / 25);
}

/**
 * Размер налёта под конкретную оборону. Множитель сложности гуляет от 0,75
 * до 1,35: бывает и полегче, и позлее, но неподъёмного не приходит.
 */
export function raidSize(guns: number, intact: number, difficulty = 1) {
  const survivable = leaksOk(intact) + guns * DRONES_PER_GUN + intact * RAID_PER_CELL;
  const fair = survivable / (1 - PLAYER_SHARE);
  return Math.max(30, Math.min(MAX_RAID, Math.round(fair * difficulty)));
}

/** Случайная сложность очередного налёта. */
export function raidDifficulty() {
  return 0.75 + Math.random() * 0.6;
}

export interface AttackOrder {
  id: string;
  from: string; // кто прислал
  createdAt: number;
  /** Когда атака встала первой в очереди и пошли часы. Пока null — ждёт. */
  activatedAt?: number | null;
  drones: number;
  pattern: Pattern;
  direction: number; // 0 верх, 1 низ, 2 слева, 3 справа — для lines
  seed: number;
  /** Уровень дронов нападающего на момент вылета. */
  droneLevel?: number;
  remote?: boolean; // настоящий налёт из серверной очереди, а не локальный бот
}

/** Итог исходящего налёта, который приходит только после боя защитника. */
export interface AttackReport {
  id: string;
  target: string;
  resolvedAt: number;
  result: BattleResult;
  loot: number;
  destroyed: boolean;
}

export interface SpawnTicket {
  at: number; // секунда боя
  edge: number;
  ox: number; // положение вдоль края, в клетках
  oy: number; // отступ за кадр
}

export const PATTERNS: Pattern[] = ["swarm", "lines", "random", "drip"];

/** За сколько примерно секунд «капель» высыпает весь рой, каким бы он ни был. */
const DRIP_SECONDS = 60;

/** Стороны в том же порядке, что и direction: 0 верх, 1 низ, 2 слева, 3 справа. */
export const EDGES = [0, 1, 2, 3] as const;

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Расписание вылетов: детерминировано по seed, чтобы бой был воспроизводим. */
export function buildPlan(order: AttackOrder): SpawnTicket[] {
  const rnd = mulberry32(order.seed);
  const plan: SpawnTicket[] = [];
  const n = Math.max(1, order.drones);

  const push = (at: number, edge: number, spread: number) => {
    plan.push({
      at,
      edge,
      ox: rnd() * (GRID + spread * 2) - spread,
      oy: (rnd() - 0.5) * 8,
    });
  };

  if (order.pattern === "swarm") {
    // всё сразу: пушки просто не успевают перезаряжаться
    for (let i = 0; i < n; i++) push(2 + rnd() * 1.5, order.direction, 10);
  } else if (order.pattern === "lines" || order.pattern === "random") {
    // Чем крупнее рой, тем шире шеренга и короче пауза между ними: три сотни
    // дронов не должны заходить теми же восьмёрками, что и полтора десятка.
    const rowSize = Math.min(40, 8 + Math.floor(rnd() * 5) + Math.floor(n / 12));
    const gap = Math.max(1.4, 4 - n / 60);
    let t = 2;
    let left = n;
    while (left > 0) {
      const size = Math.min(left, rowSize);
      const edge = order.pattern === "lines" ? order.direction : Math.floor(rnd() * 4);
      for (let i = 0; i < size; i++) push(t + i * 0.1, edge, 6);
      left -= size;
      t += gap;
    }
  } else {
    // Капель: интервал сжимается к концу вдвенадцатеро, но весь налёт
    // укладывается примерно в DRIP_SECONDS независимо от размера роя.
    const first = Math.min(3, (2 * DRIP_SECONDS) / (n * (1 + 1 / 12)));
    const last = Math.max(0.05, first / 12);
    let t = 2;
    for (let i = 0; i < n; i++) {
      push(t, Math.floor(rnd() * 4), 4);
      const k = i / Math.max(1, n - 1);
      t += first - k * (first - last);
    }
  }

  return plan.sort((a, b) => a.at - b.at);
}

/** Сколько примерно продлится налёт — показываем в лобби перед боем. */
export function planLength(plan: SpawnTicket[]) {
  return plan.length ? plan[plan.length - 1].at : 0;
}

let counter = 0;
export function makeOrder(
  from: string,
  drones: number,
  pattern: Pattern,
  direction = 0
): AttackOrder {
  return {
    id: `${Date.now().toString(36)}-${counter++}`,
    from,
    createdAt: Date.now(),
    drones,
    pattern,
    direction,
    seed: (Math.random() * 1e9) | 0,
  };
}
