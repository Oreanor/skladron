"use client";

/*
 * Журнал боёв: что сейчас летит к нам и что уже отгремело.
 *
 * Обе половины в одном списке намеренно. Входящие сверху и в очереди —
 * отбиваются строго по порядку, и по списку сразу видно, чья очередь;
 * ниже прошедшие бои, из которых открывается повтор.
 *
 * Тот же список служит и журналу состязаний: ему отдают только состязания,
 * а очередь (queue) — общую, потому что разбирается она одна на всё.
 */

import { Play, Trash2 } from "lucide-react";
import { fmt } from "@/lib/economy";
import type { AttackOrder, RaidLog } from "@/lib/attack";
import type { PlayerStats } from "@/lib/player";
import { Button, IconButton } from "../ui";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

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
  queue = incoming,
  raids,
  empty,
  onDefend,
  onWatch,
  onHide,
}: {
  /** Что к нам летит и показывается в этом журнале. */
  incoming: AttackOrder[];
  /** Вся очередь целиком: первый в ней и есть тот, кого отбивают. */
  queue?: AttackOrder[];
  raids: RaidLog[];
  /** Что сказать, когда список пуст. */
  empty: Key;
  onDefend: (order: AttackOrder) => void;
  onWatch: (raid: RaidLog) => void;
  onHide: (id: string) => void;
}) {
  const t = useT();
  if (!raids.length && !incoming.length) {
    return <p className="text-neutral-500">{t(empty)}</p>;
  }

  return (
    <ul className={`${VISIBLE} space-y-2 overflow-y-auto overscroll-contain pr-1`}>
      {incoming.map((a) => {
        const at = queue.indexOf(a);
        const first = at === 0;
        const edge = a.pattern === "lines" ? ` ${t(`edge.${a.direction}` as Key)}` : "";
        return (
          <li
            key={a.id}
            className={`flex items-center justify-between gap-2 ${first ? "" : "opacity-60"}`}
          >
            <div className="min-w-0">
              <div className="truncate text-neutral-200">
                {/* у состязания в подписи уже номер — «налёт от» ему не нужен */}
                {!a.competitionStage && (
                  <span className="text-red-300">{t("replays.incoming")} </span>
                )}
                {a.from}
              </div>
              <div className="font-mono text-[11px] text-neutral-500">
                {t("attacks.dronesPattern", {
                  drones: a.drones,
                  pattern: t(`pattern.${a.pattern}` as Key).toLowerCase(),
                })}
                {edge}
                {" · "}
                {first ? t("attacks.ready") : t("attacks.queued", { position: at + 1 })}
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
        <li key={r.id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className={`truncate ${r.pending ? "text-neutral-400" : "text-neutral-200"}`}>
              {!r.competitionStage && (
                <span className={r.side === "attack" ? "text-red-300" : "text-sky-300"}>
                  {t(r.side === "attack" ? "replays.attack" : "replays.defence")}{" "}
                </span>
              )}
              {r.foe}
            </div>
            <div className="font-mono text-[11px] text-neutral-500">
              {r.pending
                ? t("replays.pending", { drones: r.drones })
                : t("replays.line", { drones: r.drones, burned: fmt(r.burned) })}
              {!r.pending && r.side === "attack" && r.loot > 0
                ? ` · +${fmt(r.loot)} ${t("battle.creditsSuffix")}`
                : ""}
            </div>
          </div>
          {/* пока налёт в пути, смотреть и убирать нечего */}
          {!r.pending && (
            <div className="flex shrink-0 gap-1">
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
              <IconButton
                label={t("replays.hide")}
                title={t("replays.hide")}
                className="h-8 w-8"
                onClick={() => onHide(r.id)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
