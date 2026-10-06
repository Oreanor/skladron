"use client";

/*
 * Маленькая картинка предмета — нарисованная теми же функциями, что и карта:
 * в правилах видно, как установка, ящик или дрон с такой начинкой выглядят
 * на поле, а не только как они называются.
 */

import { useEffect, useRef } from "react";
import { COLORS, drawDepots, drawDrone, drawPiece } from "@/lib/render";

export type PieceKind = "gun" | "rocket" | "spray" | "trap" | "balloon" | "depot";

/** Клетка картинки в точках холста: предмет рисуется на одной клетке с полями. */
const CELL = 10;
/** Сколько клеток на сторону картинки: чуть больше одной — предмет крупно, с полями. */
const VIEW = 1.4;

export default function PieceIcon({
  kind,
  payload,
  className = "",
}: {
  /** Что нарисовать: установку или ящик. */
  kind?: PieceKind;
  /** Либо дрона с такой начинкой. */
  payload?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const px = canvas.clientWidth || 24;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = (px * dpr) / (CELL * VIEW);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, CELL * VIEW, CELL * VIEW);
    if (payload) {
      // как дрон в бою, только рама серая: рядом с тёмными установками чёрная терялась
      const c = (CELL * VIEW) / 2;
      ctx.lineWidth = CELL * 0.14;
      drawDrone(ctx, c, c, CELL * 0.4, COLORS.payload[payload] ?? COLORS.droneAccent, COLORS.droneIcon);
      return;
    }
    // установки рисуются по клетке: сдвигаем так, чтобы клетка (0,0) легла в середину
    ctx.translate((CELL * (VIEW - 1)) / 2, (CELL * (VIEW - 1)) / 2);
    if (kind === "depot") drawDepots(ctx, [{ cx: 0, cy: 0, n: 10 }], CELL);
    else drawPiece(ctx, kind ?? "gun", 0, 0, CELL, -Math.PI / 4);
  }, [kind, payload]);
  return <canvas ref={ref} aria-hidden className={`inline-block h-6 w-6 shrink-0 align-middle ${className}`} />;
}