"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GRID, type Depot, type Gun } from "@/lib/base";
import { buildPlan, type AttackOrder } from "@/lib/attack";
import {
  afterglow,
  createBattle,
  setAim,
  setFiring,
  settle,
  update,
  type BattleLevels,
  type BattleResult,
  type GameState,
} from "@/lib/engine";
import { drawFrame, COLORS } from "@/lib/render";
import { goodsValue, insurance, defenseBounty, fmt } from "@/lib/economy";
import MapCanvas, { type Pt } from "./MapCanvas";
import { Button, Chip, ChipBar, IconButton, Panel, Row } from "./ui";
import { encodeTrace, type Frame } from "@/lib/replay";
import { SIM } from "@/lib/tuning";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";
import { PAYLOADS, type Payload } from "@/lib/attack";

export interface BattleOutcome {
  cells: Uint8Array;
  guns: Gun[];
  depots: Depot[];
  result: BattleResult;
  won: boolean;
  /** Запись действий защитника: по ней нападавший увидит бой своими глазами. */
  trace: string;
}

interface Props {
  cells: Uint8Array;
  guns: Gun[];
  depots: Depot[];
  order: AttackOrder;
  /** Свои уровни: пушки, пулемёт, брандспойт. */
  levels?: BattleLevels;
  /** Уровень страхового полиса — по нему считается выплата. */
  insuranceLevel?: number;
  onFinish: (o: BattleOutcome) => void;
}

interface Hud {
  phase: GameState["phase"];
  inAir: number;
  left: number;
  killedByGuns: number;
  killedByMg: number;
  fires: number;
  burned: number;
  goodsLost: number;
  gunsLost: number;
  integrity: number;
  gunsAlive: number;
  gunsTotal: number;
  time: number;
  /** Сколько дронов каждого груза ещё в воздухе и не сбито. */
  byPayload: Partial<Record<Payload, number>>;
}

/** Сколько поле видно после конца боя, прежде чем его накроет итог. */
const END_PAUSE_MS = 1500;

export default function Battle({
  cells,
  guns,
  depots,
  order,
  levels,
  insuranceLevel = 1,
  onFinish,
}: Props) {
  const stateRef = useRef<GameState | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [done, setDone] = useState<BattleOutcome | null>(null);
  const [hints, setHints] = useState(false);
  const t = useT();
  const finished = useRef(false);
  /** Во что обходился товар до боя: из него считаем, сколько сгорело. */
  const startGoods = useMemo(() => goodsValue(depots), [depots]);
  /** Кадры действий защитника — из них собирается повтор для нападавшего. */
  const trace = useRef<(Frame | null)[]>([]);

  if (!stateRef.current) {
    stateRef.current = createBattle(cells, guns, depots, buildPlan(order), {
      ...levels,
      drones: order.droneLevel,
      seed: order.seed,
    });
  }
  const s = stateRef.current;

  // Пушки на накладке: на статичном слое их стволы смотрели бы наружу
  // и просвечивали бледным «призраком» под живым углом.
  const scene = useMemo(() => ({ cells: s.cells, guns: [], depots: s.depots }), [s]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __battle: unknown }).__battle = { s, update, settle };
    }
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let mapAt = 0;
    let carry = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Шаг фиксированный: иначе бой зависит от частоты кадров и повтор у
      // нападавшего разошёлся бы с тем, что видел защитник.
      carry += dt;
      let steps = 0;
      while (carry >= SIM.step && steps++ < 8) {
        carry -= SIM.step;
        if (trace.current.length < SIM.maxFrames) {
          const a = s.aim;
          trace.current.push(
            a ? { x: Math.floor(a.x), y: Math.floor(a.y), firing: s.firing } : null
          );
        }
        update(s, SIM.step);
        afterglow(s, SIM.step);
      }

      // Перерисовка карты стоит десяти тысяч заливок, а пожар ползёт
      // секундами: чаще десяти раз в секунду обновлять её незачем.
      if (s.dirty && now - mapAt > 100) {
        s.dirty = false;
        mapAt = now;
        setVersion((v) => v + 1);
      }
      if (now - hudAt > 100) {
        hudAt = now;
        const byPayload: Partial<Record<Payload, number>> = {};
        for (const d of s.drones) {
          if (!d.hit) byPayload[d.payload] = (byPayload[d.payload] ?? 0) + 1;
        }
        setHud({
          phase: s.phase,
          inAir: s.drones.length,
          left: s.plan.length - s.planAt,
          killedByGuns: s.result.killedByGuns,
          killedByMg: s.result.killedByMg,
          fires: s.fire.size,
          burned: s.result.burned,
          goodsLost: startGoods - goodsValue(s.depots),
          gunsLost: s.result.gunsLost,
          integrity: s.baseTotal ? Math.round((s.baseOk / s.baseTotal) * 100) : 0,
          gunsAlive: s.guns.filter((g) => g.alive && !g.spray && !g.trap).length,
          gunsTotal: s.guns.filter((g) => !g.spray && !g.trap).length,
          time: s.time,
          byPayload,
        });
      }
      // Исход и запись снимаем ровно в миг конца боя, а итог показываем чуть
      // позже: иначе он накрывал поле в тот же кадр, когда гасла последняя
      // клетка, и не было видно, успел ли ты её потушить.
      if (s.phase !== "playing" && !finished.current) {
        finished.current = true;
        const out = { ...settle(s), won: s.phase === "won", trace: encodeTrace(trace.current) };
        endTimer = window.setTimeout(() => setDone(out), END_PAUSE_MS);
      }
    };
    let endTimer = 0;
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(endTimer);
    };
  }, [s, startGoods]);

  /**
   * Целимся в середину клетки, а не в точку под курсором. Иначе запись боя
   * (в ней клетка) и сам бой (в нём доли клетки) считают по-разному, и
   * повтор у нападавшего расходится с тем, что видел защитник.
   */
  const aimAt = (c: { x: number; y: number } | null) =>
    c ? { x: c.x + 0.5, y: c.y + 0.5 } : null;

  const toCell = (p: Pt) => {
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
    return { x, y };
  };

  const patternName = t(`pattern.${order.pattern}` as Key).toLowerCase();
  const seconds = `${Math.floor(hud?.time ?? 0)} ${t("battle.seconds")}`;
  // За сбитых не платят. Что реально придёт — страховка и премия за отбой.
  const insurePay = insurance(
    hud?.burned ?? 0,
    hud?.goodsLost ?? 0,
    hud?.gunsLost ?? 0,
    insuranceLevel
  );
  const bountyPay = defenseBounty(order.drones, hud?.burned ?? 0);
  const payout = insurePay + bountyPay;

  return (
    // Колонка со счётом жмётся вместе с окном: на узком десктопе поле боя
    // важнее, чем ровная ширина цифр.
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(12rem,20vw,18rem)] lg:gap-4">
      <div className="relative flex min-h-0 flex-1 flex-col gap-2">
        <MapCanvas
          className="min-h-0 flex-1"
          scene={scene}
          sceneVersion={version}
          cursor="none"
          overlay={(ctx, now) => drawFrame(ctx, s, 7, hoverRef.current, now)}
          onMove={(p) => {
            hoverRef.current = toCell(p);
            setAim(s, aimAt(hoverRef.current));
          }}
          onDown={(p, button) => {
            if (button !== 0) return;
            hoverRef.current = toCell(p);
            setAim(s, aimAt(hoverRef.current));
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
            label={t("battle.hudInsurance")}
            value={`+${fmt(payout)}`}
            tone={payout ? "text-emerald-300" : undefined}
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

        {/* типы дронов: на телефоне колонки нет, легенда разворачивается по кнопке */}
        <IconButton
          label={t("panel.payloads")}
          round
          onClick={() => setHints((v) => !v)}
          className="absolute right-2 top-12 z-10 h-8 w-8 bg-neutral-900/80 lg:hidden"
        >
          ?
        </IconButton>
        {hints && (
          <div className="absolute inset-x-2 top-12 z-10 rounded-md border border-neutral-700 bg-neutral-950/95 p-3 text-xs leading-relaxed text-neutral-400 lg:hidden">
            <p className="mb-2 font-semibold text-neutral-300">{t("panel.payloads")}</p>
            <PayloadLegend t={t} counts={hud?.byPayload} />
          </div>
        )}

        {done && (
          <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto rounded-md bg-neutral-950/90 p-4 sm:p-6">
            <div className="w-full max-w-sm">
              <div
                className={`mb-1 text-2xl font-bold tracking-wide ${
                  done.won ? "text-emerald-300" : "text-red-400"
                }`}
              >
                {done.won ? t("battle.won") : t("battle.lost")}
              </div>
              <p className="mb-4 text-sm text-neutral-400">
                {t(order.competitionStage ? "battle.headerCompetition" : "battle.header", {
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
                  label={t("battle.killedByBalloons")}
                  value={String(done.result.killedByBalloons)}
                />
                <Row
                  label={t("battle.insurance")}
                  value={`+${fmt(
                    insurance(
                      done.result.burned,
                      goodsValue(depots) - goodsValue(done.depots),
                      done.result.gunsLost,
                      insuranceLevel,
                      done.result.spraysLost,
                      done.result.trapsLost,
                      done.result.rocketsLost
                    )
                  )} ${t("battle.creditsSuffix")}`}
                />
                <Row
                  label={t("battle.defenseBounty")}
                  value={`+${fmt(defenseBounty(order.drones, done.result.burned))} ${t(
                    "battle.creditsSuffix"
                  )}`}
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
                <Row label={t("battle.rocketsLost")} value={String(done.result.rocketsLost)} />
                <Row label={t("battle.spraysLost")} value={String(done.result.spraysLost)} />
                <Row label={t("battle.trapsLost")} value={String(done.result.trapsLost)} />
              </dl>
              <div className="flex justify-center px-8 pt-1">
                <Button variant="build" onClick={() => onFinish(done)}>
                  {t("battle.back")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className="hidden min-h-0 space-y-4 overflow-y-auto text-sm lg:block [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Panel title={t("panel.raid")}>
          <p className="mb-3 text-neutral-300">
            {t(order.competitionStage ? "battle.headerCompetition" : "battle.header", {
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
              label={t("battle.insurance")}
              value={`+${fmt(payout)} ${t("battle.creditsSuffix")}`}
            />
            <Row label={t("battle.fires")} value={String(hud?.fires ?? 0)} />
            <Row label={t("battle.gunsAlive")} value={`${hud?.gunsAlive ?? 0}/${hud?.gunsTotal ?? 0}`} />
            <Row label={t("battle.integrity")} value={`${hud?.integrity ?? 100}%`} />
            <Row label={t("battle.time")} value={seconds} />
          </dl>
        </Panel>

        <Panel title={t("panel.payloads")}>
          <PayloadLegend t={t} counts={hud?.byPayload} />
        </Panel>

      </aside>
    </div>
  );
}

const PAYLOAD_KEYS: Record<Payload, Key> = {
  plain: "payload.plain",
  heavy: "payload.heavy",
  jammer: "payload.jammer",
  foamer: "payload.foamer",
  demag: "payload.demag",
  stealth: "payload.stealth",
  blower: "payload.blower",
  turbo: "payload.turbo",
};

function PayloadLegend({
  t,
  counts,
}: {
  t: (key: Key, vars?: Record<string, string | number>) => string;
  counts?: Partial<Record<Payload, number>>;
}) {
  return (
    <ul className="space-y-1.5 text-xs text-neutral-300">
      {PAYLOADS.map((kind) => (
        <li key={kind} className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/40"
            style={{ background: COLORS.payload[kind] }}
            aria-hidden
          />
          <span>
            {t(PAYLOAD_KEYS[kind])}
            {counts?.[kind] ? <span className="text-neutral-500"> ({counts[kind]})</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
