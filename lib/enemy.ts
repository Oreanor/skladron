// Враги: список соперников по почте, их снятые разведкой карты и выдача
// дронов со склада перед вылетом. Сам бой у соперника отыгрывает он сам —
// сюда приходит только результат.

import {
  type Depot,
  type DroneKind,
  depotKind,
  GRID,
  G_BASE,
  type Gun,
  type Rect,
  applyRect,
  emptyCells,
  encodeCells,
  normRect,
} from "./base";
import { MAX_RAID, mulberry32 } from "./attack";

export const MAX_ATTACK_DRONES = MAX_RAID;

/** Что удалось снять разведкой: карта врага и маска того, что мы видели. */
export interface ScoutSnapshot {
  /** Маска снятого, RLE по клеткам: 1 — видели, 0 — туман. */
  seen: string;
  /** Карта врага на момент съёмки, RLE. */
  cells: string;
  guns: Gun[];
  at: number;
}

export interface Enemy {
  id: string;
  name: string;
  email: string;
  cells: string; // склад врага, base64
  guns: Gun[];
  depots: Depot[];
  burnedByMe: number; // счёт вражды
  burnedByThem: number;
  lastRaidAt: number; // когда он присылал последнюю атаку
  /** Последняя разведка. Держится, пока не слетаешь заново. */
  scout?: ScoutSnapshot;
}

/** Склад врага: несколько сросшихся прямоугольников вокруг центра. */
function genBase(rnd: () => number) {
  const cells = emptyCells();
  const sizes: Array<[number, number]> = [
    [10, 16],
    [16, 10],
    [8, 6],
    [6, 8],
    [12, 7],
    [7, 12],
  ];
  const pick = () => sizes[(rnd() * sizes.length) | 0];
  const rects: Rect[] = [];
  const [w0, h0] = pick();
  rects.push({ x: ((GRID - w0) / 2) | 0, y: ((GRID - h0) / 2) | 0, w: w0, h: h0 });

  const count = 4 + ((rnd() * 3) | 0);
  while (rects.length < count) {
    const base = rects[(rnd() * rects.length) | 0];
    const [w, h] = pick();
    const side = (rnd() * 4) | 0;
    const over = 1 + ((rnd() * 2) | 0);
    let x: number;
    let y: number;
    if (side === 0) {
      x = base.x + base.w - over;
      y = base.y + ((rnd() * base.h) | 0) - (h >> 1);
    } else if (side === 1) {
      x = base.x - w + over;
      y = base.y + ((rnd() * base.h) | 0) - (h >> 1);
    } else if (side === 2) {
      x = base.x + ((rnd() * base.w) | 0) - (w >> 1);
      y = base.y + base.h - over;
    } else {
      x = base.x + ((rnd() * base.w) | 0) - (h >> 1);
      y = base.y - h + over;
    }
    rects.push({
      x: Math.max(12, Math.min(GRID - 12 - w, x)),
      y: Math.max(12, Math.min(GRID - 12 - h, y)),
      w,
      h,
    });
  }
  for (const r of rects) applyRect(cells, normRect(r));
  return cells;
}

/** Пока склад не назван, зовём врага по адресу — но не выдуманным именем. */
export const nameFromEmail = (email: string) => email.split("@")[0] || email;

export function makeEnemy(
  email: string,
  name = nameFromEmail(email),
  seed = (Math.random() * 1e9) | 0
): Enemy {
  const rnd = mulberry32(seed);
  const cells = genBase(rnd);

  // пушки враг ставит вразброс по своему складу
  const spots: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === G_BASE) spots.push(i);
  const guns: Gun[] = [];
  const gunCount = 6 + ((rnd() * 8) | 0);
  for (let k = 0; k < gunCount && spots.length; k++) {
    const i = spots[(rnd() * spots.length) | 0];
    const gx = i % GRID;
    const gy = (i / GRID) | 0;
    if (guns.some((g) => g.cx === gx && g.cy === gy)) continue;
    guns.push({ cx: gx, cy: gy });
  }

  return {
    id: `${Date.now().toString(36)}-${(rnd() * 1e6) | 0}`,
    name,
    email,
    cells: encodeCells(cells),
    guns,
    depots: [],
    burnedByMe: 0,
    burnedByThem: 0,
    lastRaidAt: 0,
  };
}

/** Снимает дронов с контейнеров, начиная с последних. Возвращает, сколько взял. */
export function takeDrones(depots: Depot[], count: number, kind?: DroneKind) {
  let left = count;
  for (let i = depots.length - 1; i >= 0 && left > 0; i--) {
    if (kind && depotKind(depots[i]) !== kind) continue;
    const take = Math.min(depots[i].n, left);
    depots[i].n -= take;
    left -= take;
    if (depots[i].n === 0) depots.splice(i, 1);
  }
  return count - left;
}
