"use client";

/*
 * Всё, что лобби делает с чужими налётами само по себе: опрашивает сервер
 * и разбирает очередь.
 *
 * Обе заботы жили в лобби двумя длинными эффектами и держали при себе три
 * ref-а служебного учёта. Здесь они на месте: снаружи видно только, что
 * налёты как-то появляются и как-то отбиваются.
 *
 * Состояние игрока живёт в ref и мимо React: он о правках не знает, поэтому
 * перерисовку хук просит явно через refresh.
 */

import { useEffect, useRef } from "react";
import { goodsValue, insurance } from "@/lib/economy";
import { RAID } from "@/lib/tuning";
import { autoDefend, type UnattendedOutcome } from "@/lib/unattended";
import { blankEnemy } from "@/lib/enemy";
import { notifyBattle } from "@/lib/notify";
import type { AttackReport } from "@/lib/attack";
import type { Player } from "@/lib/player";
import type { Repo } from "@/lib/repo";
import type { Key } from "@/lib/i18n/dict";
import { findFoe } from "./tools";

/** Как часто спрашиваем сервер, не летит ли к нам что-нибудь. */
const POLL_MS = 10_000;
/** Как часто сверяем имена чужих складов: их переименовывают редко. */
const NAMES_MS = 5 * 60_000;
/** Шаг часов очереди: по ним же идёт срок займа. */
const TICK_MS = 1000;

type Translate = (key: Key, vars?: Record<string, string | number>) => string;

export interface AttacksOptions {
  repo: Repo;
  /** Игрок живёт в ref: правим на месте, React о нём не знает. */
  player: React.RefObject<Player | null>;
  /** Переводчик через ref: таймеры живут всю игру, а язык меняется. */
  t: React.RefObject<Translate>;
  /** Перерисовать лобби. */
  refresh: () => void;
  /** Перерисовать ещё и карту: её кадр кешируется отдельно. */
  refreshMap: () => void;
  /** Сказать что-нибудь игроку в полосу сообщений. */
  say: (text: string) => void;
  setReports: (reports: AttackReport[]) => void;
  setAutoReport: (r: { from: string; outcome: UnattendedOutcome }) => void;
  /** Часы: по ним лобби считает остаток времени на ответ и срок займа. */
  setNow: (at: number) => void;
  /** Перечитать склад с сервера, когда он отверг нашу запись. */
  reloadBase: () => Promise<void>;
  loadRaids: () => void;
}

export interface Attacks {
  /**
   * Отметить налёт отбитым до того, как об этом узнает сервер. Между боем и
   * ответом сервера проходит до десяти секунд опроса, и без отметки только
   * что отбитый рой успевал вернуться в список.
   */
  markResolved: (id: string) => void;
  /**
   * Снять отметку: сервер итог не принял, налёт у него всё ещё в очереди.
   * Иначе опрос будет вечно выкидывать его из списка, а разбирается она
   * строго по одному — за ним встанут все следующие.
   */
  unmarkResolved: (id: string) => void;
  /** Забыть весь учёт: игра начата заново. */
  forget: () => void;
}

export function useAttacks(o: AttacksOptions): Attacks {
  const opt = useRef(o);
  opt.current = o;

  /** Налёты, отбитые нами, но ещё не закрытые сервером. */
  const resolved = useRef(new Set<string>());
  /** Автобой идёт: второй раз параллельно его запускать нельзя. */
  const busy = useRef(false);
  const namesAt = useRef(0);

  // ---------- опрос сервера ----------
  useEffect(() => {
    if (o.repo.mode !== "cloud") return;
    let alive = true;

    const sync = async () => {
      const { repo, player, refresh, setReports } = opt.current;
      // В свёрнутой вкладке опрашивать некого: игрок всё равно не смотрит,
      // а запросы идут. Вернётся — синхронизируемся сразу.
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const state = await repo.syncAttacks();
        const cur = player.current;
        if (!alive || !cur) return;
        // Очередь сервера — только настоящие налёты. Боты с кнопки «+ налёт»
        // живут на клиенте, и раньше их сносил первый же опрос: список
        // подменялся серверным целиком. Теперь сливаем оба и сортируем по
        // времени — очередь остаётся одна и в правильном порядке.
        const bots = cur.incoming.filter((a) => !a.remote);
        cur.incoming = [
          ...state.incoming.filter((a) => !resolved.current.has(a.id)),
          ...bots,
        ].sort((a, b) => a.createdAt - b.createdAt);
        if (state.credits !== undefined) cur.credits = state.credits;
        if (state.stats) cur.stats = { ...cur.stats, ...state.stats };

        // Кто на нас напал, тот попадает в список: иначе ответить некому.
        let met = false;
        for (const a of cur.incoming) {
          const mail = a.fromEmail;
          if (!mail) continue;
          if (cur.enemies.some((e) => e.email.toLowerCase() === mail.toLowerCase())) continue;
          cur.enemies.push(blankEnemy(mail, a.from));
          met = true;
        }
        if (met) void repo.saveEnemies(cur).catch(() => {});

        setReports(state.reports);
        refresh();
      } catch {
        // Сеть может кратко пропасть — следующий опрос повторит попытку.
      }

      // Склад врага могли переименовать прямо сейчас — время от времени
      // сверяем имена, чтобы список не звал человека вчерашним именем.
      if (Date.now() - namesAt.current < NAMES_MS) return;
      namesAt.current = Date.now();
      try {
        const cur = player.current;
        if (!cur?.enemies.length) return;
        const names = await repo.baseNames(cur.enemies.map((e) => e.email));
        let changed = false;
        for (const e of cur.enemies) {
          const actual = names.get(e.email.toLowerCase());
          if (actual && actual !== e.name) {
            e.name = actual;
            changed = true;
          }
        }
        if (changed && alive) refresh();
      } catch {
        // имена — украшение списка, из-за них опрос ломаться не должен
      }
    };

    const timer = window.setInterval(() => void sync(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [o.repo]);

  // ---------- очередь налётов ----------
  /*
   * Отбиваются строго по очереди. У первой в списке идут часы: не успел за
   * RAID.ttlMs — налёт проходит сам, без брандспойта и пулемёта, и очередь
   * двигается дальше.
   */
  useEffect(() => {
    const tick = async () => {
      const {
        repo, player, t, refresh, refreshMap, say,
        setAutoReport, setNow, reloadBase,
      } = opt.current;
      const cur = player.current;
      const head = cur?.incoming[0];
      // время нужно не только очереди налётов: по нему же идёт срок займа
      if (cur?.loan) setNow(Date.now());
      if (!cur || !head) return;
      if (!head.activatedAt) {
        // сервер отметит своим временем при ближайшем опросе, а бот-атаки
        // живут только на клиенте — часы им заводим здесь
        head.activatedAt = Date.now();
        refresh();
        return;
      }
      setNow(Date.now());
      if (Date.now() < head.activatedAt + RAID.ttlMs) return;
      if (busy.current) return;

      busy.current = true;
      try {
        // Уровни передаём все: пушки и огнетушители работают сами, и сервер
        // пересчитает бой ровно с ними же. Пошли бы одни пушки — показанный
        // игроку исход разошёлся бы с посчитанным на сервере.
        const out = autoDefend(cur.cells, cur.guns, cur.depots, head, {
          guns: cur.levels.guns,
          sprays: cur.levels.sprays,
          traps: cur.levels.traps,
          mg: cur.levels.mg,
          water: cur.levels.water,
        });
        resolved.current.add(head.id);

        const goodsBefore = goodsValue(cur.depots);
        cur.cells = out.cells;
        cur.guns = out.guns;
        cur.depots = out.depots;
        cur.incoming = cur.incoming.filter((a) => a.id !== head.id);
        cur.stats.battles++;
        cur.stats.dronesKilled += out.result.killedByGuns + out.result.killedByMg;
        cur.stats.cellsBurned += out.result.burned;
        // страховка погорельцу: ремонт клеток и доля сгоревшего добра
        cur.credits += insurance(
          out.result.burned,
          goodsBefore - goodsValue(out.depots),
          out.result.gunsLost,
          cur.levels.insurance,
          out.result.spraysLost,
          out.result.trapsLost
        );

        const foe = findFoe(cur, head);
        if (foe) {
          foe.burnedByThem += out.result.burned;
          void repo.saveEnemies(cur).catch(() => {});
        }
        setAutoReport({ from: head.from, outcome: out });
        refreshMap();
        refresh();

        try {
          const patch = await repo.applyBattle(
            cur,
            out.result,
            head.remote ? head.id : undefined,
            "" // некому было ни тушить, ни стрелять: запись пустая
          );
          if (head.remote) notifyBattle(head.id, "resolved");
          if (patch.credits !== undefined) cur.credits = patch.credits;
          refresh();
        } catch (e) {
          say(t.current("auto.notSaved", { error: (e as Error).message }));
          resolved.current.delete(head.id);
          // урон не записался — не тащим сгоревшую карту дальше, иначе
          // отвергаться будет и ремонт, и всё остальное
          await reloadBase();
        }
      } finally {
        busy.current = false;
      }
    };

    const timer = window.setInterval(() => void tick(), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return {
    markResolved: (id) => resolved.current.add(id),
    unmarkResolved: (id) => resolved.current.delete(id),
    forget: () => resolved.current.clear(),
  };
}
