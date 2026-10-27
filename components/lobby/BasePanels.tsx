"use client";

// Склад до основания и после краха: два экрана, где вместо карты с
// инструментами — одна понятная кнопка.

import { CELL_COST, MIN_BASE_CELLS, STARTER_SIDE } from "@/lib/economy";
import { useT } from "@/lib/i18n";
import { Button } from "../ui";

/** Склад сгорел дотла: начать с нового. */
export function DoomedScreen({ onRestart }: { onRestart: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto max-w-md rounded-md border border-red-900/60 bg-neutral-900/70 p-6 text-center sm:p-8">
      <h2 className="mb-2 text-2xl font-bold text-red-400">{t("doomed.title")}</h2>
      <p className="mb-6 text-sm text-neutral-400">{t("doomed.text")}</p>
      <Button variant="build" size="lg" onClick={onRestart}>
        {t("doomed.restart")}
      </Button>
    </div>
  );
}

/** Склад ещё не основан: нарисуй площадь и дай имя. */
export function FoundPanel({ intact, onFound }: { intact: number; onFound: () => void }) {
  const t = useT();
  return (
    <>
      <p className="mb-3 text-neutral-300">
        {t("base.starter", { side: STARTER_SIDE, cost: CELL_COST })}
      </p>
      <p className="mb-3 text-neutral-300">{t("base.drawHint")}</p>
      <div className="mb-3 flex items-center justify-between font-mono">
        <span className="text-neutral-400">{t("base.area")}</span>
        <span className={intact >= MIN_BASE_CELLS ? "text-emerald-300" : "text-neutral-100"}>
          {intact}/{MIN_BASE_CELLS}
        </span>
      </div>
      <Button variant="build" block onClick={onFound} disabled={intact < MIN_BASE_CELLS}>
        {t("base.found")}
      </Button>
    </>
  );
}
