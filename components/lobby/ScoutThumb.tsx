"use client";

/*
 * Разведанный склад одним кадром — для карточки соперника.
 *
 * Это не урезанный ScoutMap: тот умеет таскать, приближать и держит живой
 * холст, а тут нужна картинка, которую видно с одного взгляда. Рисуем
 * прямо в canvas по клетке на точку и растягиваем стилями — так кадр
 * стоит одну отрисовку, а не кадр в секунду.
 *
 * Обрезаем по тому, что снято: склад занимает середину поля, и показывать
 * вокруг него сорок клеток пустой земли незачем.
 */

import { useEffect, useRef } from "react";
import { GRID, G_BASE, G_BURNT, G_FIRE, decodeRle, gunKind } from "@/lib/base";
import { installColors } from "@/lib/render";
import type { ScoutSnapshot } from "@/lib/enemy";

/** Сколько клеток оставляем вокруг снятого: с полем читается лучше. */
const PAD = 3;

export default function ScoutThumb({ snapshot }: { snapshot: ScoutSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cells = decodeRle(snapshot.cells);
    const seen = decodeRle(snapshot.seen);

    // Границы снятого. Ничего не сняли — показываем середину поля, чтобы
    // кадр не схлопнулся в точку.
    let x0 = GRID, y0 = GRID, x1 = -1, y1 = -1;
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) {
      x0 = y0 = GRID / 2 - 10;
      x1 = y1 = GRID / 2 + 10;
    }
    x0 = Math.max(0, x0 - PAD);
    y0 = Math.max(0, y0 - PAD);
    x1 = Math.min(GRID - 1, x1 + PAD);
    y1 = Math.min(GRID - 1, y1 + PAD);

    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = COLORS.groundA;
    ctx.fillRect(0, 0, w, h);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * GRID + x;
        if (!seen[i]) {
          ctx.fillStyle = "#0b0d0b"; // туман: сюда разведка не долетела
        } else if (cells[i] === G_BASE) ctx.fillStyle = COLORS.base;
        else if (cells[i] === G_BURNT) ctx.fillStyle = COLORS.burnt;
        else if (cells[i] === G_FIRE) ctx.fillStyle = "#e0561a";
        else continue; // земля уже залита фоном
        ctx.fillRect(x - x0, y - y0, 1, 1);
      }
    }

    // Установки цветной точкой: по цвету сразу видно, что именно стоит.
    for (const g of snapshot.guns) {
      if (g.cx < x0 || g.cx > x1 || g.cy < y0 || g.cy > y1) continue;
      ctx.fillStyle = installColors(gunKind(g)).top;
      ctx.fillRect(g.cx - x0, g.cy - y0, 1, 1);
    }
  }, [snapshot]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      // Пиксель в пиксель, без сглаживания: клетка склада должна остаться
      // квадратом, а не расплыться в пятно.
      className="block h-auto w-full [image-rendering:pixelated]"
    />
  );
}
