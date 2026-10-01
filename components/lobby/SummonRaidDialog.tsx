"use client";

/*
 * Панель с кнопки «+ налёт»: адресат — только соперник, планировщик волн
 * и начинок за счёт своих дронов и кредитов.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MAX_ATTACK_DRONES, type Enemy } from "@/lib/enemy";
import { payloadCost, raidTotal, type WavePlan } from "@/lib/attack";
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
      <TargetPicker
        enemies={enemies}
        value={targetId}
        onChange={setTargetId}
        empty={t("raid.pickTarget")}
      />

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

/** Ник жирным, почта обычным — одной строкой, в списке и в поле. */
function TargetLine({ enemy }: { enemy: Enemy }) {
  return (
    <span className="min-w-0 truncate">
      <b className="font-semibold text-neutral-100">{enemy.name}</b>
      <span className="text-neutral-400"> · {enemy.email}</span>
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
