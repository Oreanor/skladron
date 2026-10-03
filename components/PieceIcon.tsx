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
/** Корпус дрона на картинке: виден и на тёмной, и на светлой теме. */
const FRAME = "#8a8f98";

function drawDrone(ctx: CanvasRenderingContext2D, color: string) {
  // как дрон в бою: крест рам, четыре винта и цветная боеголовка в середине;
  // корпус серый, а не чёрный, — на тёмном окне чёрный пропадал
  const c = CELL * 1;
  const r = CELL * 0.55;
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
    // холст — две клетки на сторону, предмет — в средней
    const k = (px * dpr) / (CELL * 2);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, CELL * 2, CELL * 2);
    if (payload) {
      drawDrone(ctx, COLORS.payload[payload] ?? COLORS.droneAccent);
      return;
    }
    // установки рисуются по клетке: сдвигаем так, чтобы клетка (0,0) легла в середину
    ctx.translate(CELL * 0.5, CELL * 0.5);
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
