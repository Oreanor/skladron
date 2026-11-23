"use client";

/*
 * Журнал состязаний: по строке на открытый номер, свежие сверху.
 *
 * Первый непройденный висит всегда — с нулём и кнопкой «играть». У
 * пройденных лучший счёт и «переиграть», а нажатие на строку открывает повтор
 * лучшей попытки. Состязание
 * запускается сразу, мимо очереди налётов: оно не чей-то рой, а тренировка.
 */

import { Crosshair } from "lucide-react";
import {
  COMPETITION_STAGES,
  buildCompetition,
  type CompetitionBest,
} from "@/lib/competition";
import { useT } from "@/lib/i18n";
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
  // Последний пройден — непройденных не осталось, и строки «играть» нет.
  const allDone = competitionAt >= COMPETITION_STAGES && (best[COMPETITION_STAGES]?.score ?? 0) > 0;
  const stages = Array.from({ length: competitionAt }, (_, i) => competitionAt - i);

  return (
    <JournalList>
      {stages.map((n) => {
        const done = allDone || n < competitionAt;
        const b = done ? best[n] : undefined;
        const plan = buildCompetition(n);
        const replayId = b?.id;
        const watch = replayId ? () => onWatch(n, replayId) : undefined;
        const play = () => onPlay(n);
        return (
          <JournalRow key={n} open={watch} title={t("replay.watch")}>
            <RowText
              head={<>{t("competition.title", { n })}<BestScore pct={b?.score ?? 0} done={done} /></>}
              line={t("competitions.line", { drones: plan.drones, waves: plan.waves.length })}
            />
            <RowButtons>
              {watch && <WatchButton onPress={watch} />}
              {done ? (
                <RetakeButton busy={busy} onPress={play} />
              ) : (
                <RowButton
                  label={t("competitions.play")}
                  busy={busy}
                  className="border-red-500/60 text-red-400"
                  onPress={play}
                >
                  <Crosshair className={ROW_ICON} />
                </RowButton>
              )}
            </RowButtons>
          </JournalRow>
        );
      })}
    </JournalList>
  );
}
