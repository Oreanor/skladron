// Смена — отгрузка и доход — приходит в полночь по Лондону. Раньше её
// получали только при загрузке страницы: вкладка, открытая с вечера, жила
// со вчерашним складом, пока её не обновишь руками. Ночной крон отгружает
// лишь тех, у кого подключён Telegram, а у них вкладка показывала ящики,
// которых на сервере уже нет. Теперь лобби само замечает новые сутки.

import { useEffect, useRef, type RefObject } from "react";
import { SHIFT_HOURS, fmt, saleValue, shiftsSince } from "@/lib/economy";
import type { Translate } from "@/lib/i18n";
import type { Player } from "@/lib/player";
import type { Income } from "@/lib/repo";
import type { LobbyCore } from "./useBaseSync";

/** Как часто сверяться с часами: смена не срочная, полминуты хватает. */
const CHECK_MS = 30_000;

/** «Смена: +N кр за 24 ч, продано M дронов» — то же, что при входе в игру. */
export function incomeMessage(t: Translate, income: Income, droneLevel: number) {
  const sold = income.sold;
  return (
    t("income.collected", { hours: income.days * SHIFT_HOURS, credits: fmt(income.credits) }) +
    (sold && sold.drones
      ? t("income.sold", { drones: sold.drones, dronesValue: fmt(saleValue(sold.drones, droneLevel)) })
      : "")
  );
}

export function useShift(core: LobbyCore, player: RefObject<Player | null>, active: boolean) {
  const coreRef = useRef(core);
  coreRef.current = core;
  const busy = useRef(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;

    const check = async () => {
      const p = player.current;
      if (!p || busy.current || shiftsSince(p.lastIncomeAt, Date.now()) <= 0) return;
      const { repo, t, say, flushPersist, redraw } = coreRef.current;
      busy.current = true;
      try {
        // Правки, что ещё ждут записи, — сначала на сервер: склад сейчас
        // перечитаем, и они бы пропали.
        await flushPersist();
        const income = await repo.collectShift(p);
        if (!alive) return;
        if (income.credits > 0) say(incomeMessage(t, income, p.levels.drones));
        redraw();
      } catch {
        // не достучались — попробуем на следующей проверке
      } finally {
        busy.current = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, player]);
}
