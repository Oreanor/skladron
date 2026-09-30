"use client";

/*
 * Состязание с кнопки «+ состязание»: сетка открытых номеров с лучшим счётом
 * под каждым — пройденные можно переигрывать. По умолчанию выбран старший
 * открытый. Состав только для просмотра, «Добавить» ставит рой в очередь.
 */

import { useMemo, useState } from "react";
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
      <ul className="mb-3 grid max-h-40 grid-cols-5 gap-1 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-8">
        {Array.from({ length: competitionAt }, (_, i) => i + 1).map((n) => {
          const b = best[n];
          const on = n === stage;
          return (
            <li key={n}>
              <button
                type="button"
                onClick={() => setStage(n)}
                className={`flex w-full flex-col items-center rounded border px-1 py-1 font-mono text-xs ${
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
