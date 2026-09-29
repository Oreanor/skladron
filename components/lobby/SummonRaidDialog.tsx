"use client";

/*
 * Панель с кнопки «+ налёт»: адресат — только соперник, планировщик волн
 * и начинок за счёт своих дронов и кредитов.
 */

import { useState } from "react";
import { MAX_ATTACK_DRONES, type Enemy } from "@/lib/enemy";
import { payloadCost, raidTotal, type WavePlan } from "@/lib/attack";
import { RAID_COMMENT_MAX } from "@/lib/comments";
import RaidPlanner, { newWave } from "../RaidPlanner";
import { Button, Modal, inputClass } from "../ui";
import { useT } from "@/lib/i18n";

export default function SummonRaidDialog({
  initial,
  enemies,
  drones,
  credits,
  droneCost,
  onCancel,
  onSend,
}: {
  initial: number;
  enemies: Enemy[];
  drones: number;
  credits: number;
  droneCost: number;
  onCancel: () => void;
  onSend: (
    enemy: Enemy,
    waves: WavePlan[],
    comment?: string
  ) => Promise<string | null>;
}) {
  const t = useT();
  const [targetId, setTargetId] = useState(enemies[0]?.id ?? "");
  const [waves, setWaves] = useState<WavePlan[]>(() => [newWave(initial)]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const enemy = enemies.find((e) => e.id === targetId) ?? null;
  const total = raidTotal(waves);
  const max = Math.min(drones, MAX_ATTACK_DRONES);
  const surcharge = payloadCost(droneCost, waves);

  const problem =
    total < 1
      ? t("raid.empty")
      : total > max
        ? t("raid.tooMany")
        : surcharge > credits
          ? t("raid.noCredits")
          : !enemy
            ? t("raid.pickTarget")
            : null;

  const send = async () => {
    if (sending || problem || !enemy) return;
    setSending(true);
    setError(null);
    const err = await onSend(enemy, waves, comment.trim() || undefined);
    setSending(false);
    setError(err);
  };

  return (
    <Modal
      title={t("raid.testTitle")}
      onClose={onCancel}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="danger"
            disabled={sending || problem !== null}
            onClick={() => void send()}
          >
            {sending ? t("raid.sending") : t("raid.send", { n: total })}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-400">
        {t("raid.target")}
      </label>
      <select
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        className={`${inputClass} mb-3`}
      >
        {enemies.length === 0 && (
          <option value="">{t("raid.pickTarget")}</option>
        )}
        {enemies.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} · {e.email}
          </option>
        ))}
      </select>

      <RaidPlanner
        waves={waves}
        onChange={setWaves}
        stock={drones}
        max={max}
        unitCost={droneCost}
        credits={credits}
        free={false}
      />
      <label className="mb-1 mt-3 block text-xs uppercase tracking-wider text-neutral-400">
        {t("raidComment.openerField")}
      </label>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, RAID_COMMENT_MAX))}
        placeholder={t("raidComment.openerFieldPlaceholder")}
        className={inputClass}
        maxLength={RAID_COMMENT_MAX}
      />

      {problem && <p className="mt-2 text-xs text-red-400">{problem}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}
