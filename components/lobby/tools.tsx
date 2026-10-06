"use client";

/*
 * Справочники лобби: какие бывают инструменты, что они показывают на кнопке
 * и как запоминается раскладка правых панелей. Логики тут нет — только
 * описания, которыми пользуется само лобби.
 */

import type { ReactNode } from "react";
import {
  Banknote,
  ChevronsUp,
  Hammer,
  LayoutGrid,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  GUN_COST,
  INSURANCE_CELL,
  LOAN_MIN,
  LOAN_RATE,
  REPAIR_COST,
  SCRAP_REWARD,
  BALLOON_COST,
  ROCKET_COST,
  SPRAY_COST,
  TRAP_COST,
  UPGRADE_STEP,
  CELL_COST,
  type UpgradeKind,
} from "@/lib/economy";
import { DRONES_PER_CELL, type GunKind } from "@/lib/base";
import { BALLOON, ROCKET, SPRAY, TRAP } from "@/lib/tuning";
import type { Key } from "@/lib/i18n/dict";
import SpriteIcon from "../SpriteIcon";

export type Tool =
  | "area"
  | "repair"
  | "scrap"
  | "gun"
  | "rocket"
  | "spray"
  | "trap"
  | "balloon"
  | "drones";
/**
 * Инструменты, которые ставят на клетку предмет: у них общий путь — цена
 * по уровню, круг покрытия, подсветка уже стоящего, перетаскивание.
 * Списком, а не четырьмя «или» по коду: с ракетницей их стало четверо, и
 * один забытый «или» уже стоил того, что ракетница не ставилась вовсе.
 */
export const isBuildKind = (t: ToolId | null): t is GunKind =>
  t === "gun" || t === "rocket" || t === "spray" || t === "trap" || t === "balloon";

/** Кнопка «Апгрейд» карты не касается: она только открывает модалку. */
export type ToolId = Tool | "upgrade" | "insurance" | "loan";
/** Панели, которые на телефоне открываются шторкой снизу. */
export type SheetId = "attacks" | "competitions" | "blueprints" | "enemies" | "menu";
/** Панели инструментов: они всплывают модалкой и вёрстку не разрывают. */
export type ModalId = "upgrade" | "insurance" | "loan" | "telegram" | "avatar";

const ICON = "h-5 w-5";

/** Подпись и цена берутся из словаря, глиф — из lucide. */
export const TOOLS: {
  id: ToolId;
  label: Key;
  hint: Key;
  vars: Record<string, number>;
  icon: ReactNode;
  /** Цена этого инструмента — не фиксированная, а «от» или «за десяток». */
  priceKey?: Key;
  /** Какой класс он показывает уровнем. */
  levelKind?: UpgradeKind;
  /** Что считать в уголке кнопки: этого добра столько-то на складе. */
  countKind?:
    | "intact"
    | "burnt"
    | "guns"
    | "rockets"
    | "sprays"
    | "traps"
    | "drones"
    | "balloons"
    | "loan";
}[] = [
  {
    id: "area",
    label: "tool.area",
    hint: "tool.areaHint",
    vars: { cost: CELL_COST },
    icon: <LayoutGrid className={ICON} />,
    countKind: "intact",
  },
  {
    id: "repair",
    label: "tool.repair",
    hint: "tool.repairHint",
    vars: { cost: REPAIR_COST },
    icon: <Wrench className={ICON} />,
    countKind: "burnt",
  },
  {
    id: "scrap",
    label: "tool.scrap",
    hint: "tool.scrapHint",
    vars: { cost: SCRAP_REWARD },
    priceKey: "tool.priceScrap",
    icon: <Hammer className={ICON} />,
    countKind: "burnt",
  },
  // Дроны — перед пушками: это единственное нападение, всё остальное — оборона.
  {
    id: "drones",
    label: "tool.drones",
    hint: "tool.dronesHint",
    vars: { perCell: DRONES_PER_CELL },
    priceKey: "tool.priceBox",
    icon: <SpriteIcon name="drone-container" />,
    levelKind: "drones",
    countKind: "drones",
  },
  {
    id: "gun",
    label: "tool.gun",
    hint: "tool.gunHint",
    vars: { cost: GUN_COST },
    icon: <SpriteIcon name="cannon-base" />,
    levelKind: "guns",
    countKind: "guns",
  },
  {
    id: "rocket",
    label: "tool.rocket",
    hint: "tool.rocketHint",
    vars: { cost: ROCKET_COST, range: ROCKET.range, reload: ROCKET.cooldown },
    icon: <SpriteIcon name="rocket-base" />,
    levelKind: "rockets",
    countKind: "rockets",
  },
  {
    id: "spray",
    label: "tool.spray",
    hint: "tool.sprayHint",
    vars: { cost: SPRAY_COST, range: SPRAY.range },
    icon: <SpriteIcon name="fire-extinguisher" />,
    levelKind: "sprays",
    countKind: "sprays",
  },
  {
    id: "trap",
    label: "tool.trap",
    hint: "tool.trapHint",
    vars: { cost: TRAP_COST, range: TRAP.range, cap: TRAP.capacity },
    icon: <SpriteIcon name="trap" />,
    levelKind: "traps",
    countKind: "traps",
  },
  {
    id: "balloon",
    label: "tool.balloon",
    hint: "tool.balloonHint",
    vars: { cost: BALLOON_COST, range: BALLOON.range, count: BALLOON.count },
    icon: <SpriteIcon name="balloon-container" />,
    levelKind: "balloons",
    countKind: "balloons",
  },
  {
    id: "insurance",
    label: "tool.insurance",
    hint: "tool.insuranceHint",
    vars: { cost: INSURANCE_CELL },
    priceKey: "tool.priceCell",
    icon: <ShieldCheck className={ICON} />,
    levelKind: "insurance",
  },
  {
    id: "loan",
    label: "tool.loan",
    hint: "tool.loanHint",
    vars: { cost: LOAN_MIN, rate: LOAN_RATE },
    priceKey: "tool.priceFrom",
    icon: <Banknote className={ICON} />,
    countKind: "loan",
  },
  {
    id: "upgrade",
    label: "tool.upgrade",
    hint: "tool.upgradeHint",
    vars: { cost: UPGRADE_STEP },
    priceKey: "tool.priceFrom",
    icon: <ChevronsUp className={ICON} />,
  },
];

/** Имена ботов для отладочной кнопки «+ налёт»: настоящие атаки приходят с именем склада. */
export const BOT_COUNT = 4;
/** Потолок пробного налёта по ссылке: посмотреть режим, а не похоронить склад. */

/** Панели правой колонки в порядке по умолчанию. */
export const DEFAULT_PANELS = ["replays", "competitions", "blueprints", "enemies"];
export const PANELS_KEY = "wb.panels.v1";

export function readPanels(): {
  order: string[];
  hidden: Record<string, boolean>;
  tool?: Tool;
} {
  if (typeof window === "undefined") return { order: DEFAULT_PANELS, hidden: {} };
  try {
    const raw = window.localStorage.getItem(PANELS_KEY);
    if (!raw) return { order: DEFAULT_PANELS, hidden: {} };
    const saved = JSON.parse(raw) as {
      order?: string[];
      hidden?: Record<string, boolean>;
      tool?: Tool;
    };
    // новые панели дописываем в конец, исчезнувшие выкидываем
    const order = [
      ...(saved.order ?? []).filter((id) => DEFAULT_PANELS.includes(id)),
      ...DEFAULT_PANELS.filter((id) => !(saved.order ?? []).includes(id)),
    ];
    return { order, hidden: saved.hidden ?? {}, tool: saved.tool };
  } catch {
    return { order: DEFAULT_PANELS, hidden: {} };
  }
}
