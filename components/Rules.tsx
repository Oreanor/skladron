"use client";

// Правила игры. Числа берутся из прайса и подставляются в текст, чтобы
// правила не расходились с балансом после очередной правки.

import {
  CELL_COST,
  BALLOON_COST,
  CELL_LOOT_REWARD,
  attackLoot,
  CREDITS_START,
  DEFENSE_BURN_PENALTY,
  DEFENSE_CLEAN_PER_DRONE,
  DEFENSE_DIRTY_PER_DRONE,
  DRONE_UNIT_COST,
  GUN_COST,
  ROCKET_COST,
  SPRAY_COST,
  TRAP_COST,
  INSURANCE_CELL,
  INSURANCE_PER_LEVEL,
  DRONE_TOP,
  LOAN_HOURS,
  LOAN_MAX,
  LOAN_MIN,
  LOAN_RATE,
  REPAIR_COST,
  saleValue,
  SCRAP_REWARD,
  STARTER_SIDE,
  UPGRADE_STEP,
  fmt,
} from "@/lib/economy";

import { DRONES_PER_CELL } from "@/lib/base";
import { FIRE, GUN, RAID, ROCKET, SHOOTER, TRAP } from "@/lib/tuning";
import { RULES } from "@/lib/i18n/rules";
import { useSettings } from "@/lib/i18n";
import { Button, Modal, SectionTitle } from "./ui";
import type { ReactNode } from "react";
import { BALLOON_TOP, GUN_TOP, MAX_LEVEL, MIN_BASE_CELLS, ROCKET_TOP, SPRAY_TOP, TRAP_TOP, dronePrice } from "@/lib/economy";
import {
  balloonCount,
  balloonRange,
  gunRange,
  gunTempo,
  rocketRange,
  rocketTempo,
  sprayRange,
  trapRange,
} from "@/lib/engine";
import { PAYLOAD } from "@/lib/tuning";
import { PAYLOADS } from "@/lib/attack";
import { PAYLOAD_FROM } from "@/lib/competition";
import type { Key } from "@/lib/i18n/dict";
import PieceIcon, { type PieceKind } from "./PieceIcon";

const values: Record<string, string> = {
  credits: fmt(CREDITS_START),
  starter: String(STARTER_SIDE),
  droneBoxSale: String(saleValue(DRONES_PER_CELL, 1)),
  droneBoxSaleTop: String(saleValue(DRONES_PER_CELL, MAX_LEVEL)),
  minCells: String(MIN_BASE_CELLS),
  cell: String(CELL_COST),
  repair: String(REPAIR_COST),
  gun: String(GUN_COST),
  spray: String(SPRAY_COST),
  rocket: String(ROCKET_COST),
  trap: String(TRAP_COST),
  trapCap: String(TRAP.capacity),
  perCell: String(DRONES_PER_CELL),
  droneBox: String(DRONE_UNIT_COST * DRONES_PER_CELL),
  balloon: String(BALLOON_COST),
  shooterRange: String(SHOOTER.range),
  spread: String(FIRE.spread),
  maxRaid: String(RAID.max),
  loot: String(CELL_LOOT_REWARD),
  // Потолок премии: столько дают за клетку, когда сожжён весь склад.
  lootMax: String(attackLoot(1, 1)),
  defendClean: String(DEFENSE_CLEAN_PER_DRONE),
  defendDirty: String(DEFENSE_DIRTY_PER_DRONE),
  defendBurn: String(DEFENSE_BURN_PENALTY),
  insureCell: String(INSURANCE_CELL),
  insureShare: String(Math.round(INSURANCE_PER_LEVEL * 100)),
  upgrade: fmt(UPGRADE_STEP),
  scrap: String(SCRAP_REWARD),
  droneBoxTop: String(DRONE_TOP * DRONES_PER_CELL),
  loanMin: fmt(LOAN_MIN),
  loanMax: fmt(LOAN_MAX),
  loanRate: String(LOAN_RATE),
  loanHours: String(LOAN_HOURS),
};

const fill = (line: string, extra: Record<string, string> = {}) =>
  line.replace(/\{(\w+)\}/g, (m, key) => extra[key] ?? values[key] ?? m);

/**
 * Строка правил: числа из прайса, а **так** — жирным (начало шага). У шагов
 * после жирного заголовка — перенос: заголовок стоит отдельной строкой.
 */
const rich = (line: string, extra: Record<string, string>, step = false): ReactNode =>
  fill(line, extra)
    .split(/\*\*(.+?)\*\*/)
    .map((part, i) =>
      i % 2 ? (
        <span key={i}>
          <b className="text-neutral-100">{part}</b>
          {step && <br />}
        </span>
      ) : step && i > 0 ? (
        part.replace(/^\s+/, "")
      ) : (
        part
      )
    );

/** Установки: цена и радиус на нулевом и десятом уровне. */
const INSTALLS: { kind: PieceKind; label: Key; base: number; top: number; range: (lv: number) => number }[] = [
  { kind: "gun", label: "tool.gun", base: GUN_COST, top: GUN_TOP, range: (lv) => gunRange({ gunLevel: lv }) },
  { kind: "rocket", label: "tool.rocket", base: ROCKET_COST, top: ROCKET_TOP, range: (lv) => rocketRange({ rocketLevel: lv }) },
  { kind: "spray", label: "tool.spray", base: SPRAY_COST, top: SPRAY_TOP, range: (lv) => sprayRange({ sprayLevel: lv }) },
  { kind: "trap", label: "tool.trap", base: TRAP_COST, top: TRAP_TOP, range: (lv) => trapRange({ trapLevel: lv }) },
  { kind: "balloon", label: "tool.balloon", base: BALLOON_COST, top: BALLOON_TOP, range: (lv) => balloonRange({ balloonLevel: lv }) },
];
const one = (v: number) => (Math.round(v * 10) / 10).toString();
const TH = "border-b border-neutral-700 px-2 py-1 text-left font-normal text-neutral-500";
const TD = "border-b border-neutral-800 px-2 py-1";

export default function Rules({ onClose }: { onClose: () => void }) {
  const { locale, t } = useSettings();
  // Что растёт с прокачкой, пишем от нулевого уровня до десятого: одно число
  // «радиус 6» читалось как радиус навсегда.
  const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString(locale);
  const grow = (at: (lv: number) => number) =>
    t("rules.grows", { a: num(at(1)), b: num(at(MAX_LEVEL)) });
  const leveled: Record<string, string> = {
    gunRange: grow((lv) => gunRange({ gunLevel: lv })),
    reload: grow((lv) => GUN.cooldown / gunTempo({ gunLevel: lv })),
    rocketRange: grow((lv) => rocketRange({ rocketLevel: lv })),
    rocketReload: grow((lv) => ROCKET.cooldown / rocketTempo({ rocketLevel: lv })),
    sprayRange: grow((lv) => sprayRange({ sprayLevel: lv })),
    trapRange: grow((lv) => trapRange({ trapLevel: lv })),
    balloonRange: grow((lv) => balloonRange({ balloonLevel: lv })),
    balloonCount: grow((lv) => balloonCount(lv)),
  };
  const sections = RULES[locale] ?? RULES.en;

  return (
    <Modal
      title={t("menu.rules")}
      wide
      onClose={onClose}
      footer={
        <Button variant="build" onClick={onClose}>
          {t("common.ok")}
        </Button>
      }
    >
      <div className="space-y-4 text-sm leading-relaxed text-neutral-300">
        {sections.map((section) => (
          <section key={section.title}>
            <div className="mb-1">
              <SectionTitle>{section.title}</SectionTitle>
            </div>
            {section.steps ? (
              <ol className="list-decimal space-y-2 pl-5">
                {section.lines.map((line, i) => (
                  <li key={i}>{rich(line, leveled, true)}</li>
                ))}
              </ol>
            ) : (
              <ul className="list-disc space-y-1 pl-4">
                {section.lines.map((line, i) => (
                  <li key={i}>{rich(line, leveled)}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* справочные таблички: числа прямо из прайса и движка */}
        <section>
          <div className="mb-1">
            <SectionTitle>{t("rules.tableInstalls")}</SectionTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr>
                  <th className={TH} />
                  <th className={TH}>{t("rules.colPrice")}</th>
                  <th className={TH}>{t("rules.colRadius")}</th>
                </tr>
              </thead>
              <tbody>
                {INSTALLS.map((row) => (
                  <tr key={row.label}>
                    <td className={`${TD} text-neutral-200`}>
                      <span className="flex items-center gap-2">
                        <PieceIcon kind={row.kind} />
                        {t(row.label)}
                      </span>
                    </td>
                    <td className={TD}>
                      {row.base} → {row.top}
                    </td>
                    <td className={TD}>
                      {one(row.range(1))} → {one(row.range(MAX_LEVEL))}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className={`${TD} text-neutral-200`}>
                      <span className="flex items-center gap-2">
                        <PieceIcon kind="depot" />
                        {t("income.boxRow")}
                      </span>
                    </td>
                  <td className={TD}>
                    {dronePrice(1) * DRONES_PER_CELL} → {dronePrice(MAX_LEVEL) * DRONES_PER_CELL}
                  </td>
                  <td className={TD}>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="mb-1">
            <SectionTitle>{t("rules.tablePayloads")}</SectionTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr>
                  <th className={TH} />
                  <th className={TH}>{t("rules.colSurcharge")}</th>
                  <th className={TH}>{t("rules.colSpeed")}</th>
                  <th className={TH}>{t("rules.colFrom")}</th>
                </tr>
              </thead>
              <tbody>
                {PAYLOADS.map((p) => (
                  <tr key={p}>
                    <td className={`${TD} text-neutral-200`}>
                      <span className="flex items-center gap-2">
                        <PieceIcon payload={p} />
                        {t(`payload.${p}` as Key)}
                      </span>
                    </td>
                    <td className={TD}>+{Math.round(PAYLOAD[p].cost * 100)}%</td>
                    <td className={TD}>×{PAYLOAD[p].speed}</td>
                    <td className={TD}>{PAYLOAD_FROM.find(([q]) => q === p)?.[1] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}
