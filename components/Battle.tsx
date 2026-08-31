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
  type BattleLevels,
  type BattleResult,
  type GameState,
} from "@/lib/engine";
import { drawFrame } from "@/lib/render";
import { DRONE_KILL_REWARD, fmt } from "@/lib/economy";
import MapCanvas, { type Pt } from "./MapCanvas";
import { Button, Chip, ChipBar, IconButton, Panel, Row } from "./ui";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

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
  /** Свои уровни: пушки, пулемёт, брандспойт. */
  levels?: BattleLevels;
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

export default function Battle({ cells, guns, depots, order, levels, onFinish }: Props) {
  const stateRef = useRef<GameState | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [done, setDone] = useState<BattleOutcome | null>(null);
  const [hints, setHints] = useState(false);
  const t = useT();
  const finished = useRef(false);

  if (!stateRef.current) {
    stateRef.current = createBattle(cells, guns, depots, buildPlan(order), {
      ...levels,
      drones: order.droneLevel ?? 1,
    });
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
    let mapAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(s, dt);

      // Перерисовка карты стоит десяти тысяч заливок, а пожар ползёт
      // секундами: чаще десяти раз в секунду обновлять её незачем.
      if (s.dirty && now - mapAt > 100) {
        s.dirty = false;
        mapAt = now;
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

  const patternName = t(`pattern.${order.pattern}` as Key).toLowerCase();
  const seconds = `${Math.floor(hud?.time ?? 0)} ${t("battle.seconds")}`;
  const killReward = ((hud?.killedByGuns ?? 0) + (hud?.killedByMg ?? 0)) * DRONE_KILL_REWARD;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-4">
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
          <Chip label={t("battle.hudAir")} value={String(hud?.inAir ?? 0)} tone="text-red-300" />
          <Chip label={t("battle.hudLeft")} value={String(hud?.left ?? 0)} />
          <Chip
            label={t("battle.hudKilled")}
            value={String((hud?.killedByGuns ?? 0) + (hud?.killedByMg ?? 0))}
            tone="text-emerald-300"
          />
          <Chip
            label={t("battle.killReward")}
            value={`+${fmt(
              ((hud?.killedByGuns ?? 0) + (hud?.killedByMg ?? 0)) * DRONE_KILL_REWARD
            )}`}
            tone="text-emerald-300"
          />
          <Chip
            label={t("battle.hudFires")}
            value={String(hud?.fires ?? 0)}
            tone={hud?.fires ? "text-orange-300" : undefined}
          />
          <Chip label={t("battle.hudGuns")} value={`${hud?.gunsAlive ?? 0}/${hud?.gunsTotal ?? 0}`} />
          <Chip
            label={t("battle.hudIntegrity")}
            value={`${hud?.integrity ?? 100}%`}
            tone={(hud?.integrity ?? 100) < 60 ? "text-orange-300" : "text-emerald-300"}
          />
          <Chip label={t("battle.hudTime")} value={seconds} />
        </ChipBar>

        {/* подсказка по управлению: на телефоне разворачивается по кнопке */}
        <IconButton
          label={t("panel.controls")}
          round
          onClick={() => setHints((v) => !v)}
          className="absolute right-2 top-12 z-10 h-8 w-8 bg-black/60 lg:hidden"
        >
          ?
        </IconButton>
        {hints && (
          <div className="absolute inset-x-2 top-12 z-10 rounded-md border border-neutral-700 bg-neutral-950/95 p-3 text-xs leading-relaxed text-neutral-400 lg:hidden">
            <p className="mb-2 font-semibold text-neutral-300">{t("panel.controls")}</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>{t("controls.mgHold")}</li>
              <li>{t("controls.waterHold")}</li>
              <li>{t("controls.fallingDrone")}</li>
              <li>{t("controls.zoomTouch")}</li>
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
                {done.won ? t("battle.won") : t("battle.lost")}
              </div>
              <p className="mb-4 text-sm text-neutral-400">
                {t("battle.header", {
                  from: order.from,
                  drones: order.drones,
                  pattern: patternName,
                })}
              </p>
              <dl className="mb-5 space-y-1 font-mono text-sm">
                <Row label={t("battle.sent")} value={String(order.drones)} />
                <Row label={t("battle.killedByGuns")} value={String(done.result.killedByGuns)} />
                <Row label={t("battle.killedByMg")} value={String(done.result.killedByMg)} />
                <Row
                  label={t("battle.killReward")}
                  value={`+${fmt(
                    (done.result.killedByGuns + done.result.killedByMg) * DRONE_KILL_REWARD
                  )} кр`}
                />
                <Row
                  label={t("battle.totalReward")}
                  value={`+${fmt(
                    (done.result.killedByGuns + done.result.killedByMg) *
                      DRONE_KILL_REWARD
                  )} кр`}
                />
                <Row label={t("battle.leaked")} value={String(done.result.leaked)} />
                <Row
                  label={t("battle.destroyedShare")}
                  value={`${
                    s.baseTotal ? Math.round((done.result.burned / s.baseTotal) * 100) : 0
                  }%`}
                />
                <Row label={t("battle.extinguished")} value={String(done.result.extinguished)} />
                <Row label={t("battle.dronesLost")} value={String(done.result.dronesLost)} />
                <Row label={t("battle.gunsLost")} value={String(done.result.gunsLost)} />
              </dl>
              <Button variant="neutral" block onClick={() => onFinish(done)}>
                {t("battle.back")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <aside className="hidden min-h-0 space-y-4 overflow-y-auto text-sm lg:block [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Panel title={t("panel.raid")}>
          <p className="mb-3 text-neutral-300">
            {t("battle.header", {
              from: order.from,
              drones: order.drones,
              pattern: patternName,
            })}
          </p>
          <dl className="space-y-1 font-mono">
            <Row label={t("battle.inAir")} value={String(hud?.inAir ?? 0)} />
            <Row label={t("battle.incomingLeft")} value={String(hud?.left ?? 0)} />
            <Row label={t("battle.killedByGuns")} value={String(hud?.killedByGuns ?? 0)} />
            <Row label={t("battle.killedByMg")} value={String(hud?.killedByMg ?? 0)} />
            <Row
              label={t("battle.killReward")}
              value={`+${fmt(killReward)} ${t("battle.creditsSuffix")}`}
            />
            <Row label={t("battle.fires")} value={String(hud?.fires ?? 0)} />
            <Row label={t("battle.gunsAlive")} value={`${hud?.gunsAlive ?? 0}/${hud?.gunsTotal ?? 0}`} />
            <Row label={t("battle.integrity")} value={`${hud?.integrity ?? 100}%`} />
            <Row label={t("battle.time")} value={seconds} />
          </dl>
        </Panel>

        <Panel title={t("panel.controls")}>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-neutral-400">
            <li>{t("controls.mgHold")}</li>
            <li>{t("controls.waterHold")}</li>
            <li>{t("controls.fallingDrone")}</li>
            <li>{t("controls.zoomDesktop")}</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}
