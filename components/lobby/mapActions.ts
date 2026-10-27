// Что делает рука на карте склада: стройка, ремонт, снос, установки,
// контейнеры, перетаскивание и продажа. Сами правила — в lib/build; здесь
// только то, чего стройка не знает: сказать игроку, показать ценник,
// сохранить и откатить, если сервер не принял.

import { DRONES_PER_CELL, type GunKind, type Rect } from "@/lib/base";
import {
  applyDraft,
  buildOne as buildCell,
  moveDepot as shiftDepot,
  moveGun as shiftGun,
  placeDepot,
  placeGun,
  repairAt as repairCell,
  scrapAt as scrapCell,
  type BuildResult,
} from "@/lib/build";
import { goodsValue, installValue } from "@/lib/blueprint";
import { SCRAP_REWARD, fmt } from "@/lib/economy";
import { explain } from "@/lib/errors";
import type { Player } from "@/lib/player";
import { pushPriceTag, type MapRefs } from "./mapInput";
import type { Tool } from "./tools";
import type { LobbyCore } from "./useBaseSync";

export function mapActions(
  core: LobbyCore,
  p: Player,
  map: MapRefs,
  {
    tool,
    draftRect,
    draftCells,
    hasBuilding,
  }: {
    tool: Tool;
    draftRect: Rect | null;
    /** Сколько клеток в рамке сейчас — по ним и сообщение. */
    draftCells: number;
    hasBuilding: boolean;
  }
) {
  const { repo, t, say } = core;
  // Рамкой работают «Площадь», «Ремонт» и «Снос»; остальным — площадь.
  const draftTool = tool === "area" || tool === "repair" || tool === "scrap" ? tool : "area";

  /** «−100 кр» над клеткой: видно, за что ушли деньги, и куда вернулись. */
  const showPrice = (x: number, y: number, amount: number) => pushPriceTag(map, t, x, y, amount);

  /**
   * Делает то, что сказала стройка: отказ показывает словами, согласие
   * сохраняет. Дальше остаётся только то, чего стройка не знает, —
   * всплывающий ценник над клеткой да перерисовка.
   */
  const act = (r: BuildResult, at?: { x: number; y: number }) => {
    if (!r.ok) {
      say(t(r.why, r.vars));
      return false;
    }
    if (r.spent === 0) return true;
    if (at) showPrice(at.x, at.y, -r.spent);
    core.touch();
    return true;
  };

  const commitDraft = () => {
    if (!draftRect || draftRect.w <= 0 || draftRect.h <= 0) return;
    const before = draftCells;
    const r = applyDraft(p, draftTool, draftRect, hasBuilding);
    if (!r.ok) {
      say(t(r.why, r.vars ? { cost: fmt(Number(r.vars.cost)) } : undefined));
      return;
    }
    if (before > 0) {
      say(
        tool === "scrap"
          ? t("scrap.done", { cells: before, gain: fmt(before * SCRAP_REWARD) })
          : tool === "repair"
            ? t("repair.done", { cells: before, cost: fmt(r.spent) })
            : t("draft.built", { cells: before, cost: fmt(r.spent) })
      );
    }
    map.draft.current = null;
    map.drag.current = null;
    if (before > 0) core.touch();
    else core.rerender();
  };

  const buildOne = (x: number, y: number) => {
    act(buildCell(p, x, y, hasBuilding));
  };

  const scrapAt = (x: number, y: number) => {
    act(scrapCell(p, x, y), { x, y });
  };

  const repairAt = (x: number, y: number) => {
    act(repairCell(p, x, y));
  };

  const gunAt = (x: number, y: number, kind: GunKind = "gun") => {
    act(placeGun(p, x, y, kind), { x, y });
  };

  /**
   * Контейнер покупается прямо на карте, как пушка: ткнул в свободную клетку —
   * появился ящик, деньги списались. Ставим сразу, не дожидаясь сервера, а
   * откажет — возвращаем как было.
   */
  const buyDepotAt = async (x: number, y: number) => {
    const previousDepots = p.depots;
    const previousCredits = p.credits;
    if (!act(placeDepot(p, x, y), { x, y })) return;
    if (p.depots === previousDepots) return; // клетка уже занята своим же ящиком

    core.redraw();
    try {
      const patch = await repo.buyDepot(p, DRONES_PER_CELL);
      if (patch.credits !== undefined) p.credits = patch.credits;
      core.rerender();
    } catch (e) {
      p.depots = previousDepots;
      p.credits = previousCredits;
      core.redraw();
      say(t("arsenal.buyFailed", { error: explain(e, t) }));
    }
  };

  /** Перетаскивание контейнера на свободную клетку. Ничего не стоит. */
  const moveDepot = (from: { cx: number; cy: number }, x: number, y: number) => {
    if (act(shiftDepot(p, from, x, y))) core.touch();
  };

  /** Перетаскивание установки на другую целую клетку. Тоже даром. */
  const moveGun = (from: { cx: number; cy: number; kind: GunKind }, x: number, y: number) => {
    if (act(shiftGun(p, from, x, y))) core.touch();
  };

  /**
   * Двойной тап по установке или ящику — продать по номиналу, то есть по
   * нынешней цене закупки. Установка уходит обычным сохранением склада:
   * сервер сам видит, что её не стало, и возвращает цену. Ящик продаётся
   * отдельно: вне покупки число дронов сохранением менять нельзя.
   */
  const sellAt = async (x: number, y: number) => {
    const gun = p.guns.find((g) => g.cx === x && g.cy === y);
    if (gun) {
      const gain = installValue([gun], p.levels);
      p.guns = p.guns.filter((g) => g !== gun);
      p.credits += gain;
      showPrice(x, y, gain);
      core.touch();
      return;
    }
    const depot = p.depots.find((d) => d.cx === x && d.cy === y);
    if (!depot) return;
    await core.flushPersist();
    const previousDepots = p.depots;
    const previousCredits = p.credits;
    const gain = goodsValue([depot], p.levels);
    p.depots = p.depots.filter((d) => d !== depot);
    p.credits += gain;
    showPrice(x, y, gain);
    core.redraw();
    try {
      const patch = await repo.sellDepot(p, x, y);
      if (patch.credits !== undefined) p.credits = patch.credits;
      core.rerender();
    } catch (e) {
      p.depots = previousDepots;
      p.credits = previousCredits;
      core.refreshMap();
      say(t("sell.failed", { error: explain(e, t) }));
    }
  };

  return {
    commitDraft,
    buildOne,
    scrapAt,
    repairAt,
    gunAt,
    buyDepotAt,
    moveDepot,
    moveGun,
    sellAt,
  };
}
