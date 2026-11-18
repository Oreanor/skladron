"use client";

/*
 * Панель с кнопки «+ налёт»: адресат — только соперник, планировщик волн
 * и начинок за счёт своих дронов и кредитов.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { shortEmail, type Enemy } from "@/lib/enemy";
import { makeOrder, payloadCost, raidTotal, type AttackOrder, type OutgoingRaid, type WavePlan } from "@/lib/attack";
import type { Player } from "@/lib/player";
import { explainAlone } from "@/lib/errors";
import Battle from "../battle/Battle";
import { RAID_COMMENT_MAX } from "@/lib/comments";
import RaidPlanner, { newWave } from "./RaidPlanner";
import { Button, Modal, inputClass } from "../ui";
import { useT } from "@/lib/i18n";

export default function SummonRaidDialog({
  initial,
  enemies,
  drones,
  credits,
  droneCost,
  fixedEnemy,
  existing,
  testBase,
  onCancel,
  onSend,
}: {
  initial: number;
  enemies: Enemy[];
  drones: number;
  credits: number;
  droneCost: number;
  fixedEnemy?: Enemy;
  existing?: OutgoingRaid;
  testBase: Player;
  onCancel: () => void;
  onSend: (
    enemy: Enemy,
    waves: WavePlan[],
    comment?: string
  ) => Promise<string | null>;
}) {
  const t = useT();
  const [targetId, setTargetId] = useState(fixedEnemy?.id ?? enemies[0]?.id ?? "");
  const [waves, setWaves] = useState<WavePlan[]>(() => structuredClone(existing?.waves ?? [newWave(initial)]));
  const [comment, setComment] = useState(existing?.opener ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [test, setTest] = useState<{ order: AttackOrder; base: Player } | null>(null);
  const [baseline] = useState(() => JSON.stringify({ targetId, waves, comment }));
  const dirty = baseline !== JSON.stringify({ targetId, waves, comment });
  const readOnly = Boolean(existing);
  const close = () => {
    if (sending) return;
    if (dirty && !readOnly) setConfirmClose(true);
    else onCancel();
  };

  const enemy = fixedEnemy ?? enemies.find((e) => e.id === targetId) ?? null;
  const total = raidTotal(waves);
  const unitCost = existing?.unitCost ?? droneCost;
  const stock = drones + (existing ? raidTotal(existing.waves) : 0);
  const budget = credits + (existing?.surcharge ?? 0);
  const surcharge = payloadCost(unitCost, waves);

  const problem =
    total < 1
      ? t("raid.empty")
      : total > stock
        ? t("raid.tooMany")
        : surcharge > budget
          ? t("raid.noCredits")
          : !enemy
            ? t("raid.pickTarget")
            : null;

  const send = async () => {
    if (sending || readOnly || problem || !enemy) return;
    setSending(true);
    setError(null);
    try {
      const err = await onSend(enemy, waves, comment.trim() || undefined);
      setError(err);
      if (err) setConfirmClose(false);
    } catch (e) {
      setError(explainAlone(e, t));
      setConfirmClose(false);
    } finally {
      setSending(false);
    }
  };

  if (test) return (
    <div className="fixed inset-0 z-50 bg-neutral-950">
      <Battle
        cells={test.base.cells} guns={test.base.guns} depots={test.base.depots}
        levels={test.base.levels} order={test.order} practice
        onFinish={() => setTest(null)}
      />
      <Button className="fixed right-3 top-3 z-50" onClick={() => setTest(null)}>
        {t("raid.backToPlan")}
      </Button>
    </div>
  );

  if (confirmClose) return (
    <Modal title={t("raid.saveQuestion")} onClose={() => setConfirmClose(false)} footer={
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="build" disabled={sending || problem !== null} onClick={() => void send()}>{t("common.save")}</Button>
        <Button disabled={sending} onClick={onCancel}>{t("raid.discard")}</Button>
        <Button disabled={sending} onClick={() => setConfirmClose(false)}>{t("common.cancel")}</Button>
      </div>
    }>
      <p className="text-sm text-neutral-400">{t("raid.saveNewHint")}</p>
      {problem && <p className="mt-2 text-xs text-red-400">{problem}</p>}
    </Modal>
  );

  return (
    <Modal
      title={existing ? t("raid.planTitle") : fixedEnemy ? t("raid.title", { name: fixedEnemy.name }) : t("raid.testTitle")}
      onClose={close}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled={sending || total < 1} onClick={() => setTest({
            order: makeOrder(t("raid.practice"), structuredClone(waves), existing?.droneLevel ?? testBase.levels.drones),
            base: structuredClone(testBase),
          })}>{t("raid.test")}</Button>
          {!readOnly && (
          <Button
            variant="danger"
            disabled={sending || problem !== null}
            onClick={() => void send()}
          >
            {sending ? t("raid.sending") : t("raid.send", { n: total })}
          </Button>
          )}
          <Button variant="outline" disabled={sending} onClick={close}>
            {t(readOnly ? "common.close" : "common.cancel")}
          </Button>
        </div>
      }
    >
      <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-400">
        {t("raid.target")}
      </label>
      {fixedEnemy ? <div className="mb-3 text-sm"><TargetLine enemy={fixedEnemy} /></div> : <TargetPicker
        enemies={enemies}
        value={targetId}
        onChange={setTargetId}
        empty={t("raid.pickTarget")}
      />}

      <p className="mb-3 text-xs text-neutral-500">{t("raid.practiceHint")}</p>
      {readOnly && <p className="mb-3 text-xs text-amber-300">{t("raid.locked")}</p>}
      <fieldset disabled={sending || readOnly}>
      <RaidPlanner
        waves={waves}
        onChange={setWaves}
        stock={stock}
        unitCost={unitCost}
        credits={budget}
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
      </fieldset>

      {!readOnly && problem && <p className="mt-2 text-xs text-red-400">{problem}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}

/** Ник жирным, почта обычным — одной строкой, в списке и в поле. */
function TargetLine({ enemy }: { enemy: Enemy }) {
  return (
    <span className="min-w-0 truncate">
      <b className="font-semibold text-neutral-100">{enemy.name}</b>
      <span className="text-neutral-400"> · {shortEmail(enemy.email)}</span>
    </span>
  );
}

/**
 * Выбор адресата. Не <select>: в его пунктах браузер не даёт выделить
 * жирным только ник, а без этого почты сливаются с именами.
 */
function TargetPicker({
  enemies,
  value,
  onChange,
  empty,
}: {
  enemies: Enemy[];
  value: string;
  onChange: (id: string) => void;
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = enemies.find((e) => e.id === value);

  // Закрываем щелчком мимо и по Escape — как настоящий список.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative mb-3">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!enemies.length}
        onClick={() => setOpen((v) => !v)}
        className={`${inputClass} flex items-center justify-between gap-2 text-left`}
      >
        {current ? <TargetLine enemy={current} /> : <span className="text-neutral-500">{empty}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-950 py-1 shadow-xl"
        >
          {enemies.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                role="option"
                aria-selected={e.id === value}
                onClick={() => {
                  onChange(e.id);
                  setOpen(false);
                }}
                className={`flex w-full px-3 py-2 text-left text-sm hover:bg-neutral-800 ${
                  e.id === value ? "bg-neutral-800/70" : ""
                }`}
              >
                <TargetLine enemy={e} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
