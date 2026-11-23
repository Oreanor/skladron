// Дорога в бой и обратно: налёт из очереди, миссия, переигровка, записка нападающего
// перед боем, исход после — и то же для разведвылета.

import { GRID, encodeRle } from "@/lib/base";
import { isSelfBattle, makeOrder, type AttackOrder, type RaidLog } from "@/lib/attack";
import { postRaidComment } from "@/lib/comments";
import { buildCompetition } from "@/lib/competition";
import { explain, explainAlone } from "@/lib/errors";
import { notifyBattle } from "@/lib/notify";
import { applyOutcome, type BattleOutcome, type SelfScore } from "@/lib/outcome";
import type { Player } from "@/lib/player";
import type { ScoutOutcome } from "../scout/Scout";
import type { ScoutRun } from "./rivalActions";
import type { Attacks } from "./useAttacks";
import type { LobbyCore } from "./useBaseSync";

export function battleFlow(
  core: LobbyCore,
  p: Player,
  ui: {
    /** Исход прошлого боя ещё пишется на сервер. */
    saving: boolean;
    setSaving: (v: boolean) => void;
    setBattle: (order: AttackOrder | null) => void;
    setOpenerGate: (order: AttackOrder | null) => void;
    setPostCommentRaid: (id: string | null) => void;
    setScout: (run: ScoutRun | null) => void;
    closeSheet: () => void;
    attacks: Attacks;
    loadRaids: () => void;
  }
) {
  const { repo, t, say } = core;

  /**
   * В бой. Сервер узнаёт об этом сразу, а не только по исходу: пока бой
   * идёт, ночная отгрузка ждёт и не увозит ящики из-под горящего склада.
   */
  const enter = (order: AttackOrder) => {
    void repo.beginBattle().catch(() => {});
    ui.setBattle(order);
  };

  const defend = async (order: AttackOrder) => {
    ui.closeSheet();
    await core.flushPersist();
    const note = order.opener?.trim();
    if (order.remote && note) {
      ui.setOpenerGate(order);
      return;
    }
    enter(order);
  };

  /**
   * Отклонить налёт знакомого через общий список. Нападающему сервер вернёт
   * цену, а бот скажет, что налёт отклонён. Отклонён первый же налёт —
   * знакомство не состоялось: сервер убрал вас из списков друг друга.
   */
  const decline = async (order: AttackOrder) => {
    let unmet: boolean;
    try {
      unmet = await repo.declineRaid(order.id);
    } catch (e) {
      say(explainAlone(e, t));
      return;
    }
    // опрос мог успеть вернуть его в очередь — как с отбитым
    ui.attacks.markResolved(order.id);
    p.incoming = p.incoming.filter((a) => a.id !== order.id);
    const mail = order.fromEmail?.toLowerCase();
    if (unmet && mail) p.enemies = p.enemies.filter((e) => e.email.toLowerCase() !== mail);
    notifyBattle(order.id, "resolved");
    say(t("attacks.declined", { from: order.from }));
    core.rerender();
  };

  /** Записка нападающего прочитана, ответ (если есть) ушёл — в бой. */
  const afterOpener = async (order: AttackOrder, reply: string) => {
    ui.setOpenerGate(null);
    if (reply && order.remote) {
      try {
        await postRaidComment(order.id, reply);
      } catch {
        // реплика — мелочь, бой важнее
      }
    }
    enter(order);
  };

  /**
   * Налёт на себя — миссия или переигровка: сразу в бой, мимо очереди
   * налётов. Если такой уже стоит в очереди — бой прервали на полпути, —
   * играем его, а не ставим второй. Прежние неотыгранные того же рода
   * сервер при постановке убирает — убираем и мы.
   */
  const playSelf = async (
    ofKind: (a: AttackOrder) => boolean,
    same: (a: AttackOrder) => boolean,
    queue: () => Promise<AttackOrder>,
    /** Что дописать к бою перед входом — копией, очередь не трогаем. */
    prepare: (a: AttackOrder) => AttackOrder = (a) => a
  ) => {
    if (ui.saving) return;
    const queued = p.incoming.find(same);
    if (queued) return defend(prepare(queued));
    let order: AttackOrder;
    try {
      order = await queue();
    } catch (e) {
      say(explainAlone(e, t));
      return;
    }
    p.incoming = [...p.incoming.filter((a) => !ofKind(a)), order];
    core.touch();
    await defend(prepare(order));
  };

  /**
   * Миссия: постоянный состав и зерно по номеру, бесплатно. Вошедшему ставит
   * в очередь сервер — бой идёт той же дорогой, что живой, с повтором и
   * журналом; без входа очередь своя, в браузере.
   */
  const playCompetition = (stage: number) =>
    playSelf(
      (a) => Boolean(a.competitionStage),
      (a) => a.competitionStage === stage,
      async () => {
        const plan = buildCompetition(stage);
        const order = makeOrder(t("competition.title", { n: stage }), plan.waves, plan.droneLevel, plan.seed);
        order.competitionStage = stage;
        if (repo.mode === "cloud") {
          // Серверный id вместо своего: следующий опрос узнает этот же налёт
          // и не задвоит его в очереди.
          order.id = await repo.queueCompetition(stage, plan.waves, plan.seed, plan.droneLevel);
          order.remote = true;
        }
        return order;
      }
    );

  /**
   * Переигровка отбитого налёта: тот же рой на нынешний склад — как миссия.
   * Прежний рекорд живёт в журнале, а не в очереди: дописываем его к бою.
   */
  const playRetake = (raid: RaidLog) =>
    playSelf(
      (a) => Boolean(a.retakeOf),
      (a) => a.retakeOf === raid.id,
      async () => {
        const r = await repo.queueRetake(raid.id);
        return { ...makeOrder(r.foe, r.waves, r.droneLevel, r.seed), id: r.id, remote: true, retakeOf: raid.id };
      },
      (a) => ({ ...a, retakeBest: raid.retakeBest })
    );

  /** Что сказать после боя. */
  const resultText = (battle: AttackOrder, won: boolean, killed: number, score?: SelfScore) => {
    if (!score) return won ? t("battle.repelled", { killed }) : t("battle.burntDown", { from: battle.from });
    const stage = battle.competitionStage;
    return stage
      ? t(score.record ? "competition.record" : "competition.result", { n: stage, score: score.score })
      : t(score.record ? "raid.retakeRecord" : "raid.retakeResult", { from: battle.from, score: score.score });
  };

  /** Бой кончился: исход — в склад, на экран и на сервер. */
  const finishBattle = async (battle: AttackOrder, o: BattleOutcome) => {
    if (ui.saving) return;
    ui.setSaving(true);
    const { killed, score, foeChanged } = applyOutcome(p, battle, o);
    // Сервер узнает об исходе только из applyBattle ниже, а опрос идёт
    // раз в десять секунд и собирает очередь заново. Без этой отметки
    // только что отбитый рой успевал вернуться в список.
    ui.attacks.markResolved(battle.id);
    if (foeChanged) void repo.saveEnemies(p).catch(() => {});
    say(resultText(battle, o.won, killed, score));
    core.redraw();
    try {
      // урон пишем отдельной операцией: она умеет только ухудшать карту
      const patch = await repo.applyBattle(p, o.result, battle.remote ? battle.id : undefined, o.trace);
      // в налёте на себя писать некому: второй стороны нет
      if (battle.remote && !isSelfBattle(battle)) {
        notifyBattle(battle.id, "resolved");
        ui.setPostCommentRaid(battle.id);
      }
      if (patch.credits !== undefined) p.credits = patch.credits;
      core.rerender();
    } catch (e) {
      say(t("battle.notSaved", { error: explain(e, t) }));
      // Тот же случай: у сервера бой остался неотбитым, и показать его
      // снова надо — иначе отбиваться будет нечем, а очередь встанет.
      ui.attacks.unmarkResolved(battle.id);
      await core.resyncBase();
    } finally {
      // До подтверждения сервером остаёмся на итогах: ремонт не должен
      // пересекаться с пересчётом и загрузкой окончательной карты.
      ui.setBattle(null);
      core.redraw();
      ui.setSaving(false);
      ui.loadRaids();
    }
  };

  /** Разведчик вернулся: что снял — в карточку врага. */
  const finishScout = async (run: ScoutRun, o: ScoutOutcome) => {
    const foe = p.enemies.find((e) => e.id === run.enemy.id);
    if (foe) {
      foe.scout = {
        seen: encodeRle(o.seen),
        cells: encodeRle(o.cells),
        guns: o.guns.filter((g) => o.seen[g.cy * GRID + g.cx]),
        at: Date.now(),
      };
    }
    ui.setScout(null);
    core.rerender();
    try {
      await repo.saveEnemies(p);
    } catch (e) {
      say(t("enemies.notSaved", { error: explain(e, t) }));
    }
  };

  return { defend, decline, afterOpener, playCompetition, playRetake, finishBattle, finishScout };
}
