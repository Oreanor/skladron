"use client";

/*
 * Кредиты и доход в шапке. По наведению, а на телефоне по нажатию — из чего
 * складывается суточный доход: аренда с целых клеток и отгрузка ящиков с
 * дронами. Цифра без расшифровки оставляла гадать, откуда она.
 */

import { useState } from "react";
import { INCOME_PER_CELL, fmt, saleValue } from "@/lib/economy";
import { droneCount } from "@/lib/base";
import { intactCells, type Player } from "@/lib/player";
import { COLORS } from "@/lib/render";
import { useT } from "@/lib/i18n";

export default function IncomeLine({ p, className = "" }: { p: Player; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const cells = intactCells(p);
  const rent = cells * INCOME_PER_CELL;
  const boxes = p.depots.length;
  const sale = saleValue(droneCount(p.depots), p.levels.drones);

  const row = (color: string, label: string, n: number, sum: number) => (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-neutral-400">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/40" style={{ background: color }} />
        {label}
      </span>
      <span className="whitespace-nowrap text-neutral-200">
        × {fmt(n)} = {fmt(sum)}
      </span>
    </div>
  );

  return (
    <div
      className={`group relative min-w-0 ${className}`}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full cursor-help truncate text-left font-mono text-sm text-emerald-300"
      >
        {t("stat.creditsLine", { credits: fmt(p.credits), income: fmt(rent + sale) })}
      </button>
      <div
        className={`absolute left-0 top-full z-30 mt-1 w-max min-w-[16rem] rounded-md border border-neutral-700 bg-neutral-950/95 p-3 font-mono text-xs shadow-lg ${
          open ? "block" : "hidden group-hover:block"
        }`}
      >
        <div className="space-y-1">
          {row(COLORS.base, t("income.areaRow"), cells, rent)}
          {boxes > 0 && row("rgb(206, 170, 116)", t("income.boxRow"), boxes, sale)}
        </div>
        <div className="mt-2 flex justify-between gap-4 border-t border-neutral-800 pt-2 text-sm font-semibold">
          <span className="text-neutral-300">{t("income.total")}</span>
          <span className="text-emerald-300">{fmt(rent + sale)}</span>
        </div>
        <p className="mt-1 text-neutral-500">{t("income.when")}</p>
      </div>
    </div>
  );
}
