"use client";

/* Чем кончился наш налёт: сводка и кнопка посмотреть запись боя. */

import type { AttackReport } from "@/lib/attack";
import { fmt } from "@/lib/economy";
import { Button, Modal, Row } from "../ui";
import { useT } from "@/lib/i18n";

export default function AttackReportDialog({
  report,
  onWatch,
  onClose,
}: {
  report: AttackReport;
  /** Есть запись боя — можно посмотреть, как всё было. */
  onWatch?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const result = report.result;
  return (
    <Modal
      title={
        report.destroyed
          ? t("report.destroyed", { target: report.target })
          : t("report.title", { target: report.target })
      }
      subtitle={t("report.subtitle")}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {onWatch && (
            <Button variant="build" className="flex-1" onClick={onWatch}>
              {t("replay.watch")}
            </Button>
          )}
          <Button variant="neutral" className={onWatch ? "" : "flex-1"} onClick={onClose}>
            {t("common.ok")}
          </Button>
        </div>
      }
    >
      <dl className="mb-4 space-y-1 font-mono text-sm">
        <Row label={t("battle.sent")} value={String(result.dronesSent)} />
        <Row label={t("battle.killedByGuns")} value={String(result.killedByGuns)} />
        <Row label={t("battle.killedByMg")} value={String(result.killedByMg)} />
        <Row label={t("battle.leaked")} value={String(result.leaked)} />
        <Row label={t("battle.burned")} value={String(result.burned)} />
        <Row label={t("battle.dronesLost")} value={String(result.dronesLost)} />
        <Row label={t("battle.gunsLost")} value={String(result.gunsLost)} />
        <Row
          label={t("report.leakReward")}
          value={`+${fmt(report.loot)} ${t("battle.creditsSuffix")}`}
        />
      </dl>
    </Modal>
  );
}
