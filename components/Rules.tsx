"use client";

// Правила игры. Числа берутся из прайса и подставляются в текст, чтобы
// правила не расходились с балансом после очередной правки.

import {
  CELL_COST,
  BALLOON_UNIT_COST,
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
  INCOME_CAP_SHIFTS,
  SHIFT_HOURS,
  INCOME_PER_CELL,
  INSURANCE_CELL,
  INSURANCE_PER_LEVEL,
  PRICE_PER_LEVEL,
  LOAN_HOURS,
  LOAN_MAX,
  LOAN_MIN,
  LOAN_RATE,
  REPAIR_COST,
  SALE_MULTIPLIER,
  SCRAP_REWARD,
  STARTER_SIDE,
  UPGRADE_STEP,
  fmt,
} from "@/lib/economy";

import { BALLOONS_PER_CELL, DRONES_PER_CELL } from "@/lib/base";
import { FIRE, GUN, RAID, ROCKET, SPRAY, TRAP } from "@/lib/tuning";
import { RULES } from "@/lib/i18n/rules";
import { useSettings } from "@/lib/i18n";
import { Button, Modal, SectionTitle } from "./ui";

const values: Record<string, string> = {
  credits: fmt(CREDITS_START),
  starter: String(STARTER_SIDE),
  income: String(INCOME_PER_CELL),
  shift: String(SHIFT_HOURS),
  capDays: String(Math.round((INCOME_CAP_SHIFTS * SHIFT_HOURS) / 24)),
  droneSale: String(DRONE_UNIT_COST * SALE_MULTIPLIER),
  cell: String(CELL_COST),
  repair: String(REPAIR_COST),
  gun: String(GUN_COST),
  spray: String(SPRAY_COST),
  sprayRange: String(SPRAY.range),
  rocket: String(ROCKET_COST),
  rocketRange: String(ROCKET.range),
  rocketReload: String(ROCKET.cooldown),
  trap: String(TRAP_COST),
  trapRange: String(TRAP.range),
  trapCap: String(TRAP.capacity),
  perCell: String(DRONES_PER_CELL),
  droneBox: String(DRONE_UNIT_COST * DRONES_PER_CELL),
  balloonBox: String(BALLOON_UNIT_COST * BALLOONS_PER_CELL),
  gunRange: String(GUN.range),
  reload: String(GUN.cooldown),
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
  priceStep: String(Math.round(PRICE_PER_LEVEL * 100)),
  loanMin: fmt(LOAN_MIN),
  loanMax: fmt(LOAN_MAX),
  loanRate: String(LOAN_RATE),
  loanHours: String(LOAN_HOURS),
};

const fill = (line: string) => line.replace(/\{(\w+)\}/g, (m, key) => values[key] ?? m);

export default function Rules({ onClose }: { onClose: () => void }) {
  const { locale, t } = useSettings();
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
            <ul className="list-disc space-y-1 pl-4">
              {section.lines.map((line, i) => (
                <li key={i}>{fill(line)}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
