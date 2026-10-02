"use client";

/*
 * Галочка «Зоны действия»: круги пушек, огнетушителей и ловушек. В гуще боя
 * они мешают видеть рой, поэтому их можно убрать — и в бою, и в повторе. В
 * лобби своя галочка: там круги по умолчанию видны только у того, что
 * сейчас ставят, а с ней — у всего склада. Выбор помнится.
 */

import { useState } from "react";
import { useT } from "@/lib/i18n";

const KEY = "wb.battleZones";

/** Показывать ли круги — и как это поменять. Бой и повтор делят одну галочку, у лобби своя. */
export function useZones(key = KEY, fallback = true): [boolean, (on: boolean) => void] {
  const [zones, setZones] = useState(() => {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v !== "0";
    } catch {
      return fallback;
    }
  });
  const set = (on: boolean) => {
    setZones(on);
    try {
      window.localStorage.setItem(key, on ? "1" : "0");
    } catch {
      // приватный режим — просто не запомним
    }
  };
  return [zones, set];
}

export default function ZonesToggle({
  on,
  onChange,
  className = "",
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <label
      className={`flex cursor-pointer select-none items-center gap-2 text-xs text-neutral-300 ${className}`}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-emerald-400"
      />
      {t("battle.zones")}
    </label>
  );
}
