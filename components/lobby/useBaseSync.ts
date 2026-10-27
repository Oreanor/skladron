// Склад игрока живёт в ref и мимо React: правки идут прямо в объект, а
// лобби потом просят перерисоваться. Здесь — эта перерисовка и запись
// склада на сервер с задержкой.

import { useRef, useState, type RefObject } from "react";
import type { Translate } from "@/lib/i18n";
import type { Player } from "@/lib/player";
import type { Repo } from "@/lib/repo";
import { explain } from "@/lib/errors";

/** Всё, что нужно любой части лобби, чтобы что-то сделать со складом. */
export interface LobbyCore {
  repo: Repo;
  t: Translate;
  say: (text: string) => void;
  /** Перерисовать лобби: склад поменялся мимо React. */
  rerender: () => void;
  /** Перерисовать карту: сцена берёт кэш по номеру версии. */
  refreshMap: () => void;
  /** И то и другое. */
  redraw: () => void;
  /** Перерисовать и записать склад с задержкой. */
  touch: () => void;
  /** Досохранить прямо сейчас: перед налётом склад должен лежать на сервере. */
  flushPersist: () => Promise<void>;
  /** Взять склад с сервера: наша копия разъехалась с его. */
  resyncBase: () => Promise<void>;
}

export function useBaseSync(
  repo: Repo,
  player: RefObject<Player | null>,
  t: Translate,
  say: (text: string) => void
) {
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useState(0);
  const [version, setVersion] = useState(0);

  const rerender = () => forceRender((v) => v + 1);
  const refreshMap = () => setVersion((v) => v + 1);
  const redraw = () => {
    refreshMap();
    rerender();
  };

  /**
   * Сервер отверг запись — значит наша копия склада разъехалась с его.
   * Дальше без синхронизации отвергалась бы каждая следующая правка, поэтому
   * берём серверную версию: она и есть настоящая.
   */
  const resyncBase = async () => {
    const cur = player.current;
    if (!cur) return;
    try {
      await repo.reloadBase(cur);
      redraw();
    } catch {
      // не достучались — попробуем при следующей правке
    }
  };

  /** Пишем склад с задержкой: на сервере это одна проверяемая операция. */
  const saveNow = async () => {
    const cur = player.current;
    if (!cur) return;
    try {
      const patch = await repo.saveBase(cur);
      if (patch.credits !== undefined) cur.credits = patch.credits;
      rerender();
    } catch (e) {
      say(t("save.rejected", { error: explain(e, t) }));
      await resyncBase();
    }
  };

  const persist = () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => void saveNow(), 400);
  };

  const flushPersist = async () => {
    if (!persistTimer.current) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = null;
    await saveNow();
  };

  const touch = () => {
    redraw();
    persist();
  };

  const core: LobbyCore = {
    repo,
    t,
    say,
    rerender,
    refreshMap,
    redraw,
    touch,
    flushPersist,
    resyncBase,
  };
  return { version, core };
}
