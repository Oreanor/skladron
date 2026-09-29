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
  CircleDotDashed,
  Crosshair,
  Hammer,
  LayoutGrid,
  Magnet,
  Rocket,
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
  ROCKET_COST,
  SPRAY_COST,
  TRAP_COST,
  UPGRADE_STEP,
  CELL_COST,
  type UpgradeKind,
} from "@/lib/economy";
import { DRONES_PER_CELL } from "@/lib/base";
import { ROCKET, SPRAY, TRAP } from "@/lib/tuning";
import type { AttackOrder } from "@/lib/attack";
import type { Player } from "@/lib/player";
import type { Key } from "@/lib/i18n/dict";
import { IconDrone } from "../ui";

export type Tool =
  | "area"
  | "repair"
  | "scrap"
  | "gun"
  | "rocket"
  | "spray"
  | "trap"
  | "drones";
/** Кнопка «Апгрейд» карты не касается: она только открывает модалку. */
export type ToolId = Tool | "upgrade" | "insurance" | "loan";
/** Панели, которые на телефоне открываются шторкой снизу. */
export type SheetId = "attacks" | "enemies" | "menu";
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
  {
    id: "gun",
    label: "tool.gun",
    hint: "tool.gunHint",
    vars: { cost: GUN_COST },
    icon: <Crosshair className={ICON} />,
    levelKind: "guns",
    countKind: "guns",
  },
  {
    id: "rocket",
    label: "tool.rocket",
    hint: "tool.rocketHint",
    vars: { cost: ROCKET_COST, range: ROCKET.range, reload: ROCKET.cooldown },
    icon: <Rocket className={ICON} />,
    levelKind: "rockets",
    countKind: "rockets",
  },
  {
    id: "drones",
    label: "tool.drones",
    hint: "tool.dronesHint",
    vars: { perCell: DRONES_PER_CELL },
    priceKey: "tool.priceBox",
    icon: <IconDrone />,
    levelKind: "drones",
    countKind: "drones",
  },
  {
    id: "spray",
    label: "tool.spray",
    hint: "tool.sprayHint",
    vars: { cost: SPRAY_COST, range: SPRAY.range },
    icon: <CircleDotDashed className={ICON} />,
    levelKind: "sprays",
    countKind: "sprays",
  },
  {
    id: "trap",
    label: "tool.trap",
    hint: "tool.trapHint",
    vars: { cost: TRAP_COST, range: TRAP.range, cap: TRAP.capacity },
    icon: <Magnet className={ICON} />,
    levelKind: "traps",
    countKind: "traps",
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
export const DEFAULT_PANELS = ["replays", "enemies", "stats"];
export const PANELS_KEY = "wb.panels.v1";

/**
 * Соперник, приславший этот налёт. Ищем по почте, а не по имени склада:
 * имена не уникальны и меняются переименованием, а почта — то же самое,
 * по чему соперника и заводят. У ботов почты нет, для них имя и остаётся
 * единственной приметой.
 */
export function findFoe(p: Player, order: AttackOrder) {
  const mail = order.fromEmail?.toLowerCase();
  if (mail) return p.enemies.find((e) => e.email.toLowerCase() === mail);
  return p.enemies.find((e) => e.name === order.from);
}

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
    const tool =
      (saved.tool as string | undefined) === "scouts" ? "drones" : saved.tool;
    return { order, hidden: saved.hidden ?? {}, tool };
  } catch {
    return { order: DEFAULT_PANELS, hidden: {} };
  }
}
