"use client";

/*
 * Картинка чертежа: склад крупно, по своим границам, а не вся карта сто на
 * сто, где маленький склад терялся бы точкой. Ничего не движется, так что
 * рисуем один раз — заново только при смене размера.
 */

import { useEffect, useMemo, useRef } from "react";
import { GRID, G_BASE, decodeRle } from "@/lib/base";
import type { Blueprint } from "@/lib/blueprint";
import { drawStatic } from "@/lib/render";
import { CELL } from "../MapCanvas";

/** Сколько клеток травы оставить вокруг склада. */
const MARGIN = 2;

export default function BlueprintPreview({
  plan,
  className = "",
}: {
  plan: Pick<Blueprint, "cells" | "guns">;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cells = useMemo(() => decodeRle(plan.cells), [plan.cells]);

  // рамка склада: от неё и масштаб
  const box = useMemo(() => {
    let x0 = GRID;
    let y0 = GRID;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== G_BASE) continue;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (x1 < 0) return { x0: 0, y0: 0, side: GRID };
    // квадрат вокруг склада, чтобы картинка не сплющивалась
    const side = Math.min(GRID, Math.max(x1 - x0, y1 - y0) + 1 + MARGIN * 2);
    const cx = (x0 + x1 + 1) / 2;
    const cy = (y0 + y1 + 1) / 2;
    const clamp = (v: number) => Math.max(0, Math.min(GRID - side, Math.round(v - side / 2)));
    return { x0: clamp(cx), y0: clamp(cy), side };
  }, [cells]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const px = canvas.clientWidth;
      if (!px) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(px * dpr);
      canvas.height = Math.round(px * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const zoom = px / (box.side * CELL);
      ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, -box.x0 * CELL * zoom * dpr, -box.y0 * CELL * zoom * dpr);
      drawStatic(ctx, { cells, guns: plan.guns }, CELL, zoom, {
        x0: box.x0,
        y0: box.y0,
        x1: box.x0 + box.side,
        y1: box.y0 + box.side,
      });
    };
    draw();
    const watch = new ResizeObserver(draw);
    watch.observe(canvas);
    return () => watch.disconnect();
  }, [cells, plan.guns, box]);

  return <canvas ref={canvasRef} className={`block aspect-square w-full rounded-md ${className}`} />;
}
