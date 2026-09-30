"use client";

/*
 * Журнал боёв и повтор, который сейчас смотрят. Жили в лобби вперемешку со
 * стройкой; здесь — всё, что про прошедшие бои: загрузить, убрать из
 * журнала, открыть повтор.
 */

import { useState } from "react";
import type { RaidLog } from "@/lib/attack";
import type { Repo } from "@/lib/repo";
import type { ReplayData } from "../Replay";
import { explain } from "@/lib/errors";
import type { Key } from "@/lib/i18n/dict";

type Translate = (key: Key, vars?: Record<string, string | number>) => string;

/** Повтор на экране: чей бой и сама запись. */
export interface Watching {
  id: string;
  /** Тот, чей склад отбивался, — он стоит в шапке повтора. */
  name: string;
  replay: ReplayData;
}

export function useJournal(repo: Repo, t: Translate, say: (text: string) => void) {
  const [raids, setRaids] = useState<RaidLog[]>([]);
  const [watching, setWatching] = useState<Watching | null>(null);

  const loadRaids = () => {
    void repo
      .raidLog()
      .then(setRaids)
      .catch(() => {
        // журнал — не игра, из-за него ломаться нечему
      });
  };

  /** Убрать бой из своего журнала. У второй стороны он остаётся. */
  const hideRaid = async (id: string) => {
    setRaids((rows) => rows.filter((r) => r.id !== id));
    try {
      await repo.hideRaid(id);
    } catch {
      loadRaids();
    }
  };

  /** Открыть повтор боя по его id. */
  const openReplay = async (id: string, name: string) => {
    try {
      const data = await repo.replayOf(id);
      if (!data) {
        say(t("replay.gone"));
        return;
      }
      setWatching({ id, name, replay: data });
    } catch (e) {
      say(t("replay.failed", { error: explain(e, t) }));
    }
  };

  return { raids, loadRaids, hideRaid, openReplay, watching, setWatching };
}
