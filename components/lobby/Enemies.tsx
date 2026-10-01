"use client";

import { useEffect, useMemo, useState } from "react";
import { RAID_COMMENT_MAX } from "@/lib/comments";
import { payloadCost, raidTotal, type WavePlan } from "@/lib/attack";
import { MAX_ATTACK_DRONES, type Enemy } from "@/lib/enemy";
import { scoutCounts, seenGuns } from "@/lib/scout";
import { decodeRle, fogPatches, type Gun } from "@/lib/base";
import InstallCounts from "../scout/InstallCounts";
import { Crosshair, MessageSquare, Plane } from "lucide-react";
import ScoutMap from "../scout/ScoutMap";
import { Button, Card, ConfirmDialog, IconButton, Modal, inputClass } from "../ui";
import Avatar from "../Avatar";
import RaidPlanner, { newWave } from "./RaidPlanner";
import { useT } from "@/lib/i18n";


interface Props {
  enemies: Enemy[];
  drones: number;
  /** Кредиты и цена дрона: из них считается надбавка за начинку. */
  credits: number;
  droneCost: number;
  onAdd: (email: string) => Promise<string | null>; // текст ошибки или null
  onRaid: (enemy: Enemy, waves: WavePlan[], comment?: string) => Promise<string | null>;
  /** Разведка одним дроном. Вернёт текст ошибки или null. */
  onScout: (enemy: Enemy) => Promise<string | null>;
  /** Квадраты, где враг менял склад после съёмки: они снова под туманом. */
  fetchStale: (enemy: Enemy) => Promise<number[]>;
  /** Открыть разговор с соперником. */
  onWrite: (enemy: Enemy) => void;
  /** Сколько непрочитанного от кого, по почте в нижнем регистре. */
  unread: Record<string, number>;
  /** Убрать из списка соперников. */
  onRemove: (enemy: Enemy) => void;
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
  fetchStale,
  onWrite,
  unread,
  onRemove,
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
                    // разведка тратит дрон со склада: без дронов лететь некому
                    disabled={drones < 1}
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
          onRemove={() => {
            setProfile(null);
            onRemove(profile);
          }}
          fetchStale={fetchStale}
        />
      )}

      {scoutTarget && (
        <ScoutConfirm
          enemy={scoutTarget}
          onCancel={() => setScoutTarget(null)}
          onSend={async () => {
            const error = await onScout(scoutTarget);
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

export function EnemyProfile({
  enemy,
  onClose,
  onRemove,
  fetchStale,
}: {
  enemy: Enemy;
  onClose: () => void;
  /** Убрать из списка соперников — после подтверждения. */
  onRemove: () => void;
  /** Квадраты, где враг менял склад после съёмки: они снова под туманом. */
  fetchStale: (enemy: Enemy) => Promise<number[]>;
}) {
  const t = useT();
  const [removing, setRemoving] = useState(false);
  const [stale, setStale] = useState<number[]>([]);

  // сверяем снимок с тем, что у врага сейчас: изменённое затянет туманом
  useEffect(() => {
    if (!enemy.scout) return;
    let alive = true;
    fetchStale(enemy)
      .then((patches) => alive && setStale(patches))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enemy, fetchStale]);
  const last =
    enemy.lastRaidAt > 0
      ? new Date(enemy.lastRaidAt).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  // Считаем только снятое и не устаревшее — ровно то, что видно на карте.
  // Раньше шли все установки снимка, вместе с теми, что под туманом.
  const counts = useMemo(() => {
    if (!enemy.scout) return null;
    const seen = fogPatches(decodeRle(enemy.scout.seen), stale);
    return scoutCounts(seenGuns(enemy.scout.guns as Gun[], seen));
  }, [enemy.scout, stale]);

  return (
    <>
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
        {/*
          Слева вся инфа столбиком, справа только карта — под снимок ничего
          не кладём. Атака и разведка живут в списке соперников.
        */}
        <div
          className={
            enemy.scout
              ? "flex flex-col gap-4 sm:flex-row sm:items-stretch"
              : "flex flex-col gap-4"
          }
        >
          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-64">
            <Avatar
              avatar={enemy.avatar ?? null}
              name={enemy.name}
              email={enemy.email}
              size="lg"
            />
            <dl className="space-y-1.5 font-mono text-sm">
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
                <dd className="text-right text-neutral-200">
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
            {counts && (
              <ul className="space-y-2 border-t border-neutral-800 pt-3 font-mono text-sm">
                <li className="text-xs uppercase tracking-widest text-neutral-500">
                  {t("scout.analysis")}
                </li>
                <li className="space-y-2">
                  <InstallCounts counts={counts} />
                </li>
              </ul>
            )}
            {/* внизу колонки, подальше от «ОК»: удаление не жмут мимоходом */}
            <Button
              variant="outline"
              size="sm"
              className="mt-auto self-center text-neutral-400"
              onClick={() => setRemoving(true)}
            >
              {t("enemies.remove")}
            </Button>
          </div>

          {/* живая карта: колесо зумит, правая кнопка тащит — как везде */}
          {enemy.scout && (
            <ScoutMap
              snapshot={enemy.scout}
              stale={stale}
              className="aspect-square max-h-[60dvh] min-w-0 flex-1 self-start"
            />
          )}
        </div>
      </Modal>
      {removing && (
        <ConfirmDialog
          title={t("enemies.removeConfirm", { name: enemy.name })}
          subtitle={t("enemies.removeNote")}
          confirm={t("enemies.remove")}
          onCancel={() => setRemoving(false)}
          onConfirm={onRemove}
        />
      )}
    </>
  );
}

/**
 * Разведка — один дрон, без выбора числа: спрашиваем только «послать?» и
 * напоминаем, когда снимали в прошлый раз.
 */
function ScoutConfirm({
  enemy,
  onCancel,
  onSend,
}: {
  enemy: Enemy;
  onCancel: () => void;
  onSend: () => Promise<string | null>;
}) {
  const t = useT();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = enemy.scout
    ? new Date(enemy.scout.at).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError(await onSend());
    setSending(false);
  };

  return (
    <Modal
      title={t("scout.ask", { name: enemy.name })}
      subtitle={last ? t("scout.lastShot", { at: last }) : t("scout.never")}
      onClose={onCancel}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="build" disabled={sending} onClick={() => void send()}>
            {t("common.yes")}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t("common.no")}
          </Button>
        </div>
      }
    >
      {error ? <p className="text-xs text-red-400">{error}</p> : <></>}
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
