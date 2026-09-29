"use client";

import { useState } from "react";
import { RAID_COMMENT_MAX } from "@/lib/comments";
import { payloadCost, raidTotal, type WavePlan } from "@/lib/attack";
import { MAX_ATTACK_DRONES, type Enemy } from "@/lib/enemy";
import { scoutCounts } from "@/lib/scout";
import { installColors } from "@/lib/render";
import { SCOUT } from "@/lib/tuning";
import { Crosshair, MessageSquare, Plane } from "lucide-react";
import ScoutThumb from "./lobby/ScoutThumb";
import { Button, Card, IconButton, Modal, inputClass } from "./ui";
import Avatar from "./Avatar";
import RaidPlanner, { newWave } from "./RaidPlanner";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

const SCOUT_KINDS = ["gun", "rocket", "spray", "trap"] as const;
const SCOUT_KIND_LABEL: Record<(typeof SCOUT_KINDS)[number], Key> = {
  gun: "tool.gun",
  rocket: "tool.rocket",
  spray: "tool.spray",
  trap: "tool.trap",
};

interface Props {
  enemies: Enemy[];
  drones: number;
  /** Кредиты и цена дрона: из них считается надбавка за начинку. */
  credits: number;
  droneCost: number;
  onAdd: (email: string) => Promise<string | null>; // текст ошибки или null
  onRaid: (enemy: Enemy, waves: WavePlan[], comment?: string) => Promise<string | null>;
  /** Разведка: сколько самолётов послать. Вернёт текст ошибки или null. */
  onScout: (enemy: Enemy, planes: number) => Promise<string | null>;
  /** Показать снятую карту врага во весь экран. */
  onShowMap: (enemy: Enemy) => void;
  /** Открыть разговор с соперником. */
  onWrite: (enemy: Enemy) => void;
  /** Сколько непрочитанного от кого, по почте в нижнем регистре. */
  unread: Record<string, number>;
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
  onWrite,
  unread,
  onChanged,
}: Props) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Enemy | null>(null);
  const [scoutTarget, setScoutTarget] = useState<Enemy | null>(null);
  const [profile, setProfile] = useState<Enemy | null>(null);
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
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left transition-colors hover:bg-neutral-800/50"
                  onClick={() => setProfile(e)}
                >
                  <Avatar avatar={e.avatar ?? null} name={e.name} email={e.email} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-neutral-200">{e.name}</div>
                    <div className="truncate font-mono text-[11px] text-neutral-500">
                      {e.email}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 gap-2">
                  {/*
                    Карта переехала внутрь карточки соперника: там ей место
                    рядом со счётом вражды, а в строке нужнее то, чем
                    пользуются каждый день.
                  */}
                  <IconButton
                    label={t("chat.button")}
                    title={t("chat.button")}
                    badge={unread[e.email.toLowerCase()]}
                    className="h-9 w-9"
                    onClick={() => onWrite(e)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </IconButton>
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

      {profile && (
        <EnemyProfile
          enemy={profile}
          onClose={() => setProfile(null)}
          onShowMap={
            profile.scout
              ? () => {
                  setProfile(null);
                  onShowMap(profile);
                }
              : undefined
          }
        />
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
          onSend={async (waves, comment) => {
            const error = await onRaid(target, waves, comment);
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

function EnemyProfile({
  enemy,
  onClose,
  onShowMap,
}: {
  enemy: Enemy;
  onClose: () => void;
  /** Открыть полную карту разведки — по клику на снимок. */
  onShowMap?: () => void;
}) {
  const t = useT();
  const last =
    enemy.lastRaidAt > 0
      ? new Date(enemy.lastRaidAt).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const counts = enemy.scout ? scoutCounts(enemy.scout.guns) : null;

  return (
    <Modal
      title={enemy.name}
      subtitle={enemy.email}
      wide={Boolean(enemy.scout)}
      onClose={onClose}
      footer={
        <Button variant="build" onClick={onClose}>
          {t("common.ok")}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <Avatar
            avatar={enemy.avatar ?? null}
            name={enemy.name}
            email={enemy.email}
            size="lg"
          />
          <dl className="min-w-0 flex-1 space-y-1.5 font-mono text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">{t("enemies.burnedByMe")}</dt>
              <dd className="text-neutral-200">{enemy.burnedByMe}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">{t("enemies.burnedByThem")}</dt>
              <dd className="text-neutral-200">{enemy.burnedByThem}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">{t("enemies.lastRaid")}</dt>
              <dd className="text-neutral-200">
                {last ?? t("enemies.noRaidYet")}
              </dd>
            </div>
            {!enemy.scout && (
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">{t("enemies.scoutStatus")}</dt>
                <dd className="text-neutral-200">{t("enemies.scoutNone")}</dd>
              </div>
            )}
          </dl>
        </div>

        {enemy.scout && counts && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            {/*
              Снимок крупно: атака и разведка живут в списке соперников,
              здесь только смотреть. Клик — полная карта с советами.
            */}
            <button
              type="button"
              onClick={onShowMap}
              title={t("scout.map")}
              className="min-w-0 flex-1 cursor-pointer overflow-hidden rounded-md border border-neutral-700 transition hover:border-neutral-500"
            >
              <ScoutThumb snapshot={enemy.scout} />
            </button>
            <ul className="shrink-0 space-y-2 font-mono text-sm sm:w-40">
              <li className="text-xs uppercase tracking-widest text-neutral-500">
                {t("scout.analysis")}
              </li>
              {SCOUT_KINDS.map((kind) => (
                <li key={kind} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-neutral-400">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/40"
                      style={{ background: installColors(kind).top }}
                      aria-hidden
                    />
                    {t(SCOUT_KIND_LABEL[kind])}
                  </span>
                  <span className="text-neutral-100">{counts[kind]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
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
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="build"
            disabled={sending || max < 1}
            onClick={() => void send()}
          >
            {max < 1 ? t("scout.needPlanes") : t("scout.send", { n })}
          </Button>
          <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
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
  onSend: (waves: WavePlan[], comment?: string) => Promise<string | null>;
}) {
  const t = useT();
  const max = Math.min(drones, MAX_ATTACK_DRONES);
  const [waves, setWaves] = useState<WavePlan[]>(() => [newWave(Math.min(50, Math.max(1, max)))]);
  const [comment, setComment] = useState("");
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
    const error = await onSend(waves, comment.trim() || undefined);
    setSending(false);
    setSendError(error);
  };

  return (
    <Modal
      title={t("raid.title", { name: enemy.name })}
      subtitle={t("raid.subtitle")}
      onClose={onCancel}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="danger"
            onClick={() => void send()}
            disabled={sending || problem !== null}
          >
            {sending ? t("raid.sending") : t("raid.send", { n: total })}
          </Button>
          <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
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
      {sendError && <p className="mt-2 text-xs text-red-400">{sendError}</p>}
    </Modal>
  );
}
