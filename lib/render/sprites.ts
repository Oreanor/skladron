/*
 * Картинки предметов из public/sprites. Грузятся сами при первом обращении;
 * пока не догрузились (и на сервере, где картинок нет вовсе), pieces.ts
 * рисует предмет по-старому, вектором.
 *
 * Базы и ящики — 80×80 и ложатся ровно на клетку. Башни — 100×100: они
 * крупнее базы и вертятся вокруг середины картинки.
 */

export type SpriteName =
  | "fire-extinguisher"
  | "cannon-base"
  | "cannon-turret"
  | "rocket-base"
  | "rocket-turret"
  | "drone-container"
  | "balloon-container"
  | "balloon"
  | "trap";

/** Во сколько клеток башня: 100 точек картинки против 80 у базы. Ствол на картинке смотрит вправо, как угол 0. */
export const TURRET_SCALE = 100 / 80;

interface Entry {
  img: HTMLImageElement;
  ready: boolean;
}

const cache = new Map<SpriteName, Entry>();
const listeners = new Set<() => void>();
let version = 0;

/** Растёт с каждой догруженной картинкой: холст с кэшем по нему понимает, что пора перерисоваться. */
export function spritesVersion() {
  return version;
}

/** Позвать cb, когда догрузится очередная картинка. Возвращает отписку. */
export function onSpriteLoad(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function entry(name: SpriteName): Entry | null {
  if (typeof Image === "undefined") return null;
  let e = cache.get(name);
  if (!e) {
    const img = new Image();
    const made: Entry = { img, ready: false };
    img.onload = () => {
      made.ready = true;
      version++;
      for (const cb of listeners) cb();
    };
    img.src = `/sprites/${name}.png`;
    cache.set(name, made);
    e = made;
  }
  return e.ready ? e : null;
}

/** Картинка, если уже загружена; иначе null — рисуй вектором. */
export function sprite(name: SpriteName): CanvasImageSource | null {
  return entry(name)?.img ?? null;
}

/** Разбитая установка: от неё остаётся только чёрное пятно на клетке. */
export function drawWreck(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number) {
  ctx.beginPath();
  ctx.arc((cx + 0.5) * cell, (cy + 0.5) * cell, cell * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
}

/** Картинка на клетку (cx, cy), размером в size клеток, с поворотом вокруг середины. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  cx: number,
  cy: number,
  cell: number,
  size = 1,
  angle = 0
) {
  const s = cell * size;
  if (!angle) {
    ctx.drawImage(img, (cx + 0.5) * cell - s / 2, (cy + 0.5) * cell - s / 2, s, s);
    return;
  }
  ctx.save();
  ctx.translate((cx + 0.5) * cell, (cy + 0.5) * cell);
  ctx.rotate(angle);
  ctx.drawImage(img, -s / 2, -s / 2, s, s);
  ctx.restore();
}
