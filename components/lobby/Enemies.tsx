"use client";

import { useEffect, useMemo, useState } from "react";
import { type WavePlan } from "@/lib/attack";
import { shortEmail, type Enemy, type ListedPlayer } from "@/lib/enemy";
import { tooWeak } from "@/lib/economy";
import { scoutCounts, seenGuns } from "@/lib/scout";
import { decodeRle, fogPatches, type Gun } from "@/lib/base";
import InstallCounts from "../scout/InstallCounts";
import { Crosshair, MessageSquare, Plane, UserPlus } from "lucide-react";
import ScoutMap from "../scout/ScoutMap";
import { Button, Card, Checkbox, ConfirmDialog, IconButton, Modal, inputClass } from "../ui";
import Avatar from "../Avatar";
import SummonRaidDialog from "./SummonRaidDialog";
import type { Player } from "@/lib/player";
import NeedDrones from "./NeedDrones";
import { useT } from "@/lib/i18n";
import { whenLong } from "@/lib/dates";


interface Props {
  enemies: Enemy[];
  drones: number;
  /** Кредиты и цена дрона: из них считается надбавка за начинку. */
  credits: number;
  droneCost: number;
  testBase: Player;
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
  /** Дронов нет — перейти к их покупке. */
  onBuyDrones: () => void;
  /** Своя сила склада: с ней сравнивается цель налёта. */
  power: number;
  /**
   * «Показывать всех». Без сервера других игроков нет — тогда undefined, и
   * галочки нет вовсе.
   */
  listed?: boolean;
  onListed: (value: boolean) => Promise<string | null>;
  /** Открытые игроки, ближайшие по силе. */
  fetchListed: () => Promise<ListedPlayer[]>;
}

export default function Enemies({
  enemies,
  drones,
  credits,
  droneCost,
  testBase,
  onAdd,
  onRaid,
  onScout,
  fetchStale,
  onWrite,
  unread,
  onRemove,
  onChanged,
  onBuyDrones,
  power,
  listed,
  onListed,
  fetchListed,
}: Props) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Enemy | null>(null);
  const [scoutTarget, setScoutTarget] = useState<Enemy | null>(null);
  // Дронов нет: вместо окна налёта или разведки — предложение купить.
  const [needDrones, setNeedDrones] = useState<"raid" | "scout" | null>(null);
  const [profile, setProfile] = useState<Enemy | null>(null);
  const [adding, setAdding] = useState(false);
  /** Вдвое слабее нас: вместо знакомства — совет поискать соперника по силам. */
  const [weak, setWeak] = useState<ListedPlayer | null>(null);

  /** Добавить врага по почте. Вернёт текст ошибки или null. */
  const add = async (address: string) => {
    if (adding) return null;
    setAdding(true);
    const e = await onAdd(address.trim());
    setAdding(false);
    setError(e);
    if (!e) onChanged();
    return e;
  };
  const addByEmail = () => void add(email).then((err) => !err && setEmail(""));

  /** Из общего списка — только по силам; по почте друзья договорятся сами. */
  const addListed = (pl: ListedPlayer) => (tooWeak(power, pl.power) ? setWeak(pl) : void add(pl.email));

  const attack = (e: Enemy) => (drones < 1 ? setNeedDrones("raid") : setTarget(e));

  return (
    <>
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addByEmail();
          }}
          placeholder={t("enemies.placeholder")}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          className={inputClass}
        />
        <Button size="sm" onClick={addByEmail} disabled={adding}>
          {adding ? t("enemies.adding") : t("enemies.add")}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {listed !== undefined && (
        <Checkbox
          className="mt-2"
          on={listed}
          label={t("enemies.showAll")}
          onChange={(value) => void onListed(value).then(setError)}
        />
      )}

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
                  <div className="min-w-0 flex-1">
                    {/* уровень — в строке ника, по правому краю; почту он не сжимает */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium text-neutral-200">{e.name}</span>
                      <span className="shrink-0 font-mono text-xs text-neutral-400">
                        {t("enemies.levelShort", { n: e.level ?? 0 })}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[11px] text-neutral-500">
                      {shortEmail(e.email)}
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
                    onClick={() => (drones < 1 ? setNeedDrones("scout") : setScoutTarget(e))}
                  >
                    <Plane className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={t("enemies.attack")}
                    title={t("enemies.attack")}
                    className="h-9 w-9 border-red-800 bg-red-950/40 text-red-300 hover:bg-red-900/50"
                    onClick={() => attack(e)}
                  >
                    <Crosshair className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}

      {listed && (
        <ListedPlayers
          known={enemies}
          power={power}
          adding={adding}
          fetchListed={fetchListed}
          onAdd={addListed}
        />
      )}

      {weak && (
        <Modal
          title={t("enemies.tooWeakTitle", { name: weak.name })}
          onClose={() => setWeak(null)}
          footer={<Button variant="build" onClick={() => setWeak(null)}>{t("common.ok")}</Button>}
        >
          <p className="text-sm text-neutral-400">{t("enemies.tooWeak")}</p>
        </Modal>
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

      {needDrones && (
        <NeedDrones
          what={needDrones}
          onClose={() => setNeedDrones(null)}
          onBuy={() => {
            setNeedDrones(null);
            onBuyDrones();
          }}
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
        <SummonRaidDialog
          fixedEnemy={target}
          enemies={[target]}
          initial={Math.min(50, Math.max(1, drones))}
          testBase={testBase}
          drones={drones}
          credits={credits}
          droneCost={droneCost}
          onCancel={() => setTarget(null)}
          onSend={async (_enemy, waves, comment) => {
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

/**
 * Открытые игроки, которых ещё нет в списке врагов (их отсекает сервер):
 * ближайшие по силе — сверху, те, кто вдвое слабее, — бледнее: завести их
 * отсюда нельзя. Список перечитывается, когда кого-то добавили.
 */
function ListedPlayers({
  known,
  power,
  adding,
  fetchListed,
  onAdd,
}: {
  known: Enemy[];
  power: number;
  adding: boolean;
  fetchListed: () => Promise<ListedPlayer[]>;
  onAdd: (player: ListedPlayer) => void;
}) {
  const t = useT();
  const [players, setPlayers] = useState<ListedPlayer[] | null>(null);
  // Список зависит от того, кто уже во врагах: сервер их не отдаёт. Ключ —
  // сами почты, а не их число: замена одного врага другим тоже считается.
  const knownKey = useMemo(
    () => known.map((e) => e.email.toLowerCase()).sort().join(),
    [known]
  );
  useEffect(() => {
    let alive = true;
    fetchListed()
      .then((list) => alive && setPlayers(list))
      .catch(() => alive && setPlayers([]));
    return () => {
      alive = false;
    };
  }, [fetchListed, knownKey]);

  return (
    <section className="mt-4">
      <h3 className="mb-2 text-xs uppercase tracking-widest text-neutral-500">{t("enemies.others")}</h3>
      {players && !players.length ? (
        <p className="text-sm text-neutral-500">{t("enemies.othersEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {(players ?? []).map((pl) => (
            <Card key={pl.email}>
              <div className={`flex items-center gap-3 ${tooWeak(power, pl.power) ? "opacity-50" : ""}`}>
                <Avatar avatar={pl.avatar} name={pl.name} />
                <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-neutral-200">{pl.name}</span>
                  <span className="shrink-0 font-mono text-xs text-neutral-400">
                    {t("enemies.levelShort", { n: pl.level })}
                  </span>
                </div>
                <IconButton
                  label={t("enemies.add")}
                  title={t("enemies.add")}
                  className="h-9 w-9"
                  disabled={adding}
                  onClick={() => onAdd(pl)}
                >
                  <UserPlus className="h-4 w-4" />
                </IconButton>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </section>
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
  const last = enemy.lastRaidAt > 0 ? whenLong(enemy.lastRaidAt) : null;
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
        subtitle={shortEmail(enemy.email)}
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
                <dt className="text-neutral-500">{t("enemies.level")}</dt>
                <dd className="text-neutral-200">{enemy.level ?? 0}</dd>
              </div>
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
  const last = enemy.scout ? whenLong(enemy.scout.at) : null;

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
