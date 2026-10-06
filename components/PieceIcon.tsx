"use client";

/*
 * Маленькая картинка предмета — нарисованная теми же функциями, что и карта:
 * в правилах видно, как установка, ящик или дрон с такой начинкой выглядят
 * на поле, а не только как они называются.
 */

import { useEffect, useRef } from "react";
import {
  COLORS,
  drawBalloonPad,
  drawDepots,
  drawRocket,
  drawSpray,
  drawTrap,
  drawTurret,
} from "@/lib/render";

export type PieceKind = "gun" | "rocket" | "spray" | "trap" | "balloon" | "depot";

/** Клетка картинки в точках холста: предмет рисуется на одной клетке с полями. */
const CELL = 10;
/** Сколько клеток на сторону картинки: чуть больше одной — предмет крупно, с полями. */
const VIEW = 1.4;
/** Корпус дрона на картинке — серый: рядом с тёмными установками чёрный терялся. */
const FRAME = "#8a8f98";

function drawDrone(ctx: CanvasRenderingContext2D, color: string) {
  // как дрон в бою: крест рам, четыре винта и цветная боеголовка в середине
  const c = (CELL * VIEW) / 2;
  const r = CELL * 0.4;
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = CELL * 0.14;
  ctx.beginPath();
  ctx.moveTo(c - r, c - r);
  ctx.lineTo(c + r, c + r);
  ctx.moveTo(c + r, c - r);
  ctx.lineTo(c - r, c + r);
  ctx.stroke();
  ctx.fillStyle = FRAME;
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    ctx.beginPath();
    ctx.arc(c + ox, c + oy, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

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
      drawDrone(ctx, COLORS.payload[payload] ?? COLORS.droneAccent);
      return;
    }
    // установки рисуются по клетке: сдвигаем так, чтобы клетка (0,0) легла в середину
    ctx.translate((CELL * (VIEW - 1)) / 2, (CELL * (VIEW - 1)) / 2);
    const angle = -Math.PI / 4;
    switch (kind) {
      case "rocket":
        drawRocket(ctx, 0, 0, CELL, angle, true);
        break;
      case "spray":
        drawSpray(ctx, 0, 0, CELL, 0, 0, true);
        break;
      case "trap":
        drawTrap(ctx, 0, 0, CELL, true);
        break;
      case "balloon":
        drawBalloonPad(ctx, 0, 0, CELL, true);
        break;
      case "depot":
        drawDepots(ctx, [{ cx: 0, cy: 0, n: 10 }], CELL);
        break;
      default:
        drawTurret(ctx, 0, 0, CELL, angle, true);
    }
  }, [kind, payload]);
  return <canvas ref={ref} aria-hidden className={`inline-block h-6 w-6 shrink-0 align-middle ${className}`} />;
}
