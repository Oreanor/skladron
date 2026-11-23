"use client";

/*
 * Галочка «Зоны действия»: круги пушек, огнетушителей, ловушек и шаров. Она
 * стоит в углу каждой карты — боя, повтора, лобби и разведки: круги где-то
 * помогают, а где-то закрывают то, на что смотришь. Бой и повтор делят
 * одну галочку, у лобби и разведки свои. Выбор помнится.
 */

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Checkbox } from "./ui";

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

/** Галочка «Зоны действия». */
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
  return <Checkbox on={on} onChange={onChange} className={className} label={t("battle.zones")} />;
}
