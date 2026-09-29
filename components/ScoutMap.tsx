"use client";

// Просмотр уже снятой карты. Никакой симуляции: показываем ровно то, что
// привёз последний разведвылет, вместе с пробелами, которые он оставил.
// Рядом — разбор обороны: сколько пушек, огнетушителей, ловушек, и какую
// начинку под это имеет смысл брать.

import { useMemo } from "react";
import { GRID, decodeRle, fogPatches, gunKind, type Gun } from "@/lib/base";
import { drawCoverage, installColors } from "@/lib/render";
import { seenShare, scoutCounts, scoutPayloadTips } from "@/lib/scout";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";
import type { ScoutSnapshot } from "@/lib/enemy";
import MapCanvas, { CELL, SIZE } from "./MapCanvas";
import { Button, Chip, ChipBar, SectionTitle } from "./ui";

const KIND_ORDER = ["gun", "rocket", "spray", "trap"] as const;

const KIND_LABEL: Record<(typeof KIND_ORDER)[number], Key> = {
  gun: "tool.gun",
  rocket: "tool.rocket",
  spray: "tool.spray",
  trap: "tool.trap",
};

export default function ScoutMap({
  name,
  snapshot,
  stale = [],
  onClose,
}: {
  name: string;
  snapshot: ScoutSnapshot;
  /** Квадраты, где враг что-то менял после съёмки: они снова под туманом. */
  stale?: number[];
  onClose: () => void;
}) {
  const t = useT();

  const { cells, seen, guns } = useMemo(
    () => ({
      cells: decodeRle(snapshot.cells),
      // что устарело, то и не снято: старым данным верить нельзя
      seen: fogPatches(decodeRle(snapshot.seen), stale),
      guns: snapshot.guns as Gun[],
    }),
    [snapshot, stale]
  );

  const visible = useMemo(
    () => guns.filter((g) => seen[g.cy * GRID + g.cx]),
    [guns, seen]
  );
  const counts = useMemo(() => scoutCounts(visible), [visible]);
  const tips = useMemo(() => scoutPayloadTips(counts), [counts]);

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
  };

  const ago = new Date(snapshot.at).toLocaleString();
  const mapped = Math.round(seenShare(seen) * 100);

  const analysis = (
    <div className="space-y-4 text-sm">
      <div>
        <SectionTitle>{t("scout.analysis")}</SectionTitle>
        <dl className="mt-2 space-y-1.5 font-mono">
          {KIND_ORDER.map((kind) => (
            <div key={kind} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-neutral-400">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/40"
                  style={{ background: installColors(kind).top }}
                  aria-hidden
                />
                {t(KIND_LABEL[kind])}
              </dt>
              <dd className="text-neutral-100">{counts[kind]}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-neutral-800 pt-1.5 text-neutral-500">
            <dt>{t("scout.mapped")}</dt>
            <dd className="text-emerald-300">{mapped}%</dd>
          </div>
        </dl>
      </div>

      <div>
        <SectionTitle>{t("scout.payloadAdvice")}</SectionTitle>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-neutral-400">
          {tips.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[clamp(14rem,22vw,20rem)_minmax(0,1fr)] lg:gap-4">
      <aside className="hidden min-h-0 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900/60 p-4 lg:block">
        {analysis}
      </aside>

      <div className="relative flex min-h-0 flex-1 flex-col gap-2">
        <MapCanvas
          className="min-h-0 flex-1"
          scene={scene}
          sceneVersion={0}
          overlay={overlay}
          cursor="default"
        />

        <ChipBar className="lg:hidden">
          <Chip label={t("scout.mapped")} value={`${mapped}%`} tone="text-emerald-300" />
          {KIND_ORDER.map((kind) =>
            counts[kind] > 0 ? (
              <Chip key={kind} label={t(KIND_LABEL[kind])} value={String(counts[kind])} />
            ) : null
          )}
        </ChipBar>

        {/* на телефоне разбор прячем внизу под картой */}
        <details className="rounded-md border border-neutral-700 bg-neutral-900/60 px-4 py-3 lg:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-200">
            {t("scout.analysis")}
          </summary>
          <div className="mt-3">{analysis}</div>
        </details>

        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-md border border-neutral-700 bg-neutral-900/60 px-4 py-3">
          <span className="font-semibold text-neutral-100">
            {t("scout.viewTitle", { name })}
          </span>
          <span className="hidden font-mono text-sm text-neutral-400 lg:inline">
            {t("scout.mapped")} {mapped}% · {t("scout.gunsFound")} {visible.length}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
            {stale.length > 0
              ? t("scout.stale", { patches: stale.length })
              : t("scout.viewHint", { ago })}
          </span>
          <Button variant="build" size="sm" onClick={onClose}>
            {t("common.ok")}
          </Button>
        </div>
      </div>
    </div>
  );
}
