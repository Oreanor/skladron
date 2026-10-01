"use client";

// Снятая разведкой карта врага — прямо в его карточке: зумится колесом,
// таскается правой кнопкой или двумя пальцами — как карта везде. Никакой
// симуляции: показываем ровно то, что привёз последний разведвылет, вместе
// с пробелами, которые он оставил.

import { useMemo, useRef } from "react";
import { GRID, decodeRle, fogPatches, gunKind, type Gun } from "@/lib/base";
import { drawCoverage, installColors } from "@/lib/render";
import type { ScoutSnapshot } from "@/lib/enemy";
import { seenGuns } from "@/lib/scout";
import MapCanvas, { CELL, SIZE } from "./MapCanvas";
import { drawHoverLabel } from "./lobby/overlay";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

/** Что написать над установкой под курсором. */
const KIND_LABEL: Record<ReturnType<typeof gunKind>, Key> = {
  gun: "tool.gun",
  rocket: "tool.rocket",
  spray: "tool.spray",
  trap: "tool.trap",
};

export default function ScoutMap({
  snapshot,
  stale = [],
  className = "",
}: {
  snapshot: ScoutSnapshot;
  /** Квадраты, где враг что-то менял после съёмки: они снова под туманом. */
  stale?: number[];
  className?: string;
}) {
  const t = useT();
  /** Клетка под курсором: над установкой на ней всплывает подпись. */
  const hover = useRef<{ x: number; y: number } | null>(null);
  const { cells, seen, guns } = useMemo(
    () => ({
      cells: decodeRle(snapshot.cells),
      // что устарело, то и не снято: старым данным верить нельзя
      seen: fogPatches(decodeRle(snapshot.seen), stale),
      guns: snapshot.guns as Gun[],
    }),
    [snapshot, stale]
  );

  const visible = useMemo(() => seenGuns(guns, seen), [guns, seen]);

  // туман рисуем разом: карта не меняется, перерисовывать его каждый кадр незачем
  const fog = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = SIZE;
    c.height = SIZE;
    const g = c.getContext("2d");
    if (!g) return c;
    g.fillStyle = "#0b0d0b";
    g.fillRect(0, 0, SIZE, SIZE);
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < seen.length; i++) {
      if (seen[i]) g.fillRect((i % GRID) * CELL, ((i / GRID) | 0) * CELL, CELL, CELL);
    }
    return c;
  }, [seen]);

  const scene = useMemo(() => ({ cells, guns: [] }), [cells]);

  const overlay = (ctx: CanvasRenderingContext2D, _now: number, view: { zoom: number }) => {
    if (visible.length) {
      drawCoverage(ctx, visible, CELL);
      for (const g of visible) {
        const paint = installColors(gunKind(g));
        ctx.fillStyle = paint.body;
        ctx.fillRect(g.cx * CELL, g.cy * CELL, CELL, CELL);
        ctx.fillStyle = paint.top;
        ctx.fillRect(
          g.cx * CELL + CELL * 0.25,
          g.cy * CELL + CELL * 0.25,
          CELL * 0.5,
          CELL * 0.5
        );
      }
    }
    if (fog) ctx.drawImage(fog, 0, 0, SIZE, SIZE);
    // подпись поверх тумана, иначе у края снятого её съедало бы
    const h = hover.current;
    const under = h && visible.find((g) => g.cx === h.x && g.cy === h.y);
    if (under) drawHoverLabel(ctx, CELL, under.cx, under.cy, t(KIND_LABEL[gunKind(under)]), view.zoom);
  };

  return (
    <MapCanvas
      fit
      className={className}
      scene={scene}
      sceneVersion={0}
      overlay={overlay}
      onMove={(p) => {
        hover.current = { x: Math.floor(p.x), y: Math.floor(p.y) };
      }}
      onLeave={() => {
        hover.current = null;
      }}
      cursor="default"
    />
  );
}
