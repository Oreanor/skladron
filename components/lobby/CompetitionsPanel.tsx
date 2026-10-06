"use client";

/*
 * Журнал состязаний: по строке на открытый номер, свежие сверху.
 *
 * Первый непройденный висит всегда — с нулём и кнопкой «играть». У
 * пройденных лучший счёт; нажатие на строку открывает повтор лучшей попытки,
 * а «переиграть» — уже в нём. Состязание
 * запускается сразу, мимо очереди налётов: оно не чей-то рой, а тренировка.
 */

import { Crosshair, RotateCcw } from "lucide-react";
import {
  COMPETITION_STAGES,
  buildCompetition,
  type CompetitionBest,
} from "@/lib/competition";
import { IconButton } from "../ui";
import { useT } from "@/lib/i18n";

/** Сколько номеров видно без прокрутки — как в журнале боёв. */
const VISIBLE = "max-h-[10.5rem]";

export default function CompetitionsPanel({
  competitionAt,
  best,
  busy,
  onPlay,
  onWatch,
}: {
  /** Старший открытый номер. */
  competitionAt: number;
  best: Record<number, CompetitionBest>;
  /** Прошлый бой ещё пишется: сервер пока не открыл следующий номер. */
  busy: boolean;
  onPlay: (stage: number) => void;
  onWatch: (stage: number, attackId: string) => void;
}) {
  const t = useT();
  // Сотый пройден — непройденных не осталось, и строки «играть» нет.
  const allDone = competitionAt >= COMPETITION_STAGES && (best[COMPETITION_STAGES]?.score ?? 0) > 0;
  const stages = Array.from({ length: competitionAt }, (_, i) => competitionAt - i);

  return (
    <ul className={`${VISIBLE} -mr-3 space-y-0.5 overflow-y-auto overscroll-contain pr-1.5`}>
      {stages.map((n) => {
        const done = n < competitionAt || allDone;
        const b = done ? best[n] : undefined;
        const plan = buildCompetition(n);
        // Пройденная с повтором — вся строка открывает повтор, а «переиграть»
        // живёт в нём. Без повтора смотреть нечего — тогда кнопка тут.
        const watchId = b?.id;
        const body = (
          <>
            <div className="truncate text-neutral-200">
              {t("competition.title", { n })}
              <span
                className={`ml-3 font-mono font-bold ${done ? "text-emerald-300" : "text-neutral-500"}`}
              >
                {b?.score ?? 0}%
              </span>
            </div>
            <div className="font-mono text-[11px] text-neutral-500">
              {t("competitions.line", { drones: plan.drones, waves: plan.waves.length })}
            </div>
          </>
        );
        return (
          <li key={n} className="flex items-center justify-between gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-neutral-800/60">
            {watchId ? (
              <button
                type="button"
                title={t("replay.watch")}
                className="min-w-0 flex-1 cursor-pointer text-left"
                onClick={() => onWatch(n, watchId)}
              >
                {body}
              </button>
            ) : (
              <div className="min-w-0">{body}</div>
            )}
            <div className="flex shrink-0 gap-1">
              {done ? (
                !watchId && (
                  <IconButton
                    label={t("competitions.retake")}
                    title={busy ? t("competitions.saving") : t("competitions.retake")}
                    className="h-8 w-8 disabled:cursor-wait disabled:opacity-40"
                    disabled={busy}
                    onClick={() => onPlay(n)}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </IconButton>
                )
              ) : (
                <IconButton
                  label={t("competitions.play")}
                  title={busy ? t("competitions.saving") : t("competitions.play")}
                  className="h-8 w-8 border-red-500/60 text-red-400 disabled:cursor-wait disabled:opacity-40"
                  disabled={busy}
                  onClick={() => onPlay(n)}
                >
                  <Crosshair className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
