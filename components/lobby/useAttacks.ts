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
import { blankEnemy } from "@/lib/enemy";
import type { AttackReport } from "@/lib/attack";
import type { Player } from "@/lib/player";
import type { Repo } from "@/lib/repo";
import type { Key } from "@/lib/i18n/dict";
import { notifyBattle } from "@/lib/notify";
import { titleCompetitions } from "@/lib/competition";

/** Как часто спрашиваем сервер, не летит ли к нам что-нибудь. */
const POLL_MS = 10_000;
/** Как часто сверяем имена чужих складов: их переименовывают редко. */
const NAMES_MS = 5 * 60_000;
/** Шаг часов: по ним же идёт срок займа. */
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
  /** Часы: по ним лобби считает срок займа. */
  setNow: (at: number) => void;
  /**
   * Сколько непрочитанного и от кого. Опрос приносит это вместе с
   * налётами: отдельного таймера ради переписки заводить незачем.
   */
  setUnread: (by: Record<string, number>) => void;
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
  /** Что было непрочитано в прошлый опрос: говорим только про прибавку. */
  const unreadAt = useRef<Record<string, number>>({});
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
        titleCompetitions(state.incoming, opt.current.t.current);
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
        for (const a of state.incoming) {
          if (a.remote && !a.competitionStage) notifyBattle(a.id, "sent");
        }
        refresh();
      } catch {
        // Сеть может кратко пропасть — следующий опрос повторит попытку.
      }

      // Переписка: счётчики у кнопок и одно сообщение в полосу, когда
      // пришло новое. Говорим только про свежее — иначе строка твердила бы
      // про непрочитанное каждые десять секунд, пока не откроешь окно.
      try {
        const cur = player.current;
        const by = await repo.unread();
        if (!alive || !cur) return;
        for (const [mail, n] of Object.entries(by)) {
          const was = unreadAt.current[mail] ?? 0;
          if (n <= was) continue;
          const who = cur.enemies.find((e) => e.email.toLowerCase() === mail);
          opt.current.say(
            opt.current.t.current("chat.arrived", { name: who?.name ?? mail, body: "" }).trim()
          );
        }
        unreadAt.current = by;
        opt.current.setUnread(by);
      } catch {
        // переписка — не бой: не пришли счётчики, придут через десять секунд
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
          if (!actual) continue;
          if (actual.name !== e.name || actual.avatar !== e.avatar) {
            e.name = actual.name;
            e.avatar = actual.avatar;
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
   * Отбиваются строго по очереди, без срока: первый ждёт, пока игрок сам
   * не пойдёт в бой. Пропустить или переставить нельзя — это делает лобби.
   */
  useEffect(() => {
    const tick = () => {
      const { player, setNow } = opt.current;
      if (player.current?.loan) setNow(Date.now());
    };

    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return {
    markResolved: (id) => resolved.current.add(id),
    unmarkResolved: (id) => resolved.current.delete(id),
    forget: () => resolved.current.clear(),
  };
}
