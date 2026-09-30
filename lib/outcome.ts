/**
 * Что бой меняет у защитника — одни правила, без интерфейса и сервера.
 *
 * Склад после боя, счётчики, страховка с премией за отбой, счёт вражды и
 * прогресс миссий. Сервер всё это потом пересчитывает у себя и присылает
 * правду; здесь — то же самое сразу, чтобы игрок видел итог, не дожидаясь
 * ответа.
 */

import type { AttackOrder } from "./attack";
import type { BattleResult } from "./engine";
import type { Depot, Gun } from "./base";
import { COMPETITION_STAGES, competitionScore } from "./competition";
import { defenseBounty, goodsValue, insurance } from "./economy";
import { intactCells, type Player } from "./player";

/** Чем кончился бой: карта после него, исход и запись рук защитника. */
export interface BattleOutcome {
  cells: Uint8Array;
  guns: Gun[];
  depots: Depot[];
  result: BattleResult;
  won: boolean;
  /** Запись действий защитника: по ней нападавший увидит бой своими глазами. */
  trace: string;
}

/**
 * Соперник, приславший этот налёт. Ищем по почте, а не по имени склада:
 * имена не уникальны и меняются переименованием, а почта — то же самое,
 * по чему соперника и заводят. У ботов почты нет, для них имя и остаётся
 * единственной приметой.
 */
export function findFoe(p: Player, order: AttackOrder) {
  const mail = order.fromEmail?.toLowerCase();
  if (mail) return p.enemies.find((e) => e.email.toLowerCase() === mail);
  return p.enemies.find((e) => e.name === order.from);
}

/** Что бой изменил — для сообщения игроку и записи на сервер. */
export interface OutcomeSummary {
  /** Сколько дронов сбито всеми способами. */
  killed: number;
  /** Попытка миссии: номер, счёт и побит ли рекорд. У налёта — нет. */
  mission?: { stage: number; pct: number; score: number; record: boolean };
  /** Поменялся счёт вражды — список соперников надо сохранить. */
  foeChanged: boolean;
}

/** Применяет исход боя к игроку. Меняет p на месте. */
export function applyOutcome(p: Player, battle: AttackOrder, o: BattleOutcome): OutcomeSummary {
  const goodsBefore = goodsValue(p.depots);
  // площадь до боя — от неё считается счёт миссии
  const intactBefore = intactCells(p);

  p.cells = o.cells;
  p.guns = o.guns;
  p.depots = o.depots;
  p.incoming = p.incoming.filter((a) => a.id !== battle.id);

  const killed = o.result.killedByGuns + o.result.killedByMg + o.result.killedByBalloons;
  p.stats.battles++;
  p.stats.dronesKilled += killed;
  p.stats.cellsBurned += o.result.burned;

  // Миссия: счёт попытки, лучший по номеру и следующий номер, если склад
  // уцелел. Сервер считает то же у себя, и при следующем входе его
  // прогресс перекроет этот.
  let mission: OutcomeSummary["mission"];
  const stage = battle.competitionStage;
  if (stage) {
    const attempt = competitionScore(intactBefore, intactCells(p));
    const record = attempt.score > (p.competitionBest[stage]?.score ?? -1);
    if (record) {
      p.competitionBest = {
        ...p.competitionBest,
        [stage]: {
          ...attempt,
          area: intactBefore,
          // повтор есть только у боя, что считал сервер
          id: battle.remote ? battle.id : undefined,
        },
      };
    }
    if (o.won) {
      p.competitionAt = Math.max(p.competitionAt, Math.min(COMPETITION_STAGES, stage + 1));
    }
    mission = { stage, pct: attempt.pct, score: attempt.score, record };
  }

  p.credits +=
    insurance(
      o.result.burned,
      goodsBefore - goodsValue(o.depots),
      o.result.gunsLost,
      p.levels.insurance,
      o.result.spraysLost,
      o.result.trapsLost,
      o.result.rocketsLost
    ) + defenseBounty(battle.drones, o.result.burned);

  // Счёт вражды: сколько он у нас сжёг.
  const foe = findFoe(p, battle);
  if (foe) foe.burnedByThem += o.result.burned;

  return { killed, mission, foeChanged: Boolean(foe) };
}
