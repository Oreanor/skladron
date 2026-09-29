"use client";

/*
 * Панель с кнопки «+ налёт». Можно кинуть пробный рой на себя (бесплатно,
 * только в свою очередь) или настоящий налёт на выбранного врага — тогда
 * списываются дроны и кредиты, как из карточки врага.
 */

import { useState } from "react";
import { MAX_ATTACK_DRONES, type Enemy } from "@/lib/enemy";
import { payloadCost, raidTotal, type WavePlan } from "@/lib/attack";
import { RAID_COMMENT_MAX } from "@/lib/comments";
import RaidPlanner, { newWave } from "../RaidPlanner";
import { Button, Modal, inputClass } from "../ui";
import { useT } from "@/lib/i18n";
import { TEST_RAID_MAX } from "./limits";

/** «self» — пробный на себя; иначе id врага из списка. */
type TargetId = "self" | string;

export default function TestRaidDialog({
  initial,
  level,
  enemies,
  drones,
  credits,
  droneCost,
  onCancel,
  onSendSelf,
  onSendEnemy,
}: {
  /** Сколько дронов предложить с ходу: рой под нынешнюю оборону. */
  initial: number;
  /** Свой уровень дронов — для пробного налёта на себя. */
  level: number;
  enemies: Enemy[];
  drones: number;
  credits: number;
  droneCost: number;
  onCancel: () => void;
  onSendSelf: (waves: WavePlan[], droneLevel: number) => string | null;
  onSendEnemy: (
    enemy: Enemy,
    waves: WavePlan[],
    comment?: string
  ) => Promise<string | null>;
}) {
  const t = useT();
  const [target, setTarget] = useState<TargetId>("self");
  const [waves, setWaves] = useState<WavePlan[]>(() => [newWave(initial)]);
  const [droneLevel, setDroneLevel] = useState(level);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const toSelf = target === "self";
  const enemy = toSelf ? null : enemies.find((e) => e.id === target) ?? null;
  const total = raidTotal(waves);
  const max = toSelf ? TEST_RAID_MAX : Math.min(drones, MAX_ATTACK_DRONES);
  const surcharge = toSelf ? 0 : payloadCost(droneCost, waves);

  const problem = toSelf
    ? total < 1
      ? t("raid.empty")
      : null
    : total < 1
      ? t("raid.empty")
      : total > max
        ? t("raid.tooMany")
        : surcharge > credits
          ? t("raid.noCredits")
          : !enemy
            ? t("raid.pickTarget")
            : null;

  const send = async () => {
    if (sending || problem) return;
    setError(null);
    if (toSelf) {
      setError(onSendSelf(waves, droneLevel));
      return;
    }
    if (!enemy) return;
    setSending(true);
    const err = await onSendEnemy(enemy, waves, comment.trim() || undefined);
    setSending(false);
    setError(err);
  };

  return (
    <Modal
      title={t("raid.testTitle")}
      subtitle={toSelf ? t("raid.testSubtitle") : t("raid.subtitle")}
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            disabled={sending || problem !== null}
            onClick={() => void send()}
          >
            {toSelf
              ? t("raid.testSend")
              : sending
                ? t("raid.sending")
                : t("raid.send", { n: total })}
          </Button>
          <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      }
    >
      <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-400">
        {t("raid.target")}
      </label>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value as TargetId)}
        className={`${inputClass} mb-3`}
      >
        <option value="self">{t("raid.targetSelf")}</option>
        {enemies.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} · {e.email}
          </option>
        ))}
      </select>

      <RaidPlanner
        waves={waves}
        onChange={setWaves}
        stock={toSelf ? TEST_RAID_MAX : drones}
        max={max}
        unitCost={toSelf ? 0 : droneCost}
        credits={toSelf ? undefined : credits}
        free={toSelf}
        droneLevel={toSelf ? droneLevel : undefined}
        onDroneLevel={toSelf ? setDroneLevel : undefined}
      />

      {!toSelf && (
        <>
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
        </>
      )}

      {problem && <p className="mt-2 text-xs text-red-400">{problem}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}
