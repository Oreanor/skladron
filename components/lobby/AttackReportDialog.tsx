"use client";

/* Чем кончился наш налёт: сводка и кнопка посмотреть запись боя. */

import { useState } from "react";
import type { AttackReport } from "@/lib/attack";
import { postRaidComment, RAID_COMMENT_MAX } from "@/lib/comments";
import { fmt } from "@/lib/economy";
import { useT } from "@/lib/i18n";
import { Button, Modal, Row, inputClass } from "../ui";

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
  const [comment, setComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentSent, setCommentSent] = useState(false);

  const sendComment = async () => {
    const body = comment.trim();
    if (!body || commentBusy || commentSent) return;
    setCommentBusy(true);
    try {
      await postRaidComment(report.id, body);
      setCommentSent(true);
      setComment("");
    } catch {
      // отчёт можно закрыть и без реплики
    } finally {
      setCommentBusy(false);
    }
  };

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
          <Button
            variant={onWatch ? "outline" : "build"}
            className={onWatch ? "" : "flex-1"}
            onClick={onClose}
          >
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
      <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-400">
        {t("raidComment.reportField")}
      </label>
      <div className="flex gap-2">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, RAID_COMMENT_MAX))}
          placeholder={t("raidComment.afterPlaceholder")}
          className={inputClass}
          maxLength={RAID_COMMENT_MAX}
          disabled={commentBusy || commentSent}
        />
        <Button
          size="sm"
          variant="build"
          disabled={commentBusy || commentSent || !comment.trim()}
          onClick={() => void sendComment()}
        >
          {commentSent ? t("raidComment.sent") : t("raidComment.send")}
        </Button>
      </div>
    </Modal>
  );
}
