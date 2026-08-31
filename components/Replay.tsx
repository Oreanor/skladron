"use client";

// Повтор налёта глазами нападавшего. Ничего не выдумываем: берём слепок
// склада защитника, то же расписание вылетов по тому же seed и запись его
// действий — и прокручиваем бой тем же движком, теми же шагами.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPlan, type AttackReport } from "@/lib/attack";
import { decodeCells, type Depot, type Gun } from "@/lib/base";
import { createBattle, setAim, setFiring, update, type GameState } from "@/lib/engine";
import { drawFrame } from "@/lib/render";
import { STEP, decodeTrace } from "@/lib/replay";
import { fmt } from "@/lib/economy";
import { useT } from "@/lib/i18n";
import MapCanvas, { CELL } from "./MapCanvas";
import { Button, Chip, ChipBar } from "./ui";

/** Во сколько раз крутим бой. Живьём он идёт минуты — смотреть столько незачем. */
const SPEEDS = [1, 2, 4] as const;

export default function Replay({
  report,
  onClose,
}: {
  report: AttackReport;
  onClose: () => void;
}) {
  const t = useT();
  const replay = report.replay!;
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [version, setVersion] = useState(0);
  const [hud, setHud] = useState({ time: 0, inAir: 0, burned: 0, done: false });
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const frames = useMemo(() => decodeTrace(replay.trace), [replay.trace]);

  const state = useRef<GameState | null>(null);
  if (!state.current) {
    state.current = createBattle(
      decodeCells(replay.cells),
      replay.guns as Gun[],
      replay.depots as Depot[],
      buildPlan(replay.order),
      { ...replay.levels, drones: replay.order.droneLevel ?? 1, seed: replay.order.seed }
    );
  }
  const s = state.current;

  const scene = useMemo(() => ({ cells: s.cells, guns: s.guns, depots: s.depots }), [s]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let step = 0;
    let hudAt = 0;
    let mapAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      carry += dt * speedRef.current;

      let guard = 0;
      while (carry >= STEP && guard++ < 32 && s.phase === "playing") {
        carry -= STEP;
        // руки защитника: что он делал на этом шаге, то и повторяем
        const f = frames[step++] ?? null;
        setAim(s, f ? { x: f.x + 0.5, y: f.y + 0.5 } : null);
        setFiring(s, Boolean(f?.firing));
        update(s, STEP);
      }

      if (s.dirty && now - mapAt > 100) {
        s.dirty = false;
        mapAt = now;
        setVersion((v) => v + 1);
      }
      if (now - hudAt > 100) {
        hudAt = now;
        setHud({
          time: s.time,
          inAir: s.drones.length,
          burned: s.result.burned,
          done: s.phase !== "playing",
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s, frames]);

  const overlay = (ctx: CanvasRenderingContext2D, now: number) => {
    drawFrame(ctx, s, CELL, null, now);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ChipBar className="shrink-0 flex-wrap">
        <Chip label={t("replay.of")} value={report.target} />
        <Chip label={t("battle.time")} value={`${Math.floor(hud.time)} ${t("battle.seconds")}`} />
        <Chip label={t("battle.inAir")} value={String(hud.inAir)} />
        <Chip label={t("battle.burned")} value={fmt(hud.burned)} tone="text-orange-300" />
      </ChipBar>

      <MapCanvas
        className="min-h-0 flex-1"
        scene={scene}
        sceneVersion={version}
        overlay={overlay}
        cursor="default"
      />

      <div className="flex shrink-0 items-center gap-2">
        {SPEEDS.map((v) => (
          <Button key={v} size="sm" active={speed === v} onClick={() => setSpeed(v)}>
            {v}×
          </Button>
        ))}
        <Button variant="neutral" className="ml-auto" onClick={onClose}>
          {t("common.ok")}
        </Button>
      </div>
    </div>
  );
}
