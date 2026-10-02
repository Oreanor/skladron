"use client";

/*
 * Галочка «Зоны действия»: круги пушек, огнетушителей, ловушек и шаров. Она
 * стоит в углу каждой карты — боя, повтора, лобби и разведки: круги где-то
 * помогают, а где-то закрывают то, на что смотришь. Бой и повтор делят
 * одну галочку, у лобби и разведки свои. Выбор помнится.
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
