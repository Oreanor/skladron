"use client";

/*
 * Планировщик налёта. Налёт — это список волн; у каждой своя форма и свой
 * состав из групп «столько-то дронов с такой-то начинкой». Один и тот же
 * планировщик стоит и в окне налёта на соседа, и в пробном налёте на себя:
 * разница только в том, что пробный ничего не стоит.
 */

import {
  EDGES,
  PATTERNS,
  PAYLOADS,
  payloadCost,
  raidTotal,
  waveSize,
  type Pattern,
  type Payload,
  type WavePlan,
} from "@/lib/attack";
import { DRONE, PAYLOAD, WAVE } from "@/lib/tuning";
import { MAX_LEVEL, fmt, levelBonus } from "@/lib/economy";
import { Plus, X } from "lucide-react";
import { Button, SectionTitle } from "./ui";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

/** Волна по умолчанию: одна группа простых дронов. */
export const newWave = (n: number, delay = 0): WavePlan => ({
  pattern: "rings",
  direction: 0,
  delay,
  groups: [{ payload: "plain", n }],
});

const selectClass =
  "min-w-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm " +
  "text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500";

const numberClass =
  "w-16 shrink-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-right " +
  "font-mono text-sm text-neutral-200 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-neutral-500";

export interface PlannerProps {
  waves: WavePlan[];
  onChange: (waves: WavePlan[]) => void;
  /** Сколько дронов лежит на складе — больше не отправить. */
  stock: number;
  /** Потолок одного налёта. */
  max: number;
  /** Во что обходится один дрон сейчас: от этого считается надбавка. */
  unitCost: number;
  /** Текущий кошелёк: недоступные начинки и итоговая доплата краснеют. */
  credits?: number;
  /** Пробный налёт на себя ничего не стоит, и надбавку показывать незачем. */
  free?: boolean;
  /**
   * Уровень дронов. У настоящего налёта он свой и не обсуждается, а у
   * пробного его задают руками: от него зависит и скорость роя, и радиус
   * подавления, так что без этого поля пробный бой не проверить на чужих
   * уровнях. Передан onDroneLevel — поле показывается.
   */
  droneLevel?: number;
  onDroneLevel?: (level: number) => void;
}

export default function RaidPlanner({
  waves,
  onChange,
  stock,
  max,
  unitCost,
  credits,
  free = false,
  droneLevel = 1,
  onDroneLevel,
}: PlannerProps) {
  const t = useT();
  const total = raidTotal(waves);
  const surcharge = free ? 0 : payloadCost(unitCost, waves);
  const canAfford = free || credits === undefined || surcharge <= credits;

  const patch = (i: number, next: Partial<WavePlan>) =>
    onChange(waves.map((w, k) => (k === i ? { ...w, ...next } : w)));

  const patchGroup = (wi: number, gi: number, n: number, payload?: Payload) =>
    patch(wi, {
      groups: waves[wi].groups.map((g, k) =>
        k === gi ? { payload: payload ?? g.payload, n } : g
      ),
    });

  return (
    <>
      {onDroneLevel && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-neutral-700 bg-neutral-950/50 px-3 py-2">
          <div className="min-w-0">
            <SectionTitle>{t("raid.droneLevel")}</SectionTitle>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
              {t("raid.droneLevelHint", {
                speed: (DRONE.speed * levelBonus(droneLevel, DRONE.perLevel)).toFixed(1),
              })}
            </p>
          </div>
          <input
            type="number"
            min={1}
            max={MAX_LEVEL}
            value={droneLevel}
            aria-label={t("raid.droneLevel")}
            onChange={(e) =>
              onDroneLevel(Math.max(1, Math.min(MAX_LEVEL, Number(e.target.value) || 1)))
            }
            className={numberClass}
          />
        </div>
      )}

      <div className="space-y-3">
        {waves.map((wave, wi) => (
          <div key={wi} className="rounded-md border border-neutral-700 bg-neutral-950/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <SectionTitle>{t("raid.wave", { n: wi + 1 })}</SectionTitle>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-neutral-500">
                  {t("raid.waveDrones", { n: waveSize(wave) })}
                </span>
                {waves.length > 1 && (
                  <button
                    type="button"
                    aria-label={t("raid.removeWave")}
                    title={t("raid.removeWave")}
                    onClick={() => onChange(waves.filter((_, k) => k !== wi))}
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <label className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="shrink-0">{t("raid.waveDelay")}</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  step={1}
                  value={wave.delay ?? 0}
                  aria-label={t("raid.waveDelay")}
                  title={t("raid.waveDelayHint")}
                  onChange={(e) =>
                    patch(wi, {
                      delay: Math.max(0, Math.min(300, Number(e.target.value) || 0)),
                    })
                  }
                  className={numberClass}
                />
                <span className="shrink-0 text-neutral-500">{t("battle.seconds")}</span>
              </label>
              <select
                value={wave.pattern}
                aria-label={t("raid.pattern")}
                onChange={(e) => patch(wi, { pattern: e.target.value as Pattern })}
                className={`${selectClass} flex-1`}
              >
                {PATTERNS.map((id) => (
                  <option key={id} value={id}>
                    {t(`pattern.${id}` as Key)} — {t(`pattern.${id}Hint` as Key)}
                  </option>
                ))}
              </select>
              {/* сторона важна только тем формам, что заходят от края */}
              {(wave.pattern === "swarm" || wave.pattern === "lines") && (
                <select
                  value={wave.direction}
                  aria-label={t("raid.from")}
                  onChange={(e) => patch(wi, { direction: Number(e.target.value) })}
                  className={selectClass}
                >
                  {EDGES.map((i) => (
                    <option key={i} value={i}>
                      {t(`edge.${i}` as Key)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              {wave.groups.map((group, gi) => {
                const currentGroupCost =
                  Math.floor(unitCost * PAYLOAD[group.payload].cost) * group.n;
                const availableForGroup =
                  credits === undefined ? Infinity : credits - (surcharge - currentGroupCost);
                return (
                  <div key={gi} className="flex items-center gap-2">
                    <select
                      value={group.payload}
                      aria-label={t("raid.payload")}
                      onChange={(e) => patchGroup(wi, gi, group.n, e.target.value as Payload)}
                      className={`${selectClass} min-w-0 flex-1`}
                      style={!canAfford ? { color: "#f87171" } : undefined}
                    >
                      {PAYLOADS.map((p) => {
                        const extra = Math.floor(unitCost * PAYLOAD[p].cost) * group.n;
                        const unavailable = !free && extra > availableForGroup;
                        return (
                          <option
                            key={p}
                            value={p}
                            style={unavailable ? { color: "#f87171" } : undefined}
                          >
                            {t(`payload.${p}` as Key)}
                            {!free && extra > 0 &&
                              ` +${fmt(extra)} ${t("battle.creditsSuffix")}`}
                          </option>
                        );
                      })}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={max}
                      value={group.n}
                      aria-label={t("raid.groupSize")}
                      onChange={(e) =>
                        patchGroup(wi, gi, Math.max(0, Math.min(max, Number(e.target.value) || 0)))
                      }
                      className={numberClass}
                    />
                    {/* последнюю группу не убираем: пустая волна ни о чём.
                        Не нужна волна целиком — у неё свой крестик. */}
                    {wave.groups.length > 1 && (
                      <button
                        type="button"
                        aria-label={t("raid.removeGroup")}
                        title={t("raid.removeGroup")}
                        onClick={() =>
                          patch(wi, { groups: wave.groups.filter((_, k) => k !== gi) })
                        }
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              <p className="text-[11px] leading-snug text-neutral-500">
                {t(`payload.${wave.groups[0]?.payload ?? "plain"}Hint` as Key)}
              </p>
            </div>

            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={() =>
                patch(wi, { groups: [...wave.groups, { payload: "plain", n: 10 }] })
              }
            >
              <Plus className="h-4 w-4" />
              {t("raid.addGroup")}
            </Button>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        block
        className="mt-3"
        onClick={() => {
          const lastDelay = waves.reduce((m, w) => Math.max(m, w.delay ?? 0), 0);
          onChange([
            ...waves,
            newWave(Math.max(1, Math.min(20, max - total)), lastDelay + WAVE.betweenWaves),
          ]);
        }}
      >
        <Plus className="h-4 w-4" />
        {t("raid.addWave")}
      </Button>

      <dl className="mt-4 space-y-1 font-mono text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-neutral-400">{t("raid.total")}</dt>
          <dd className={total > Math.min(stock, max) ? "text-red-400" : "text-neutral-100"}>
            {total} / {Math.min(stock, max)}
          </dd>
        </div>
        {!free && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-neutral-400">{t("raid.surcharge")}</dt>
            <dd className={canAfford ? "text-neutral-100" : "text-red-400"}>
              {fmt(surcharge)} {t("battle.creditsSuffix")}
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}
