// Соперники: завести и убрать, слетать на разведку, отправить налёт,
// открыть переписку.

import type { Gun } from "@/lib/base";
import { countKind } from "@/lib/base";
import {
  payloadCost,
  raidDifficulty,
  raidSize,
  raidTotal,
  type WavePlan,
} from "@/lib/attack";
import { blankEnemy, makeEnemy, type Enemy } from "@/lib/enemy";
import { explain, explainAlone } from "@/lib/errors";
import { notifyBattle, notifyComment, notifyRivalAdded } from "@/lib/notify";
import type { Player } from "@/lib/player";
import { RAID } from "@/lib/tuning";
import type { LobbyCore } from "./useBaseSync";

/** Идущий разведвылет: карта врага, его пушки и сколько самолётов послали. */
export interface ScoutRun {
  enemy: Enemy;
  cells: Uint8Array;
  guns: Gun[];
  planes: number;
  /** Уровень пушек противника — они стреляют дальше и точнее. */
  gunLevel: number;
  /** Квадраты, устаревшие с прошлой разведки: летим смотреть заново. */
  stale: number[];
}

/**
 * С чего открывать планировщик пробного налёта: рой под нынешнюю оборону,
 * столько же, сколько прислал бы настоящий соперник.
 */
export const suggestedRaid = (p: Player, intact: number) =>
  Math.min(
    RAID.suggestMax,
    raidSize(
      countKind(p.guns, "gun") +
        // Ракетница сбивает примерно в полтора раза больше зенитки: ракета
        // сама доворачивает на цель. В прикидке силы склада так и весит.
        Math.round(countKind(p.guns, "rocket") * 1.5) +
        countKind(p.guns, "spray") / 2 +
        countKind(p.guns, "trap"),
      intact,
      raidDifficulty(),
      p.levels
    )
  );

export function rivalActions(
  core: LobbyCore,
  p: Player,
  {
    drones,
    droneCost,
    loadRaids,
    startScout,
  }: {
    /** Сколько дронов на складе. */
    drones: number;
    /** Во что обходится дрон при нынешнем уровне: от него считается надбавка. */
    droneCost: number;
    loadRaids: () => void;
    startScout: (run: ScoutRun) => void;
  }
) {
  const { repo, t, say } = core;

  const add = async (email: string): Promise<string | null> => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return t("enemies.notEmail");
    if (p.enemies.some((e) => e.email.toLowerCase() === email.toLowerCase())) {
      return t("enemies.already");
    }
    // Знакомство взаимное: он появляется у нас, мы — у него. Заодно сервер
    // отдаёт его настоящее имя склада.
    let name: string | undefined;
    try {
      name = (await repo.addRival(email)) ?? undefined;
      // Знакомство взаимное, и вторая сторона о нём пока не знает: пусть
      // узнает от бота, а не по первому прилетевшему рою.
      notifyRivalAdded(email);
    } catch (e) {
      // Тут сервер решает, можно ли добавить (есть ли такой игрок, не ты ли
      // это), — ничего не сохранялось, так что «не удалось сохранить» врало бы.
      return explainAlone(e, t);
    }
    // В облаке склад соперника живёт на сервере; выдумывать ему карту нужно
    // только локально, где настоящих противников нет и бой идёт с ботом.
    const enemy = repo.mode === "cloud" ? blankEnemy(email, name) : makeEnemy(email, name);
    p.enemies.push(enemy);
    core.rerender();
    try {
      // Адрес должен оказаться в профиле до того, как поле очистится: тогда
      // даже немедленное обновление страницы не потеряет добавленного друга.
      await repo.saveEnemies(p);
      return null;
    } catch (e) {
      p.enemies = p.enemies.filter((item) => item.id !== enemy.id);
      core.rerender();
      return t("enemies.notSaved", { error: explain(e, t) });
    }
  };

  /** Убрать соперника из списка. Счёт вражды уходит вместе с ним. */
  const remove = (enemy: Enemy) => {
    p.enemies = p.enemies.filter((e) => e.email.toLowerCase() !== enemy.email.toLowerCase());
    core.rerender();
    void repo
      .saveEnemies(p)
      .catch((e: unknown) => say(t("enemies.notSaved", { error: explain(e, t) })));
  };

  /** Разведка всегда одним дроном: снимает, что успеет, и возвращается. */
  const scout = async (enemy: Enemy): Promise<string | null> => {
    const planes = 1;
    if (drones < planes) return t("scout.needPlanes");
    try {
      await core.flushPersist();
      // Карта и списание самолётов приходят одной серверной операцией:
      // запросить настоящий склад бесплатно в обход вылета нельзя.
      const base = await repo.launchScout(p, enemy.email, planes);
      const outdated = enemy.scout
        ? await repo.stalePatches(enemy.email, enemy.scout.cells).catch(() => [])
        : [];
      startScout({
        enemy,
        cells: base.cells,
        guns: base.guns,
        planes,
        gunLevel: base.gunLevel,
        stale: outdated,
      });
      core.redraw();
      return null;
    } catch (e) {
      return t("scout.failed", { error: explain(e, t) });
    }
  };

  const raid = async (enemy: Enemy, waves: WavePlan[], comment?: string): Promise<string | null> => {
    const n = raidTotal(waves);
    if (drones < n) return t("raid.notEnough");
    if (payloadCost(droneCost, waves) > p.credits) return t("raid.noCredits");
    const seed = (Math.random() * 1e9) | 0;
    try {
      // Склад должен лежать на сервере до вылета: дронов снимает он сам,
      // со своей копии, и обратно присылает уже новый склад. Надбавку за
      // начинку тоже считает и списывает он.
      await core.flushPersist();
      const id = await repo.sendAttack(p, enemy.email, waves, seed, comment);
      if (id) {
        notifyBattle(id, "sent");
        if (comment?.trim()) notifyComment(id);
      }
      // счётчик налётов поднимает сам send_attack — второй раз здесь не нужно
      say(t("raid.sent", { email: enemy.email }));
      loadRaids();
      core.redraw();
      return null;
    } catch (error) {
      return t("raid.sendFailed", { error: explain(error, t) });
    }
  };

  return { add, remove, scout, raid };
}
