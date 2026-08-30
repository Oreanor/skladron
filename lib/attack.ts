// Атака: заказ и превращение его в расписание вылетов.

import { GRID } from "./base";

export type Pattern = "swarm" | "lines" | "random" | "drip";

export interface AttackOrder {
  id: string;
  from: string; // кто прислал
  createdAt: number;
  drones: number;
  pattern: Pattern;
  direction: number; // 0 верх, 1 низ, 2 слева, 3 справа — для lines
  seed: number;
}

export interface SpawnTicket {
  at: number; // секунда боя
  edge: number;
  ox: number; // положение вдоль края, в клетках
  oy: number; // отступ за кадр
}

export const PATTERNS: { id: Pattern; name: string; hint: string }[] = [
  { id: "swarm", name: "Рой", hint: "все разом с одной стороны" },
  { id: "lines", name: "Линиями", hint: "шеренги с одной стороны" },
  { id: "random", name: "Со всех сторон", hint: "шеренги с разных сторон" },
  { id: "drip", name: "Капель", hint: "по одному, всё чаще" },
];

export const EDGE_NAMES = ["сверху", "снизу", "слева", "справа"];

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
    const rowSize = 8 + Math.floor(rnd() * 5);
    let t = 2;
    let left = n;
    while (left > 0) {
      const size = Math.min(left, rowSize);
      const edge = order.pattern === "lines" ? order.direction : Math.floor(rnd() * 4);
      for (let i = 0; i < size; i++) push(t + i * 0.12, edge, 6);
      left -= size;
      t += 4;
    }
  } else {
    // капель: интервал сжимается с 3 с до 0.25 с
    let t = 2;
    for (let i = 0; i < n; i++) {
      push(t, Math.floor(rnd() * 4), 4);
      const k = i / Math.max(1, n - 1);
      t += 3 - k * 2.75;
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
