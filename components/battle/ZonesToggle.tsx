"use client";

/*
 * Галочка «Зоны действия»: круги пушек, огнетушителей и ловушек. В гуще боя
 * они мешают видеть рой, поэтому их можно убрать — и в бою, и в повторе.
 * Выбор помнится: кому мешают, тому мешают всегда.
 */

import { useState } from "react";
import { useT } from "@/lib/i18n";

const KEY = "wb.battleZones";

/** Показывать ли круги — и как это поменять. Одно на бой и повтор. */
export function useZones(): [boolean, (on: boolean) => void] {
  const [zones, setZones] = useState(() => {
    try {
      return window.localStorage.getItem(KEY) !== "0";
    } catch {
      return true;
    }
  });
  const set = (on: boolean) => {
    setZones(on);
    try {
      window.localStorage.setItem(KEY, on ? "1" : "0");
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
