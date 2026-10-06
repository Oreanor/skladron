"use client";

/*
 * Кредиты и доход в шапке. По наведению, а на телефоне по нажатию — из чего
 * складывается суточный доход: отгрузка ящиков с дронами. Цифра без
 * расшифровки оставляла гадать, откуда она.
 */

import { useState } from "react";
import { fmt, saleValue } from "@/lib/economy";
import { droneCount } from "@/lib/base";
import type { Player } from "@/lib/player";
import { useT } from "@/lib/i18n";
import { COLORS } from "@/lib/render";

export default function IncomeLine({
  p,
  className = "",
  stacked = false,
}: {
  p: Player;
  className?: string;
  /** В две строки: наличные крупно, доход под ними мельче — для телефона, где шапка узкая. */
  stacked?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
        {stacked ? (
          <>
            <span className="block truncate leading-tight">{fmt(p.credits)}</span>
            <span className="block truncate text-[11px] leading-tight text-emerald-300/70">
              {t("stat.incomeLine", { income: fmt(sale) })}
            </span>
          </>
        ) : (
          t("stat.creditsLine", { credits: fmt(p.credits), income: fmt(sale) })
        )}
      </button>
      <div
        className={`absolute left-0 top-full z-30 mt-1 w-max min-w-[16rem] rounded-md border border-neutral-700 bg-neutral-950/95 p-3 font-mono text-xs shadow-lg ${
          open ? "block" : "hidden group-hover:block"
        }`}
      >
        {row(COLORS.depot, t("income.boxRow"), boxes, sale)}
      </div>
    </div>
  );
}
