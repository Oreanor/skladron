"use client";

// Правила игры. Числа берутся из прайса и подставляются в текст, чтобы
// правила не расходились с балансом после очередной правки.

import {
  CELL_COST,
  CELL_LOOT_REWARD,
  CREDITS_START,
  DRONE_UNIT_COST,
  GUN_COST,
  GUN_REFUND,
  INCOME_CAP_DAYS,
  INCOME_PER_CELL,
  INSURANCE_CELL,
  INSURANCE_PER_LEVEL,
  REPAIR_COST,
  SALE_MULTIPLIER,
  SCOUT_UNIT_COST,
  STARTER_SIDE,
  UPGRADE_STEP,
  fmt,
} from "@/lib/economy";
import { MAX_RAID } from "@/lib/attack";
import { DRONES_PER_CELL } from "@/lib/base";
import { FIRE_SPREAD, GUN_COOLDOWN, GUN_RANGE } from "@/lib/engine";
import { RULES } from "@/lib/i18n/rules";
import { useSettings } from "@/lib/i18n";
import { Modal, SectionTitle } from "./ui";

const values: Record<string, string> = {
  credits: fmt(CREDITS_START),
  starter: String(STARTER_SIDE),
  income: String(INCOME_PER_CELL),
  capDays: String(INCOME_CAP_DAYS),
  droneSale: String(DRONE_UNIT_COST * SALE_MULTIPLIER),
  scoutSale: String(SCOUT_UNIT_COST * SALE_MULTIPLIER),
  cell: String(CELL_COST),
  repair: String(REPAIR_COST),
  gun: String(GUN_COST),
  refund: String(GUN_REFUND),
  perCell: String(DRONES_PER_CELL),
  droneBox: String(DRONE_UNIT_COST * DRONES_PER_CELL),
  scoutBox: String(SCOUT_UNIT_COST * DRONES_PER_CELL),
  gunRange: String(GUN_RANGE),
  reload: String(GUN_COOLDOWN),
  spread: String(FIRE_SPREAD),
  maxRaid: String(MAX_RAID),
  loot: String(CELL_LOOT_REWARD),
  insureCell: String(INSURANCE_CELL),
  insureShare: String(Math.round(INSURANCE_PER_LEVEL * 100)),
  upgrade: fmt(UPGRADE_STEP),
};

const fill = (line: string) => line.replace(/\{(\w+)\}/g, (m, key) => values[key] ?? m);

export default function Rules({ onClose }: { onClose: () => void }) {
  const { locale, t } = useSettings();
  const sections = RULES[locale] ?? RULES.en;

  return (
    <Modal title={t("menu.rules")} onClose={onClose}>
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
