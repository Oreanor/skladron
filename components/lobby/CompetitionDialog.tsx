"use client";

/*
 * Состязание с кнопки «+ состязание»: лента открытых номеров с лучшим счётом
 * под каждым — пройденные можно переигрывать. Лента в одну строку и
 * листается вбок, сколько бы номеров ни открылось. По умолчанию выбран
 * старший открытый. Состав только для просмотра, «Добавить» ставит рой в очередь.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { waveSize } from "@/lib/attack";
import { buildCompetition, type CompetitionBest } from "@/lib/competition";
import { Button, Modal } from "../ui";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

export default function CompetitionDialog({
  competitionAt,
  best,
  onCancel,
  onAdd,
}: {
  competitionAt: number;
  best: Record<number, CompetitionBest>;
  onCancel: () => void;
  onAdd: (stage: number) => Promise<string | null>;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(competitionAt);
  const plan = useMemo(() => buildCompetition(stage), [stage]);
  const mine = best[stage];
  const strip = useRef<HTMLUListElement>(null);

  // При открытии лента встаёт так, чтобы выбранный номер был посередине.
  // scrollIntoView не годится: он крутит заодно и окно, и страницу под ним.
  useEffect(() => {
    const list = strip.current;
    const on = list?.querySelector<HTMLElement>("[data-on]");
    if (!list || !on) return;
    list.scrollLeft = on.offsetLeft - (list.clientWidth - on.offsetWidth) / 2;
  }, []);

  // Колесо мыши листает ленту вбок: вертикальной прокрутки у неё нет, а
  // тянуть полосу внизу на десктопе неудобно.
  useEffect(() => {
    const list = strip.current;
    if (!list) return;
    const onWheel = (e: WheelEvent) => {
      if (list.scrollWidth <= list.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      list.scrollLeft += e.deltaY;
    };
    list.addEventListener("wheel", onWheel, { passive: false });
    return () => list.removeEventListener("wheel", onWheel);
  }, []);

  const add = async () => {
    setBusy(true);
    setError(await onAdd(stage));
    setBusy(false);
  };

  return (
    <Modal
      title={t("competition.title", { n: plan.stage })}
      onClose={onCancel}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="danger" disabled={busy} onClick={() => void add()}>
            {t("competition.add")}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      <ul
        ref={strip}
        className="relative mb-3 flex snap-x gap-1 overflow-x-auto overscroll-x-contain pb-1.5"
      >
        {Array.from({ length: competitionAt }, (_, i) => i + 1).map((n) => {
          const b = best[n];
          const on = n === stage;
          return (
            <li key={n} className="shrink-0 snap-start" data-on={on || undefined}>
              <button
                type="button"
                onClick={() => setStage(n)}
                className={`flex w-11 flex-col items-center rounded border px-1 py-1 font-mono text-xs ${
                  on
                    ? "border-amber-400 bg-amber-400/15 text-amber-200"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                <span>{n}</span>
                <span className={`text-[10px] ${b ? "text-emerald-300" : "text-neutral-600"}`}>
                  {b ? b.score : "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <dl className="mb-3 space-y-1 font-mono text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">{t("competition.best")}</dt>
          <dd className="text-neutral-100">
            {mine ? mine.score : t("competition.noBest")}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">{t("competition.drones")}</dt>
          <dd className="text-neutral-100">{plan.drones}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">{t("competition.droneLevel")}</dt>
          <dd className="text-neutral-100">{plan.droneLevel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">{t("competition.waves")}</dt>
          <dd className="text-neutral-100">{plan.waves.length}</dd>
        </div>
      </dl>
      <ul className="space-y-2 rounded-md border border-neutral-700 bg-neutral-950/50 p-3 text-sm">
        {plan.waves.map((wave, i) => (
          <li key={i} className="text-neutral-300">
            <span className="font-medium text-neutral-100">
              {t("competition.wave", { n: i + 1 })}
            </span>
            <span className="text-neutral-500"> · </span>
            {t(`pattern.${wave.pattern}` as Key)}
            <span className="text-neutral-500"> · </span>
            {t("raid.waveDrones", { n: waveSize(wave) })}
            <div className="mt-0.5 text-xs text-neutral-500">
              {wave.groups
                .map((g) => `${t(`payload.${g.payload}` as Key)} ×${g.n}`)
                .join(", ")}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}
