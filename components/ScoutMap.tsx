"use client";

// Просмотр уже снятой карты. Никакой симуляции: показываем ровно то, что
// привёз последний разведвылет, вместе с пробелами, которые он оставил.

import { useMemo } from "react";
import { GRID, decodeRle, type Gun } from "@/lib/base";
import { COLORS, drawCoverage } from "@/lib/render";
import { seenShare } from "@/lib/scout";
import { useT } from "@/lib/i18n";
import type { ScoutSnapshot } from "@/lib/enemy";
import MapCanvas, { CELL, SIZE } from "./MapCanvas";
import { Button, Chip, ChipBar } from "./ui";

export default function ScoutMap({
  name,
  snapshot,
  onClose,
}: {
  name: string;
  snapshot: ScoutSnapshot;
  onClose: () => void;
}) {
  const t = useT();

  const { cells, seen, guns } = useMemo(
    () => ({
      cells: decodeRle(snapshot.cells),
      seen: decodeRle(snapshot.seen),
      guns: snapshot.guns as Gun[],
    }),
    [snapshot]
  );

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

  const overlay = (ctx: CanvasRenderingContext2D) => {
    if (guns.length) {
      drawCoverage(ctx, guns, CELL);
      for (const g of guns) {
        ctx.fillStyle = COLORS.gun;
        ctx.fillRect(g.cx * CELL, g.cy * CELL, CELL, CELL);
        ctx.fillStyle = COLORS.gunTop;
        ctx.fillRect(g.cx * CELL + CELL * 0.25, g.cy * CELL + CELL * 0.25, CELL * 0.5, CELL * 0.5);
      }
    }
    if (fog) ctx.drawImage(fog, 0, 0, SIZE, SIZE);
  };

  const ago = new Date(snapshot.at).toLocaleString();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <MapCanvas
        className="min-h-0 flex-1"
        scene={scene}
        sceneVersion={0}
        overlay={overlay}
        cursor="default"
      />

      <ChipBar className="lg:hidden">
        <Chip
          label={t("scout.mapped")}
          value={`${Math.round(seenShare(seen) * 100)}%`}
          tone="text-emerald-300"
        />
        <Chip label={t("scout.gunsFound")} value={String(guns.length)} />
      </ChipBar>

      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-md border border-neutral-700 bg-neutral-900/60 px-4 py-3">
        <span className="font-semibold text-neutral-100">
          {t("scout.viewTitle", { name })}
        </span>
        <span className="hidden font-mono text-sm text-neutral-400 lg:inline">
          {t("scout.mapped")} {Math.round(seenShare(seen) * 100)}% · {t("scout.gunsFound")}{" "}
          {guns.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
          {t("scout.viewHint", { ago })}
        </span>
        <Button variant="neutral" size="sm" onClick={onClose}>
          {t("common.ok")}
        </Button>
      </div>
    </div>
  );
}
