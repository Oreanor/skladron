"use client";

/*
 * Панель с кнопки «+ налёт». На себя — состязание с фиксированным составом
 * по номеру; на врага — обычный планировщик с дронами и кредитами.
 */

import { useMemo, useState } from "react";
import { MAX_ATTACK_DRONES, type Enemy } from "@/lib/enemy";
import { payloadCost, raidTotal, waveSize, type WavePlan } from "@/lib/attack";
import { buildCompetition } from "@/lib/competition";
import { RAID_COMMENT_MAX } from "@/lib/comments";
import RaidPlanner, { newWave } from "../RaidPlanner";
import { Button, Modal, inputClass } from "../ui";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";
import { TEST_RAID_MAX } from "./limits";

/** «self» — состязание на себя; иначе id врага из списка. */
type TargetId = "self" | string;

export default function TestRaidDialog({
  initial,
  competitionAt,
  enemies,
  drones,
  credits,
  droneCost,
  onCancel,
  onSendSelf,
  onSendEnemy,
}: {
  /** Сколько дронов предложить на врага с ходу. */
  initial: number;
  /** Какое состязание открыто сейчас. */
  competitionAt: number;
  enemies: Enemy[];
  drones: number;
  credits: number;
  droneCost: number;
  onCancel: () => void;
  onSendSelf: (waves: WavePlan[], droneLevel: number, stage: number) => string | null;
  onSendEnemy: (
    enemy: Enemy,
    waves: WavePlan[],
    comment?: string
  ) => Promise<string | null>;
}) {
  const t = useT();
  const [target, setTarget] = useState<TargetId>("self");
  const [waves, setWaves] = useState<WavePlan[]>(() => [newWave(initial)]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const plan = useMemo(() => buildCompetition(competitionAt), [competitionAt]);
  const toSelf = target === "self";
  const enemy = toSelf ? null : enemies.find((e) => e.id === target) ?? null;
  const total = toSelf ? plan.drones : raidTotal(waves);
  const max = toSelf ? TEST_RAID_MAX : Math.min(drones, MAX_ATTACK_DRONES);
  const surcharge = toSelf ? 0 : payloadCost(droneCost, waves);

  const problem = toSelf
    ? null
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
      setError(onSendSelf(plan.waves, plan.droneLevel, plan.stage));
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
      title={toSelf ? t("competition.title", { n: plan.stage }) : t("raid.testTitle")}
      subtitle={toSelf ? t("competition.subtitle") : t("raid.subtitle")}
      onClose={onCancel}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="danger"
            disabled={sending || problem !== null}
            onClick={() => void send()}
          >
            {toSelf
              ? t("competition.start")
              : sending
                ? t("raid.sending")
                : t("raid.send", { n: total })}
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
        value={target}
        onChange={(e) => setTarget(e.target.value as TargetId)}
        className={`${inputClass} mb-3`}
      >
        <option value="self">{t("competition.targetSelf", { n: plan.stage })}</option>
        {enemies.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} · {e.email}
          </option>
        ))}
      </select>

      {toSelf ? (
        <div className="space-y-3">
          <dl className="space-y-1 font-mono text-sm">
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
        </div>
      ) : (
        <>
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
        </>
      )}

      {problem && <p className="mt-2 text-xs text-red-400">{problem}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}
