"use client";

/*
 * Журнал состязаний: по строке на открытый номер, свежие сверху.
 *
 * Первый непройденный висит всегда — с нулём и кнопкой «играть». У
 * пройденных лучший счёт, повтор лучшей попытки и «переиграть». Состязание
 * запускается сразу, мимо очереди налётов: оно не чей-то рой, а тренировка.
 */

import { Crosshair, Play, RotateCcw } from "lucide-react";
import {
  COMPETITION_STAGES,
  competitionDrones,
  competitionWaveCount,
  type CompetitionBest,
} from "@/lib/competition";
import { IconButton } from "../ui";
import { useT } from "@/lib/i18n";

/** Сколько номеров видно без прокрутки — как в журнале боёв. */
const VISIBLE = "max-h-[10.5rem]";

export default function CompetitionsPanel({
  competitionAt,
  best,
  onPlay,
  onWatch,
}: {
  /** Старший открытый номер. */
  competitionAt: number;
  best: Record<number, CompetitionBest>;
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
        const waves = competitionWaveCount(n);
        return (
          <li key={n} className="flex items-center justify-between gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-neutral-800/60">
            <div className="min-w-0">
              <div className="truncate text-neutral-200">
                {t("competition.title", { n })}
                <span
                  className={`ml-3 font-mono font-bold ${done ? "text-emerald-300" : "text-neutral-500"}`}
                >
                  {b?.score ?? 0}%
                </span>
              </div>
              <div className="font-mono text-[11px] text-neutral-500">
                {t(waves === 1 ? "competitions.line" : "competitions.lineWaves", {
                  drones: competitionDrones(n),
                  waves,
                })}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              {done ? (
                <>
                  {b?.id && (
                    <IconButton
                      label={t("replay.watch")}
                      title={t("replay.watch")}
                      className="h-8 w-8"
                      onClick={() => onWatch(n, b.id!)}
                    >
                      <Play className="h-4 w-4" />
                    </IconButton>
                  )}
                  <IconButton
                    label={t("competitions.retake")}
                    title={t("competitions.retake")}
                    className="h-8 w-8"
                    onClick={() => onPlay(n)}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </IconButton>
                </>
              ) : (
                <IconButton
                  label={t("competitions.play")}
                  title={t("competitions.play")}
                  className="h-8 w-8 border-red-500/60 text-red-400"
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
