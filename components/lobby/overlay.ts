/*
 * Примитивы, которыми лобби рисует поверх карты: рамка заготовки, подсветка
 * свободных клеток, всплывающие ценники и подпись под курсором.
 *
 * Здесь нет ни состояния, ни знания о том, каким инструментом сейчас
 * работают: каждой функции говорят, что рисовать и годится ли место. Само
 * лобби остаётся распорядителем — оно решает, что и когда звать.
 */

import {
  GRID,
  G_BASE,
  G_BURNT,
  type Depot,
  type Gun,
  type Rect,
  freeCells,
  idx,
} from "@/lib/base";

/** Сколько живёт всплывающая цена, мс. */
export const TAG_MS = 1000;

/** «−100 кр» над клеткой: видно, за что ушли деньги и куда вернулись. */
export interface PriceTag {
  x: number;
  y: number;
  text: string;
  /** Деньги пришли, а не ушли: такие пишем зелёным. */
  gain: boolean;
  at: number;
}

const OK = "#8ecae6";
const BAD = "#ff6b6b";

/** Клетка под курсором внутри карты? */
export const onMap = (cx: number, cy: number) =>
  cx >= 0 && cy >= 0 && cx < GRID && cy < GRID;

/** Подсвечивает клетки, куда сейчас можно что-то поставить. */
export function drawFreeCells(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cells: Uint8Array,
  guns: Gun[],
  depots: Depot[],
  color: string
) {
  ctx.fillStyle = color;
  for (const i of freeCells(cells, guns, depots)) {
    ctx.fillRect((i % GRID) * cell, ((i / GRID) | 0) * cell, cell, cell);
  }
}

/** Рамка вокруг клетки: синяя — можно ронять, красная — нельзя. */
export function drawDropTarget(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cx: number,
  cy: number,
  ok: boolean,
  okColor = OK
) {
  ctx.strokeStyle = ok ? okColor : BAD;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx * cell, cy * cell, cell, cell);
}

/** Свободна ли клетка под установку или контейнер, если не считать «откуда тащим». */
export function dropAllowed(
  cells: Uint8Array,
  guns: Gun[],
  depots: Depot[],
  cx: number,
  cy: number,
  from?: { cx: number; cy: number } | null
) {
  if (from && cx === from.cx && cy === from.cy) return true;
  if (!onMap(cx, cy) || cells[idx(cx, cy)] !== G_BASE) return false;
  const moved = (item: { cx: number; cy: number }) =>
    !from || item.cx !== from.cx || item.cy !== from.cy;
  if (guns.some((g) => moved(g) && g.cx === cx && g.cy === cy)) return false;
  if (depots.some((d) => moved(d) && d.cx === cx && d.cy === cy)) return false;
  return true;
}

/**
 * Заготовка: сама рамка с уголками, а под ремонт и снос ещё и заливка тех
 * клеток, за которые спишутся деньги, — чтобы видеть счёт до нажатия.
 */
export function drawDraft(
  ctx: CanvasRenderingContext2D,
  cell: number,
  d: Rect,
  o: {
    cells: Uint8Array;
    /** Показывать залитыми сгоревшие клетки: ремонт и снос платят за них. */
    burntOnly?: "repair" | "scrap";
    /** Снос идёт целиком, без остатка. */
    scrapWhole?: boolean;
    afford: boolean;
    connects: boolean;
  }
) {
  if (d.w <= 0 || d.h <= 0) return;

  if (o.burntOnly) {
    ctx.fillStyle =
      o.burntOnly === "scrap"
        ? o.scrapWhole
          ? "rgba(214, 168, 92, 0.55)"
          : "rgba(229, 56, 59, 0.55)"
        : o.afford
          ? "rgba(140, 215, 255, 0.55)"
          : "rgba(229, 56, 59, 0.5)";
    for (let y = d.y; y < d.y + d.h; y++) {
      for (let x = d.x; x < d.x + d.w; x++) {
        if (!onMap(x, y)) continue;
        if (o.cells[idx(x, y)] === G_BURNT) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  const bad = !o.connects || !o.afford;
  ctx.fillStyle = bad ? "rgba(229, 56, 59, 0.28)" : "rgba(229, 90, 43, 0.3)";
  ctx.fillRect(d.x * cell, d.y * cell, d.w * cell, d.h * cell);
  ctx.strokeStyle = bad ? BAD : "#ff9f5a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(d.x * cell, d.y * cell, d.w * cell, d.h * cell);

  ctx.fillStyle = "#ff9f5a";
  const hs = cell * 1.6;
  for (const [hx, hy] of [
    [d.x, d.y],
    [d.x + d.w, d.y],
    [d.x, d.y + d.h],
    [d.x + d.w, d.y + d.h],
  ]) {
    ctx.fillRect(hx * cell - hs / 2, hy * cell - hs / 2, hs, hs);
  }
}

/** Клетка под курсором: синяя — инструмент тут сработает, красная — нет. */
export function drawHoverCell(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cx: number,
  cy: number,
  ok: boolean
) {
  ctx.fillStyle = ok ? "rgba(140, 215, 255, 0.6)" : "rgba(229, 56, 59, 0.55)";
  ctx.fillRect(cx * cell, cy * cell, cell, cell);
}

/** Ценники: всплывают над клеткой, поднимаются и гаснут. Отжившие выкидываем. */
export function drawPriceTags(
  ctx: CanvasRenderingContext2D,
  cell: number,
  tags: PriceTag[],
  now: number
): PriceTag[] {
  const live = tags.filter((tag) => now - tag.at < TAG_MS);
  if (!live.length) return live;

  ctx.save();
  ctx.font = `600 ${cell * 1.7}px ui-monospace, SFMono-Regular, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = cell * 0.22;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  for (const tag of live) {
    const k = (now - tag.at) / TAG_MS;
    const px = (tag.x + 0.5) * cell;
    const py = (tag.y - k * 1.6) * cell;
    ctx.globalAlpha = 1 - k * k;
    ctx.strokeText(tag.text, px, py);
    ctx.fillStyle = tag.gain ? "#7ee787" : "#ffb454";
    ctx.fillText(tag.text, px, py);
  }
  ctx.restore();
  return live;
}

/**
 * Подпись-плашка над клеткой. Размер держим экранный, а не игровой, иначе
 * на отдалении она станет нечитаемой; но на 0.5× обратный масштаб раздул бы
 * её вдвое, поэтому он с потолком.
 */
export function drawHoverLabel(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cx: number,
  cy: number,
  label: string,
  zoom: number
) {
  const inv = Math.min(1 / (zoom || 1), 1.35);
  ctx.save();
  ctx.translate((cx + 0.5) * cell, cy * cell - cell * 0.35);
  ctx.scale(inv, inv);
  ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(label).width;
  const padX = 6;
  const padY = 3;
  const boxH = 12 + padY * 2;
  const boxY = -boxH;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(-tw / 2 - padX, boxY, tw + padX * 2, boxH);
  ctx.fillStyle = "#f5f5f5";
  ctx.fillText(label, 0, boxY + boxH / 2);
  ctx.restore();
}
