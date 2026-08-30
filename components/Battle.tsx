"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GRID, type Depot, type Gun } from "@/lib/base";
import { buildPlan, type AttackOrder, PATTERNS } from "@/lib/attack";
import {
  createBattle,
  setAim,
  setFiring,
  settle,
  update,
  type BattleResult,
  type GameState,
} from "@/lib/engine";
import { drawFrame } from "@/lib/render";
import MapCanvas, { type Pt } from "./MapCanvas";

export interface BattleOutcome {
  cells: Uint8Array;
  guns: Gun[];
  depots: Depot[];
  result: BattleResult;
  won: boolean;
}

interface Props {
  cells: Uint8Array;
  guns: Gun[];
  depots: Depot[];
  order: AttackOrder;
  onFinish: (o: BattleOutcome) => void;
}

interface Hud {
  phase: GameState["phase"];
  inAir: number;
  left: number;
  killedByGuns: number;
  killedByMg: number;
  fires: number;
  integrity: number;
  gunsAlive: number;
  gunsTotal: number;
  time: number;
}

export default function Battle({ cells, guns, depots, order, onFinish }: Props) {
  const stateRef = useRef<GameState | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [done, setDone] = useState<BattleOutcome | null>(null);
  const finished = useRef(false);

  if (!stateRef.current) {
    stateRef.current = createBattle(cells, guns, depots, buildPlan(order));
  }
  const s = stateRef.current;

  const scene = useMemo(() => ({ cells: s.cells, guns: s.guns, depots: s.depots }), [s]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __battle: unknown }).__battle = { s, update, settle };
    }
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(s, dt);

      if (s.dirty) {
        s.dirty = false;
        setVersion((v) => v + 1);
      }
      if (now - hudAt > 100) {
        hudAt = now;
        setHud({
          phase: s.phase,
          inAir: s.drones.length,
          left: s.plan.length - s.planAt,
          killedByGuns: s.result.killedByGuns,
          killedByMg: s.result.killedByMg,
          fires: s.fire.size,
          integrity: s.baseTotal ? Math.round((s.baseOk / s.baseTotal) * 100) : 0,
          gunsAlive: s.guns.filter((g) => g.alive).length,
          gunsTotal: s.guns.length,
          time: s.time,
        });
      }
      if (s.phase !== "playing" && !finished.current) {
        finished.current = true;
        const out = settle(s);
        setDone({ ...out, won: s.phase === "won" });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s]);

  const toCell = (p: Pt) => {
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
    return { x, y };
  };

  const pattern = PATTERNS.find((p) => p.id === order.pattern);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,700px)_18rem]">
      <div className="relative">
        <MapCanvas
          scene={scene}
          sceneVersion={version}
          cursor="none"
          overlay={(ctx, now) => drawFrame(ctx, s, 7, hoverRef.current, now)}
          onMove={(p) => {
            hoverRef.current = toCell(p);
            setAim(s, hoverRef.current ? p : null);
          }}
          onDown={(p, button) => {
            if (button !== 0) return;
            hoverRef.current = toCell(p);
            setAim(s, p);
            setFiring(s, true);
          }}
          onUp={() => setFiring(s, false)}
          onLeave={() => {
            hoverRef.current = null;
            setAim(s, null);
            setFiring(s, false);
          }}
        />

        {done && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/75 p-6">
            <div className="w-full max-w-sm">
              <div
                className={`mb-1 text-2xl font-bold tracking-wide ${
                  done.won ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {done.won ? "НАЛЁТ ОТБИТ" : "СКЛАД ВЫГОРЕЛ"}
              </div>
              <p className="mb-4 text-sm text-neutral-400">
                Атака {order.from} — {order.drones} дронов, {pattern?.name.toLowerCase()}
              </p>
              <dl className="mb-5 space-y-1 font-mono text-sm">
                <Row label="Запущено дронов" value={String(order.drones)} />
                <Row label="Сбито ракетами" value={String(done.result.killedByGuns)} />
                <Row label="Сбито очередью" value={String(done.result.killedByMg)} />
                <Row label="Прорвалось" value={String(done.result.leaked)} />
                <Row
                  label="Разрушено склада"
                  value={`${
                    s.baseTotal ? Math.round((done.result.burned / s.baseTotal) * 100) : 0
                  }%`}
                />
                <Row label="Потушено водой" value={String(done.result.extinguished)} />
                <Row label="Потеряно дронов" value={String(done.result.dronesLost)} />
                <Row label="Потеряно пушек" value={String(done.result.gunsLost)} />
              </dl>
              <button
                onClick={() => onFinish(done)}
                className="w-full rounded bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white"
              >
                Вернуться на склад
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4 text-sm">
        <div className="rounded-md border border-neutral-700 bg-neutral-900/60 p-4">
          <div className="mb-2 text-xs uppercase tracking-widest text-neutral-400">Налёт</div>
          <p className="mb-3 text-neutral-300">
            {order.from} · {order.drones} дронов · {pattern?.name.toLowerCase()}
          </p>
          <dl className="space-y-1 font-mono">
            <Row label="В небе" value={String(hud?.inAir ?? 0)} />
            <Row label="На подходе" value={String(hud?.left ?? 0)} />
            <Row label="Сбито ракетами" value={String(hud?.killedByGuns ?? 0)} />
            <Row label="Сбито очередью" value={String(hud?.killedByMg ?? 0)} />
            <Row label="Очагов огня" value={String(hud?.fires ?? 0)} />
            <Row label="Пушек живо" value={`${hud?.gunsAlive ?? 0}/${hud?.gunsTotal ?? 0}`} />
            <Row label="Целостность" value={`${hud?.integrity ?? 100}%`} />
            <Row label="Время" value={`${Math.floor(hud?.time ?? 0)} c`} />
          </dl>
        </div>

        <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-4 text-xs leading-relaxed text-neutral-400">
          <p className="mb-2 font-semibold text-neutral-300">Управление</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Над землёй зажатая ЛКМ — пулемётная очередь.</li>
            <li>Над зданием зажатая ЛКМ — струя воды, тушит клетку.</li>
            <li>Подбитый дрон падает через 3 клетки — не сбивай над складом.</li>
            <li>Колесо или щипок — зум, ПКМ — тащить карту.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="text-neutral-100">{value}</dd>
    </div>
  );
}
