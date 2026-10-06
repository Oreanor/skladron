/*
 * Свет и тени: солнце сверху слева, у всех одно. Тень ложится вниз-вправо,
 * блик — на верхний левый бок, затенение — на нижний правый.
 *
 * Блик рисуется готовой картинкой по форме предмета: градиент на каждую
 * установку в каждом кадре боя стоил бы дорого, а картинка — один drawImage.
 */

import { G_BASE, G_BURNT, G_FIRE, GRID } from "../base";

export type Shape = "circle" | "square" | "oct";

/** Насколько тень предмета сдвинута от него, в долях клетки. */
const SHADOW_OFF = 0.12;
const SHADOW = "rgba(0, 0, 0, 0.32)";

/** Склад — плита над травой: её тень длиннее, чем у предмета на ней. */
const SLAB_OFF = 0.3;
const SLAB_SHADOW = "rgba(0, 0, 0, 0.3)";
/** Фаска плиты: кромка к солнцу светлее, от солнца — темнее. */
const SLAB_LIT = "rgba(255, 255, 255, 0.35)";
const SLAB_DARK = "rgba(0, 0, 0, 0.28)";
const SLAB_EDGE = 0.12;

/** Блик и затенение на предмете: градиент от верхнего левого угла к нижнему правому. */
const LIGHT_STOPS: [number, string][] = [
  [0, "rgba(255, 255, 255, 0.38)"],
  [0.45, "rgba(255, 255, 255, 0)"],
  [0.6, "rgba(0, 0, 0, 0)"],
  [1, "rgba(0, 0, 0, 0.34)"],
];

/**
 * Контур формы с серединой (x, y) и «радиусом» r: круг, квадрат со
 * скруглёнными углами или восьмиугольник гранью кверху. Путь начинается
 * заново, заливать и обводить — вызывающему.
 */
export function shapePath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number) {
  ctx.beginPath();
  if (shape === "circle") ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (shape === "square") ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.25);
  else {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
}

/** Тень предмета на полу: та же форма, сдвинутая вниз-вправо. */
export function dropShadow(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  r: number,
  cell: number
) {
  const o = cell * SHADOW_OFF;
  shapePath(ctx, shape, x + o, y + o, r);
  ctx.fillStyle = SHADOW;
  ctx.fill();
}

/** Картинка блика в этот размер — на сторону, в точках. */
const LIGHT_SIZE = 64;
const lights = new Map<Shape, HTMLCanvasElement | null>();

function lightFor(shape: Shape) {
  if (lights.has(shape)) return lights.get(shape)!;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    c = document.createElement("canvas");
    c.width = c.height = LIGHT_SIZE;
    const g = c.getContext("2d");
    if (g) {
      const h = LIGHT_SIZE / 2;
      shapePath(g, shape, h, h, h);
      g.clip();
      const grad = g.createLinearGradient(0, 0, LIGHT_SIZE, LIGHT_SIZE);
      for (const [at, color] of LIGHT_STOPS) grad.addColorStop(at, color);
      g.fillStyle = grad;
      g.fillRect(0, 0, LIGHT_SIZE, LIGHT_SIZE);
    } else c = null;
  }
  lights.set(shape, c);
  return c;
}

/** Свет поверх предмета: блик сверху слева, затенение снизу справа. */
export function applyLight(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number) {
  const img = lightFor(shape);
  if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
}

/** Клетка — часть здания: целая, горящая или сгоревшая. */
const building = (v: number) => v === G_BASE || v === G_BURNT || v === G_FIRE;

/** Видимый кусок карты в клетках, концы не включаются. */
interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Тень склада на траве. Рисуется до пола: плита потом закрывает свою часть,
 * и остаётся полоса вниз-вправо. Одним путём — перекрытия не темнеют
 * дважды. Захватываем клетку за краем видимого: её тень заходит внутрь.
 */
export function slabShadow(ctx: CanvasRenderingContext2D, cells: Uint8Array, cell: number, a: Area) {
  const o = cell * SLAB_OFF;
  ctx.beginPath();
  for (let y = Math.max(0, a.y0 - 1); y < a.y1; y++) {
    const row = y * GRID;
    for (let x = Math.max(0, a.x0 - 1); x < a.x1; x++) {
      if (building(cells[row + x])) ctx.rect(x * cell + o, y * cell + o, cell, cell);
    }
  }
  ctx.fillStyle = SLAB_SHADOW;
  ctx.fill();
}

/** Фаска по краю плиты: по ней склад и читается приподнятым над травой. */
export function slabBevel(ctx: CanvasRenderingContext2D, cells: Uint8Array, cell: number, a: Area) {
  const bw = Math.max(0.5, cell * SLAB_EDGE);
  const lit = new Path2D();
  const dark = new Path2D();
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID && y < GRID && building(cells[y * GRID + x]);
  for (let y = a.y0; y < a.y1; y++) {
    for (let x = a.x0; x < a.x1; x++) {
      if (!at(x, y)) continue;
      const px = x * cell;
      const py = y * cell;
      if (!at(x, y - 1)) lit.rect(px, py, cell, bw);
      if (!at(x - 1, y)) lit.rect(px, py, bw, cell);
      if (!at(x, y + 1)) dark.rect(px, py + cell - bw, cell, bw);
      if (!at(x + 1, y)) dark.rect(px + cell - bw, py, bw, cell);
    }
  }
  ctx.fillStyle = SLAB_LIT;
  ctx.fill(lit);
  ctx.fillStyle = SLAB_DARK;
  ctx.fill(dark);
}
