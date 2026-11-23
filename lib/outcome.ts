/**
 * Что бой меняет у защитника — одни правила, без интерфейса и сервера.
 *
 * Склад после боя, счётчики, страховка с премией за отбой, счёт вражды и
 * прогресс миссий. Сервер всё это потом пересчитывает у себя и присылает
 * правду; здесь — то же самое сразу, чтобы игрок видел итог, не дожидаясь
 * ответа.
 */

import { isSelfBattle, type AttackOrder } from "./attack";
import type { BattleResult } from "./engine";
import type { Depot, Gun } from "./base";
import { COMPETITION_STAGES, competitionScore, missionReward, type CompetitionBest } from "./competition";
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

/** Счёт налёта на себя: сколько процентов склада уцелело и побит ли рекорд. */
export interface SelfScore {
  pct: number;
  score: number;
  record: boolean;
}

/** Что бой изменил — для сообщения игроку и записи на сервер. */
export interface OutcomeSummary {
  /** Сколько дронов сбито всеми способами. */
  killed: number;
  /** Счёт миссии или переигровки. У настоящего налёта — нет. */
  score?: SelfScore;
  /** Поменялся счёт вражды — список соперников надо сохранить. */
  foeChanged: boolean;
}

/**
 * Что бой платит сверх страховки. Миссия — своей наградой, переигровка —
 * ничем (иначе один налёт переигрывали бы ради денег), налёт — премией за
 * отбой. Сервер решает так же в resolve_attack.
 */
export function battleReward(
  order: AttackOrder,
  missionBest: CompetitionBest | undefined,
  intactBefore: number,
  burned: number,
  killed: number
) {
  if (order.competitionStage) {
    return missionReward(order.competitionStage, missionBest, intactBefore, burned, killed);
  }
  return order.retakeOf ? 0 : defenseBounty(order.drones, burned);
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

  const stage = battle.competitionStage;
  const missionBest = stage ? p.competitionBest[stage] : undefined;
  const reward = battleReward(battle, missionBest, intactBefore, o.result.burned, killed);

  // Налёт на себя считается одинаково: доля уцелевшего склада против
  // прежнего лучшего. У миссии лучший — по номеру, у переигровки — в
  // исходном бою. Сервер считает то же у себя, и его счёт перекроет этот.
  const attempt = competitionScore(intactBefore, intactCells(p));
  const best = stage ? missionBest?.score : battle.retakeBest;
  const score = isSelfBattle(battle)
    ? { ...attempt, record: attempt.score > (best ?? -1) }
    : undefined;

  // Миссия: лучший по номеру и следующий номер, если склад уцелел.
  if (stage) {
    if (score?.record) {
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
    ) + reward;

  // Счёт вражды: сколько он у нас сжёг. Налёт на себя его не трогает.
  const foe = isSelfBattle(battle) ? undefined : findFoe(p, battle);
  if (foe) foe.burnedByThem += o.result.burned;

  return { killed, score, foeChanged: Boolean(foe) };
}
