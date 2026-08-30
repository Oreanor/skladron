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
import { DRONE_KILL_REWARD, fmt } from "@/lib/economy";
import MapCanvas, { type Pt } from "./MapCanvas";
import { Button, Chip, ChipBar, IconButton, Panel, Row, SectionTitle } from "./ui";

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
  const [hints, setHints] = useState(false);
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
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,700px)_18rem] lg:gap-4">
      <div className="relative flex min-h-0 flex-1 flex-col gap-2">
        <MapCanvas
          className="min-h-0 flex-1"
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

        {/* компактный HUD телефона: под картой, одной прокручиваемой строкой */}
        <ChipBar className="lg:hidden">
          <Chip label="в небе" value={String(hud?.inAir ?? 0)} tone="text-red-300" />
          <Chip label="на подходе" value={String(hud?.left ?? 0)} />
          <Chip
            label="сбито"
            value={String((hud?.killedByGuns ?? 0) + (hud?.killedByMg ?? 0))}
            tone="text-emerald-300"
          />
          <Chip
            label="награда"
            value={`+${fmt(
              ((hud?.killedByGuns ?? 0) + (hud?.killedByMg ?? 0)) * DRONE_KILL_REWARD
            )}`}
            tone="text-emerald-300"
          />
          <Chip
            label="огонь"
            value={String(hud?.fires ?? 0)}
            tone={hud?.fires ? "text-orange-300" : undefined}
          />
          <Chip label="пушки" value={`${hud?.gunsAlive ?? 0}/${hud?.gunsTotal ?? 0}`} />
          <Chip
            label="целость"
            value={`${hud?.integrity ?? 100}%`}
            tone={(hud?.integrity ?? 100) < 60 ? "text-orange-300" : "text-emerald-300"}
          />
          <Chip label="время" value={`${Math.floor(hud?.time ?? 0)} c`} />
        </ChipBar>

        {/* подсказка по управлению: на телефоне разворачивается по кнопке */}
        <IconButton
          label="Управление"
          round
          onClick={() => setHints((v) => !v)}
          className="absolute right-2 top-12 z-10 h-8 w-8 bg-black/60 lg:hidden"
        >
          ?
        </IconButton>
        {hints && (
          <div className="absolute inset-x-2 top-12 z-10 rounded-md border border-neutral-700 bg-neutral-950/95 p-3 text-xs leading-relaxed text-neutral-400 lg:hidden">
            <p className="mb-2 font-semibold text-neutral-300">Управление</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Держи палец над землёй — пулемётная очередь.</li>
              <li>Держи палец над зданием — струя воды, тушит клетку.</li>
              <li>Подбитый дрон падает через 3 клетки — не сбивай над складом.</li>
              <li>Два пальца — зум и перетаскивание карты.</li>
            </ul>
          </div>
        )}

        {done && (
          <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto rounded-md bg-black/80 p-4 sm:p-6">
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
                <Row
                  label="Награда за сбитые"
                  value={`+${fmt(
                    (done.result.killedByGuns + done.result.killedByMg) * DRONE_KILL_REWARD
                  )} кр`}
                />
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
              <Button variant="neutral" block onClick={() => onFinish(done)}>
                Вернуться на склад
              </Button>
            </div>
          </div>
        )}
      </div>

      <aside className="hidden min-h-0 space-y-4 overflow-y-auto text-sm lg:block">
        <Panel title="Налёт">
          <p className="mb-3 text-neutral-300">
            {order.from} · {order.drones} дронов · {pattern?.name.toLowerCase()}
          </p>
          <dl className="space-y-1 font-mono">
            <Row label="В небе" value={String(hud?.inAir ?? 0)} />
            <Row label="На подходе" value={String(hud?.left ?? 0)} />
            <Row label="Сбито ракетами" value={String(hud?.killedByGuns ?? 0)} />
            <Row label="Сбито очередью" value={String(hud?.killedByMg ?? 0)} />
            <Row
              label="Награда"
              value={`+${fmt(
                ((hud?.killedByGuns ?? 0) + (hud?.killedByMg ?? 0)) * DRONE_KILL_REWARD
              )} кр`}
            />
            <Row label="Очагов огня" value={String(hud?.fires ?? 0)} />
            <Row label="Пушек живо" value={`${hud?.gunsAlive ?? 0}/${hud?.gunsTotal ?? 0}`} />
            <Row label="Целостность" value={`${hud?.integrity ?? 100}%`} />
            <Row label="Время" value={`${Math.floor(hud?.time ?? 0)} c`} />
          </dl>
        </Panel>

        <Panel title="Управление">
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-neutral-400">
            <li>Над землёй зажатая ЛКМ — пулемётная очередь.</li>
            <li>Над зданием зажатая ЛКМ — струя воды, тушит клетку.</li>
            <li>Подбитый дрон падает через 3 клетки — не сбивай над складом.</li>
            <li>Колесо или щипок — зум, ПКМ — тащить карту.</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}
