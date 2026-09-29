"use client";

import { useState } from "react";
import { payloadCost, raidTotal, type WavePlan } from "@/lib/attack";
import { MAX_ATTACK_DRONES, type Enemy } from "@/lib/enemy";
import { SCOUT } from "@/lib/tuning";
import { Crosshair, Map, Plane } from "lucide-react";
import { Button, Card, IconButton, Modal, inputClass } from "./ui";
import RaidPlanner, { newWave } from "./RaidPlanner";
import { useT } from "@/lib/i18n";

interface Props {
  enemies: Enemy[];
  drones: number;
  /** Кредиты и цена дрона: из них считается надбавка за начинку. */
  credits: number;
  droneCost: number;
  onAdd: (email: string) => Promise<string | null>; // текст ошибки или null
  onRaid: (enemy: Enemy, waves: WavePlan[]) => Promise<string | null>;
  /** Разведка: сколько самолётов послать. Вернёт текст ошибки или null. */
  onScout: (enemy: Enemy, planes: number) => Promise<string | null>;
  /** Показать снятую карту врага. */
  onShowMap: (enemy: Enemy) => void;
  onChanged: () => void;
}

export default function Enemies({
  enemies,
  drones,
  credits,
  droneCost,
  onAdd,
  onRaid,
  onScout,
  onShowMap,
  onChanged,
}: Props) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Enemy | null>(null);
  const [scoutTarget, setScoutTarget] = useState<Enemy | null>(null);
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (adding) return;
    setAdding(true);
    const e = await onAdd(email.trim());
    setAdding(false);
    setError(e);
    if (!e) {
      setEmail("");
      onChanged();
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder={t("enemies.placeholder")}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          className={inputClass}
        />
        <Button size="sm" onClick={() => void add()} disabled={adding}>
          {adding ? t("enemies.adding") : t("enemies.add")}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {enemies.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          {t("enemies.empty")}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {enemies.map((e) => (
            <Card key={e.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-neutral-200">{e.name}</div>
                  <div className="truncate font-mono text-[11px] text-neutral-500">{e.email}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {e.scout && (
                    <IconButton
                      label={t("scout.map")}
                      title={t("scout.map")}
                      className="h-9 w-9"
                      onClick={() => onShowMap(e)}
                    >
                      <Map className="h-4 w-4" />
                    </IconButton>
                  )}
                  <IconButton
                    label={t("scout.button")}
                    title={t("scout.button")}
                    className="h-9 w-9"
                    onClick={() => setScoutTarget(e)}
                  >
                    <Plane className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={t("enemies.attack")}
                    title={t("enemies.attack")}
                    disabled={drones < 10}
                    className="h-9 w-9 border-red-800 bg-red-950/40 text-red-300 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setTarget(e)}
                  >
                    <Crosshair className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}

      {scoutTarget && (
        <ScoutDialog
          enemy={scoutTarget}
          stock={drones}
          onCancel={() => setScoutTarget(null)}
          onSend={async (n) => {
            const error = await onScout(scoutTarget, n);
            if (!error) setScoutTarget(null);
            return error;
          }}
        />
      )}

      {target && (
        <RaidDialog
          enemy={target}
          drones={drones}
          credits={credits}
          droneCost={droneCost}
          onCancel={() => setTarget(null)}
          onSend={async (waves) => {
            const error = await onRaid(target, waves);
            if (!error) {
              setTarget(null);
              onChanged();
            }
            return error;
          }}
        />
      )}
    </>
  );
}

function ScoutDialog({
  enemy,
  stock,
  onCancel,
  onSend,
}: {
  enemy: Enemy;
  stock: number;
  onCancel: () => void;
  onSend: (planes: number) => Promise<string | null>;
}) {
  const t = useT();
  const max = Math.min(stock, SCOUT.maxPlanes);
  const [n, setN] = useState(Math.min(3, Math.max(1, max)));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError(await onSend(n));
    setSending(false);
  };

  return (
    <Modal
      title={t("scout.title", { name: enemy.name })}
      subtitle={t("scout.subtitle")}
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <Button
            variant="build"
            className="flex-1"
            disabled={sending || max < 1}
            onClick={() => void send()}
          >
            {max < 1 ? t("scout.needPlanes") : t("scout.send", { n })}
          </Button>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      }
    >
      <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-400">
        {t("scout.planes", { n, max })}
      </label>
      <input
        type="range"
        min={1}
        max={Math.max(1, max)}
        step={1}
        value={n}
        onChange={(e) => setN(Number(e.target.value))}
        className="mb-4 h-8 w-full cursor-pointer accent-sky-400"
      />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}

/**
 * Окно налёта. Волны набираются планировщиком: сколько волн, какой формы и
 * с какой начинкой — решает игрок, а окно только сторожит запас дронов и
 * кошелёк.
 */
function RaidDialog({
  enemy,
  drones,
  credits,
  droneCost,
  onCancel,
  onSend,
}: {
  enemy: Enemy;
  drones: number;
  credits: number;
  droneCost: number;
  onCancel: () => void;
  onSend: (waves: WavePlan[]) => Promise<string | null>;
}) {
  const t = useT();
  const max = Math.min(drones, MAX_ATTACK_DRONES);
  const [waves, setWaves] = useState<WavePlan[]>(() => [newWave(Math.min(50, Math.max(1, max)))]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const total = raidTotal(waves);
  const surcharge = payloadCost(droneCost, waves);
  // Запас и деньги могли измениться, пока окно открыто, — проверяем перед
  // самой отправкой, а не только при наборе.
  const problem =
    total < 1
      ? t("raid.empty")
      : total > max
      ? t("raid.tooMany")
      : surcharge > credits
      ? t("raid.noCredits")
      : null;

  const send = async () => {
    if (sending || problem) return;
    setSending(true);
    setSendError(null);
    const error = await onSend(waves);
    setSending(false);
    setSendError(error);
  };

  return (
    <Modal
      title={t("raid.title", { name: enemy.name })}
      subtitle={t("raid.subtitle")}
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => void send()}
            disabled={sending || problem !== null}
          >
            {sending ? t("raid.sending") : t("raid.send", { n: total })}
          </Button>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      }
    >
      <RaidPlanner
        waves={waves}
        onChange={setWaves}
        stock={drones}
        max={MAX_ATTACK_DRONES}
        unitCost={droneCost}
        credits={credits}
      />
      {problem && <p className="mt-2 text-xs text-red-400">{problem}</p>}
      {sendError && <p className="mt-2 text-xs text-red-400">{sendError}</p>}
    </Modal>
  );
}
