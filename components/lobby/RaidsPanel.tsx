"use client";

/*
 * Журнал боёв: что сейчас летит к нам и что уже отгремело.
 *
 * Обе половины в одном списке намеренно. Входящие сверху и в очереди —
 * отбиваются строго по порядку, и по списку сразу видно, чья очередь;
 * ниже прошедшие бои, из которых открывается повтор.
 */

import { Play, Trash2 } from "lucide-react";
import { fmt } from "@/lib/economy";
import type { AttackOrder, RaidLog } from "@/lib/attack";
import type { PlayerStats } from "@/lib/player";
import { Button, IconButton } from "../ui";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

/** Дата боя коротко: 23.11.25. */
const day = (at: number) => {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${two(d.getFullYear() % 100)}`;
};

/** Ник второй стороны: жирный и белый; если соперник в списке — кликается. */
const Foe = ({ name, open }: { name: string; open?: () => void }) =>
  open ? (
    <button
      type="button"
      onClick={open}
      className="font-semibold text-neutral-100 underline-offset-2 hover:underline"
    >
      {name}
    </button>
  ) : (
    <b className="font-semibold text-neutral-100">{name}</b>
  );

/** Сколько боёв видно без прокрутки: журнал не должен выдавливать соседей. */
const VISIBLE = "max-h-[10.5rem]";

export function StatsPanel({ stats }: { stats: PlayerStats }) {
  const t = useT();
  const rows = [
    "battles", "dronesKilled", "cellsBurned", "cellsRepaired", "wipes", "raids", "looted",
  ] as const;
  return (
    <div className="space-y-1 font-mono text-xs text-neutral-400">
      {rows.map((key) => (
        <div key={key} className="flex items-center justify-between">
          <span>{t(`stats.${key}` as Key)}</span>
          <span className="text-neutral-200">{fmt(stats[key] ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export default function RaidsPanel({
  incoming,
  raids,
  onDefend,
  onWatch,
  onHide,
  onFoe,
}: {
  /** Что к нам летит. Первый в списке и есть тот, кого отбивают. */
  incoming: AttackOrder[];
  raids: RaidLog[];
  onDefend: (order: AttackOrder) => void;
  onWatch: (raid: RaidLog) => void;
  onHide: (id: string) => void;
  /**
   * Открыть карточку врага по почте. Возвращает undefined для тех, кого нет
   * в списке соперников, — их ник не кликается.
   */
  onFoe: (email: string | undefined) => (() => void) | undefined;
}) {
  const t = useT();
  if (!raids.length && !incoming.length) {
    return <p className="text-neutral-500">{t("replays.empty")}</p>;
  }

  return (
    <ul className={`${VISIBLE} -mx-3 space-y-0.5 overflow-y-auto overscroll-contain pr-1.5`}>
      {incoming.map((a, i) => {
        const first = i === 0;
        const edge = a.pattern === "lines" ? ` ${t(`edge.${a.direction}` as Key)}` : "";
        return (
          <li
            key={a.id}
            className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-neutral-800/60 ${first ? "" : "opacity-60"}`}
          >
            <div className="min-w-0">
              <div className="truncate text-neutral-200">
                <span className="text-red-300">{t("replays.incoming")}</span>{" "}
                <Foe name={a.from} open={onFoe(a.fromEmail)} />
              </div>
              <div className="font-mono text-[11px] text-neutral-500">
                {day(a.createdAt)}
                {", "}
                {t("attacks.dronesPattern", {
                  drones: a.drones,
                  pattern: t(`pattern.${a.pattern}` as Key).toLowerCase(),
                })}
                {edge}
                {" · "}
                {first ? t("attacks.ready") : t("attacks.queued", { position: i + 1 })}
              </div>
            </div>
            {first ? (
              <Button
                variant="danger"
                size="sm"
                className="shrink-0"
                onClick={() => onDefend(a)}
              >
                {t("attacks.defend")}
              </Button>
            ) : (
              <span className="shrink-0 text-[11px] text-neutral-600">
                {t("attacks.defendFirst")}
              </span>
            )}
          </li>
        );
      })}

      {raids.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-neutral-800/60">
          <div className="min-w-0">
            <div className={`truncate ${r.pending ? "text-neutral-400" : "text-neutral-200"}`}>
              <span className={r.side === "attack" ? "text-red-300" : "text-sky-300"}>
                {t(r.side === "attack" ? "replays.attack" : "replays.defence")}
              </span>{" "}
              <Foe name={r.foe} open={onFoe(r.foeEmail)} />
            </div>
            <div className="font-mono text-[11px] text-neutral-500">
              {r.pending
                ? `${day(r.at)}, ${t("replays.pending", { drones: r.drones })}`
                : `${day(r.at)}, ${
                    r.burnedPct !== undefined
                      ? t("replays.linePct", { drones: r.drones, pct: r.burnedPct })
                      : t("replays.line", { drones: r.drones, burned: fmt(r.burned) })
                  }`}
              {!r.pending && r.side === "attack" && r.loot > 0
                ? `, +${fmt(r.loot)} ${t("battle.creditsSuffix")}`
                : ""}
            </div>
          </div>
          {/* пока бой не отыгран, смотреть и убирать нечего */}
          {!r.pending && (
            <div className="flex shrink-0 gap-1">
              <IconButton
                label={t("replays.hide")}
                title={t("replays.hide")}
                className="h-8 w-8"
                onClick={() => onHide(r.id)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
              {r.hasReplay && (
                <IconButton
                  label={t("replay.watch")}
                  title={t("replay.watch")}
                  className="h-8 w-8"
                  onClick={() => onWatch(r)}
                >
                  <Play className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
