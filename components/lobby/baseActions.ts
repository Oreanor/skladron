// Склад целиком и кошелёк: основать, переименовать, снести, начать заново,
// взять и вернуть кредит, прокачаться. Окна закрывает лобби: здесь только
// дело, а удалось ли — видно по ответу.

import { type RefObject } from "react";
import {
  MIN_BASE_CELLS,
  STARTER_SIDE,
  fmt,
  loanDebt,
  maxLevel,
  shownLevel,
  upgradeCost,
  type UpgradeKind,
} from "@/lib/economy";
import { explain } from "@/lib/errors";
import type { Key } from "@/lib/i18n/dict";
import { normName, type Player } from "@/lib/player";
import type { LobbyCore } from "./useBaseSync";

export function baseActions(core: LobbyCore, player: RefObject<Player | null>, p: Player) {
  const { repo, t, say } = core;

  /** Основание идёт следом за именем: безымянных складов не заводим. */
  const found = async (rawName: string, intact: number, close: () => void) => {
    if (intact < MIN_BASE_CELLS) return;
    const name = normName(rawName);
    if (!name) return;
    close();
    p.name = name;
    p.founded = true;
    p.lastIncomeAt = Date.now();
    say(t("base.founded", { name }));
    core.touch();
    try {
      await repo.rename(p, name);
    } catch (e) {
      say(t("base.nameNotSaved", { error: explain(e, t) }));
    }
  };

  const rename = async (rawName: string) => {
    const name = normName(rawName);
    if (!name || name === p.name) return;
    const prev = p.name;
    p.name = name;
    core.rerender();
    try {
      await repo.rename(p, name);
      say(t("base.renamed", { name }));
    } catch (e) {
      p.name = prev; // сервер не принял — возвращаем как было
      say(t("base.renameFailed", { error: explain(e, t) }));
      core.rerender();
    }
  };

  /** Снести склад до стартового квадрата. Тексты у сноса и у краха свои. */
  const wipe = async (done: Key, failed: Key) => {
    try {
      player.current = await repo.wipe(p);
      say(t(done, { side: STARTER_SIDE }));
      core.redraw();
    } catch (e) {
      say(t(failed, { error: explain(e, t) }));
    }
  };

  /** Начать сначала: всё с нуля, кроме имени склада и списка соперников. */
  const restart = async (onReset: () => void) => {
    try {
      player.current = await repo.restart(p);
      onReset();
      say(t("restart.done"));
      core.redraw();
    } catch (e) {
      say(t("restart.failed", { error: explain(e, t) }));
    }
  };

  const takeLoan = async (amount: number) => {
    try {
      await repo.takeLoan(p, amount);
      say(t("loan.taken", { amount: fmt(amount), debt: fmt(loanDebt(amount)) }));
      core.rerender();
      return true;
    } catch (e) {
      say(t("loan.failed", { error: explain(e, t) }));
      return false;
    }
  };

  const repayLoan = async () => {
    try {
      await repo.repayLoan(p);
      say(t("loan.repaid"));
      core.rerender();
      return true;
    } catch (e) {
      say(t("loan.failed", { error: explain(e, t) }));
      return false;
    }
  };

  const upgrade = async (kind: UpgradeKind) => {
    const level = p.levels[kind];
    if (level >= maxLevel(kind)) return;
    const cost = upgradeCost(level, kind);
    if (p.credits < cost) {
      say(t("upgrade.cantAfford", { cost: fmt(cost) }));
      return;
    }
    try {
      const patch = await repo.upgrade(p, kind);
      if (patch.credits !== undefined) p.credits = patch.credits;
      p.levels = patch.levels ?? { ...p.levels, [kind]: level + 1 };
      say(t("upgrade.done", { name: t(`upgrade.${kind}` as Key), level: shownLevel(p.levels[kind]) }));
      core.rerender();
    } catch (e) {
      say(t("upgrade.failed", { error: explain(e, t) }));
      // Скорее всего наши уровни разошлись с серверными — берём его версию.
      await core.resyncBase();
    }
  };

  return { found, rename, wipe, restart, takeLoan, repayLoan, upgrade };
}
