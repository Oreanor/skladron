"use client";

/*
 * Состязание с кнопки «+ тест»: сразу текущий номер, состав только для
 * просмотра. «Добавить» кладёт рой в свою очередь.
 */

import { useMemo, useState } from "react";
import { waveSize, type WavePlan } from "@/lib/attack";
import { buildCompetition } from "@/lib/competition";
import { Button, Modal } from "../ui";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

export default function TestRaidDialog({
  competitionAt,
  onCancel,
  onAdd,
}: {
  competitionAt: number;
  onCancel: () => void;
  onAdd: (waves: WavePlan[], droneLevel: number, stage: number) => string | null;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const plan = useMemo(() => buildCompetition(competitionAt), [competitionAt]);

  return (
    <Modal
      title={t("competition.title", { n: plan.stage })}
      subtitle={t("competition.subtitle")}
      onClose={onCancel}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="danger"
            onClick={() => setError(onAdd(plan.waves, plan.droneLevel, plan.stage))}
          >
            {t("competition.add")}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      <dl className="mb-3 space-y-1 font-mono text-sm">
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
