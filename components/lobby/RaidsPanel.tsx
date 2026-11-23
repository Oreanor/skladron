"use client";

/*
 * Журнал боёв: что сейчас летит к нам и что уже отгремело.
 *
 * Обе половины в одном списке намеренно. Входящие сверху и в очереди —
 * отбиваются строго по порядку, и по списку сразу видно, чья очередь;
 * ниже прошедшие бои, из которых открывается повтор.
 */

import { X } from "lucide-react";
import { fmt } from "@/lib/economy";
import type { AttackOrder, RaidLog } from "@/lib/attack";
import type { PlayerStats } from "@/lib/player";
import { Button } from "../ui";
import { useT, type Translate } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";
import {
  BestScore,
  JournalList,
  JournalRow,
  RetakeButton,
  ROW_ICON,
  RowButton,
  RowButtons,
  RowText,
  WatchButton,
} from "./journalRow";

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
      onClick={(e) => { e.stopPropagation(); open(); }}
      className="font-semibold text-neutral-100 underline-offset-2 hover:underline"
    >
      {name}
    </button>
  ) : (
    <b className="font-semibold text-neutral-100">{name}</b>
  );

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

/** Открыть карточку врага по почте; у кого её нет — undefined, ник не кликается. */
type FoeOpener = (email: string | undefined) => (() => void) | undefined;

export default function RaidsPanel({
  incoming,
  raids,
  onDefend,
  onDecline,
  onWatch,
  onHide,
  onFoe,
  onPlan,
  onRetake,
  busy,
}: {
  /** Что к нам летит. Первый в списке и есть тот, кого отбивают. */
  incoming: AttackOrder[];
  raids: RaidLog[];
  onDefend: (order: AttackOrder) => void;
  /** Отклонить налёт знакомого через общий список. */
  onDecline: (order: AttackOrder) => void;
  onWatch: (raid: RaidLog) => void;
  onHide: (id: string) => void;
  onPlan: (raid: RaidLog) => void;
  /** Переиграть отбитый налёт на нынешнем складе — как миссию. */
  onRetake: (raid: RaidLog) => void;
  /** Прошлый бой ещё пишется — новый пока не начать. */
  busy: boolean;
  onFoe: FoeOpener;
}) {
  const t = useT();
  if (!raids.length && !incoming.length) {
    return <p className="text-neutral-500">{t("replays.empty")}</p>;
  }

  return (
    <JournalList>
      {incoming.map((order, i) => (
        <IncomingRow
          key={order.id}
          order={order}
          position={i}
          onDefend={onDefend}
          onDecline={onDecline}
          onFoe={onFoe}
        />
      ))}
      {raids.map((raid) => (
        <RaidRow
          key={raid.id}
          raid={raid}
          busy={busy}
          onFoe={onFoe}
          onPlan={onPlan}
          onWatch={onWatch}
          onHide={onHide}
          onRetake={onRetake}
        />
      ))}
    </JournalList>
  );
}

/**
 * Налёт в очереди. Отбивают строго по порядку: «отбить» только у первого.
 * Налёт знакомого через общий список можно отклонить на любом месте.
 */
function IncomingRow({
  order,
  position,
  onDefend,
  onDecline,
  onFoe,
}: {
  order: AttackOrder;
  position: number;
  onDefend: (order: AttackOrder) => void;
  onDecline: (order: AttackOrder) => void;
  onFoe: FoeOpener;
}) {
  const t = useT();
  const first = position === 0;
  const pattern = t(`pattern.${order.pattern}` as Key).toLowerCase();
  const edge = order.pattern === "lines" ? ` ${t(`edge.${order.direction}` as Key)}` : "";
  const queue = first ? t("attacks.ready") : t("attacks.queued", { position: position + 1 });
  return (
    <JournalRow dim={!first}>
      <RowText
        head={<><span className="text-red-300">{t("replays.incoming")}</span>{" "}<Foe name={order.from} open={onFoe(order.fromEmail)} /></>}
        line={`${day(order.createdAt)}, ${t("attacks.dronesPattern", { drones: order.drones, pattern })}${edge} · ${queue}`}
      />
      <RowButtons>
        {order.declinable && (
          <RowButton label={t("attacks.decline")} onPress={() => onDecline(order)}>
            <X className={ROW_ICON} />
          </RowButton>
        )}
        {first ? (
          <Button variant="danger" size="sm" onClick={() => onDefend(order)}>
            {t("attacks.defend")}
          </Button>
        ) : (
          <span className="self-center text-[11px] text-neutral-600">{t("attacks.defendFirst")}</span>
        )}
      </RowButtons>
    </JournalRow>
  );
}

/** Строка про исход: доля сгоревшего, если есть слепок, иначе клетки; у своего налёта — добыча. */
function raidLine(t: Translate, r: RaidLog) {
  if (r.pending) return `${day(r.at)}, ${t("replays.pending", { drones: r.drones })}`;
  if (r.declined) return `${day(r.at)}, ${t("replays.declined", { drones: r.drones })}`;
  const burned = r.burnedPct === undefined
    ? t("replays.line", { drones: r.drones, burned: fmt(r.burned) })
    : t("replays.linePct", { drones: r.drones, pct: r.burnedPct });
  const loot = r.side === "attack" && r.loot > 0 ? `, +${fmt(r.loot)} ${t("battle.creditsSuffix")}` : "";
  return `${day(r.at)}, ${burned}${loot}`;
}

/**
 * Прошедший бой. Устроен как строка миссии: щелчок открывает повтор (свой
 * налёт — его план), отбитый можно переиграть, лучшая переигровка — рядом
 * с ником, где у миссии её счёт.
 */
function RaidRow({
  raid: r,
  busy,
  onFoe,
  onPlan,
  onWatch,
  onHide,
  onRetake,
}: {
  raid: RaidLog;
  busy: boolean;
  onFoe: FoeOpener;
  onPlan: (raid: RaidLog) => void;
  onWatch: (raid: RaidLog) => void;
  onHide: (id: string) => void;
  onRetake: (raid: RaidLog) => void;
}) {
  const t = useT();
  const mine = r.side === "attack";
  const replayable = r.hasReplay && !r.pending;
  // переиграть можно только отбитый: в нём был наш склад
  const retakable = replayable && !mine;
  const watch = () => onWatch(r);
  const open = mine ? () => onPlan(r) : replayable ? watch : undefined;
  return (
    <JournalRow open={open} title={t(mine ? "raid.planTitle" : "replay.watch")}>
      <RowText
        muted={r.pending}
        head={
          <>
            <span className={mine ? "text-red-300" : "text-sky-300"}>
              {t(mine ? "replays.attack" : "replays.defence")}
            </span>{" "}
            <Foe name={r.foe} open={onFoe(r.foeEmail)} />
            {retakable && r.retakeBest !== undefined && (
              <BestScore pct={r.retakeBest} title={t("replays.retakeBest")} />
            )}
          </>
        }
        line={raidLine(t, r)}
      />
      {/* пока бой не отыгран, смотреть и убирать нечего */}
      {!r.pending && (
        <RowButtons>
          <RowButton label={t("replays.hide")} onPress={() => onHide(r.id)}>
            <X className={ROW_ICON} />
          </RowButton>
          {replayable && <WatchButton onPress={watch} />}
          {retakable && <RetakeButton busy={busy} onPress={() => onRetake(r)} />}
        </RowButtons>
      )}
    </JournalRow>
  );
}
