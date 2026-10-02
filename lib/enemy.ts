// Враги: список соперников по почте, их снятые разведкой карты и выдача
// дронов со склада перед вылетом. Сам бой у соперника отыгрывает он сам —
// сюда приходит только результат.

import {
  type Depot,
  GRID,
  G_BASE,
  type Gun,
  type Rect,
  applyRect,
  emptyCells,
  encodeCells,
  normRect,
} from "./base";
import { mulberry32 } from "./attack";
import type { Avatar } from "./avatar";
import { RAID } from "./tuning";

export const MAX_ATTACK_DRONES = RAID.max;

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
  /** Лицо соперника: приходит с сервера вместе с именем склада. */
  avatar?: Avatar;
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
    switch (side) {
      case 0:
        x = base.x + base.w - over;
        y = base.y + ((rnd() * base.h) | 0) - (h >> 1);
        break;
      case 1:
        x = base.x - w + over;
        y = base.y + ((rnd() * base.h) | 0) - (h >> 1);
        break;
      case 2:
        x = base.x + ((rnd() * base.w) | 0) - (w >> 1);
        y = base.y + base.h - over;
        break;
      default:
        x = base.x + ((rnd() * base.w) | 0) - (w >> 1);
        y = base.y - h + over;
        break;
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

/**
 * Соперник без выдуманного склада. Настоящую карту живого игрока отдаёт
 * сервер (launchScout), и генерировать ему фиктивную — это проход по десяти
 * тысячам клеток ради поля, которое потом никто не прочтёт.
 */
export function blankEnemy(email: string, name = nameFromEmail(email)): Enemy {
  return {
    id: `${Date.now().toString(36)}-${(Math.random() * 1e6) | 0}`,
    name,
    email,
    cells: "",
    guns: [],
    depots: [],
    burnedByMe: 0,
    burnedByThem: 0,
    lastRaidAt: 0,
  };
}

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
    // Занятую клетку вычёркиваем из списка: иначе одно и то же место
    // выпадало повторно, попытка тратилась впустую и пушек выходило
    // меньше заказанного.
    const at = (rnd() * spots.length) | 0;
    const i = spots[at];
    spots[at] = spots[spots.length - 1];
    spots.pop();
    guns.push({ cx: i % GRID, cy: (i / GRID) | 0 });
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

/** Снимает из контейнеров, начиная с последних. Возвращает, сколько взял. */
export function takeDrones(depots: Depot[], count: number) {
  let left = count;
  for (let i = depots.length - 1; i >= 0 && left > 0; i--) {
    const take = Math.min(depots[i].n, left);
    depots[i].n -= take;
    left -= take;
    if (depots[i].n === 0) depots.splice(i, 1);
  }
  return count - left;
}
