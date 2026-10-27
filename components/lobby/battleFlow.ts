// Дорога в бой и обратно: налёт из очереди, миссия, записка нападающего
// перед боем, исход после — и то же для разведвылета.

import { GRID, encodeRle } from "@/lib/base";
import { makeOrder, type AttackOrder } from "@/lib/attack";
import { postRaidComment } from "@/lib/comments";
import { buildCompetition } from "@/lib/competition";
import { explain, explainAlone } from "@/lib/errors";
import { notifyBattle } from "@/lib/notify";
import { applyOutcome, type BattleOutcome } from "@/lib/outcome";
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

  const defend = async (order: AttackOrder) => {
    ui.closeSheet();
    await core.flushPersist();
    const note = order.opener?.trim();
    if (order.remote && note) {
      ui.setOpenerGate(order);
      return;
    }
    ui.setBattle(order);
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
    ui.setBattle(order);
  };

  /**
   * Сыграть миссию: постоянный состав и зерно по номеру, бесплатно, сразу в
   * бой, мимо очереди налётов. Вошедшему ставит в очередь сервер — бой идёт
   * той же дорогой, что живой, с повтором и журналом; без входа очередь
   * своя, в браузере. Если этот номер уже стоит в очереди — бой прервали на
   * полпути, — играем его, а не ставим второй.
   */
  const playCompetition = async (stage: number) => {
    if (ui.saving) return;
    const queued = p.incoming.find((a) => a.competitionStage === stage);
    if (queued) {
      await defend(queued);
      return;
    }
    // сервер убирает прежние неотыгранные миссии — убираем и мы
    p.incoming = p.incoming.filter((a) => !a.competitionStage);
    const plan = buildCompetition(stage);
    const order = makeOrder(t("competition.title", { n: stage }), plan.waves, plan.droneLevel, plan.seed);
    order.competitionStage = stage;
    if (repo.mode === "cloud") {
      try {
        // Серверный id вместо своего: следующий опрос узнает этот же налёт
        // и не задвоит его в очереди.
        order.id = await repo.queueCompetition(stage, plan.waves, plan.seed, plan.droneLevel);
        order.remote = true;
      } catch (e) {
        say(explainAlone(e, t));
        return;
      }
    }
    p.incoming.push(order);
    core.touch();
    await defend(order);
  };

  /** Бой кончился: исход — в склад, на экран и на сервер. */
  const finishBattle = async (battle: AttackOrder, o: BattleOutcome) => {
    const { killed, mission, foeChanged } = applyOutcome(p, battle, o);
    // Сервер узнает об исходе только из applyBattle ниже, а опрос идёт
    // раз в десять секунд и собирает очередь заново. Без этой отметки
    // только что отбитый рой успевал вернуться в список.
    ui.attacks.markResolved(battle.id);
    if (foeChanged) void repo.saveEnemies(p).catch(() => {});
    ui.setBattle(null);
    say(
      mission
        ? t(mission.record ? "competition.record" : "competition.result", {
            n: mission.stage,
            pct: mission.pct,
            score: mission.score,
          })
        : o.won
          ? t("battle.repelled", { killed })
          : t("battle.burntDown", { from: battle.from })
    );
    core.redraw();
    ui.setSaving(true);
    try {
      // урон пишем отдельной операцией: она умеет только ухудшать карту
      const patch = await repo.applyBattle(p, o.result, battle.remote ? battle.id : undefined, o.trace);
      // в миссии писать некому: второй стороны нет
      if (battle.remote && !mission) {
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

  return { defend, afterOpener, playCompetition, finishBattle, finishScout };
}
