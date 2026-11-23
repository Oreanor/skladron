"use client";

/*
 * Ряд инструментов стройки. На десктопе — строка во всю ширину: колонок
 * ровно столько, сколько инструментов, и каждая тянется на равную долю.
 * Число берём из самого списка — добавится инструмент, ряд пересчитается
 * сам, а классом это не задать: Tailwind собирает их чтением исходника и
 * вычисленного имени не найдёт. На телефоне ряд уезжает под карту, под
 * большой палец: четыре в ряд и не шире 384 точек, чтобы кнопки легли
 * ровными рядами.
 */

import type { CSSProperties } from "react";
import type { Levels } from "@/lib/player";
import { useT } from "@/lib/i18n";
import { ToolButton } from "../ui";
import { TOOLS, type ToolId } from "./tools";
import { toolHint, toolPrice, toolVars } from "./toolNumbers";

/** Что показывать в уголке кнопки: сколько этого добра на складе. */
export type ToolCounters = Partial<Record<NonNullable<(typeof TOOLS)[number]["countKind"]>, number>>;

export default function ToolRow({
  levels,
  counters,
  tool,
  founded,
  onPick,
}: {
  levels: Levels;
  counters: ToolCounters;
  tool: ToolId;
  /** До основания склада доступна только рамка. */
  founded: boolean;
  onPick: (id: ToolId) => void;
}) {
  const t = useT();
  return (
    <div
      style={{ "--tools": TOOLS.length } as CSSProperties}
      className="order-3 mx-auto grid w-full max-w-96 shrink-0 grid-cols-4 gap-1.5 lg:order-2 lg:mx-0 lg:max-w-none lg:gap-2 lg:[grid-template-columns:repeat(var(--tools),minmax(0,1fr))]"
    >
      {TOOLS.map((item) => (
        <ToolButton
          key={item.id}
          icon={item.icon}
          label={t(item.label)}
          price={t(item.priceKey ?? "tool.price", { ...item.vars, cost: toolPrice(levels, item) })}
          hint={t(toolHint(levels, item), toolVars(levels, item))}
          level={item.levelKind ? levels[item.levelKind] : undefined}
          count={item.countKind ? counters[item.countKind] : undefined}
          active={tool === item.id}
          disabled={!founded && item.id !== "area"}
          onClick={() => onPick(item.id)}
        />
      ))}
    </div>
  );
}
