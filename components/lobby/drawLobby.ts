/*
 * Что лобби рисует поверх карты каждый кадр: круги того, что ставят,
 * контейнеры, рамку площади, свободные клетки, перетаскиваемое, клетку под
 * курсором, обводку выбранного, ценники и подпись при наведении.
 *
 * Чистое рисование: ничего не меняет, кроме очереди ценников, которую
 * возвращает уже без догоревших.
 */

import {
  drawCoverage,
  drawDepots,
  drawHoverLabel,
  drawRocket,
  drawSpray,
  drawTrap,
  drawTurret,
  type CoverageKind,
  type View,
} from "@/lib/render";
import { balloonRange, gunRange, rocketRange, sprayRange, trapRange } from "@/lib/engine";
import {
  GRID,
  G_BASE,
  G_BURNT,
  gunKind,
  idx,
  isBuilding,
  normRect,
  touchesBuilding,
} from "@/lib/base";
import type { Player } from "@/lib/player";
import type { Translate } from "@/lib/i18n";
import {
  drawDraft,
  drawDropTarget,
  drawFreeCells,
  drawHoverCell,
  drawPicked,
  drawPriceTags,
  dropAllowed,
  onMap,
} from "./overlay";
import { DOUBLE_TAP, type MapRefs } from "./mapInput";
import { isBuildKind, type Tool } from "./tools";

/** Клетка карты лобби в пикселях холста. */
const CELL = 7;

export interface LobbyScene {
  p: Player;
  tool: Tool;
  m: MapRefs;
  /** Галочка «зоны действия»: без неё кругов нет совсем, даже у того, что ставят. */
  zones: boolean;
  /** Рамки хватает денег и она пристыкована к складу — красить ли её красным. */
  draftAfford: boolean;
  draftConnects: boolean;
  /** На карте уже есть склад: новая площадь обязана к нему примыкать. */
  hasBuilding: boolean;
  t: Translate;
}

/**
 * Где на складе уже стоит то, что сейчас выбрано. Подсвечиваем только
 * предметы: у площади, ремонта и сноса подсвечивать нечего — они работают
 * по клеткам, а не по объектам.
 */
function pickedSpots({ p, tool }: LobbyScene): { cx: number; cy: number }[] {
  if (isBuildKind(tool)) return p.guns.filter((g) => gunKind(g) === tool);
  if (tool === "drones") return p.depots;
  return [];
}

/**
 * Чьи круги покрытия сейчас уместны. Выбран инструмент установки — её и
 * показываем; тащим готовую — показываем круги её рода. В остальное время
 * ничьи: втроём они закрывают склад так, что на нём ничего не разобрать.
 */
function coverageFor(s: LobbyScene): CoverageKind[] {
  const { p, tool, m } = s;
  if (!s.zones) return [];
  if (isBuildKind(tool)) return [tool];
  const from = m.dragGun.current ?? tapped(s, "gun");
  if (!from) return [];
  const g = p.guns.find((item) => item.cx === from.cx && item.cy === from.cy);
  return g ? [gunKind(g)] : [];
}

/**
 * Что тапнули только что и ждут второго тапа двойного клика. Предмет уже
 * отпустили, но подсветку, как при перетаскивании, не гасим: иначе она
 * мигает на каждом клике.
 */
function tapped({ p, m }: LobbyScene, what: "gun" | "depot") {
  const tap = m.lastTap.current;
  if (!tap || performance.now() - tap.at >= DOUBLE_TAP) return null;
  const list: { cx: number; cy: number }[] = what === "gun" ? p.guns : p.depots;
  return list.find((q) => q.cx === tap.x && q.cy === tap.y) ?? null;
}

/** Подпись над установкой или контейнером под курсором. */
function hoverLabel({ p, t }: LobbyScene, hx: number, hy: number): string | null {
  const gun = p.guns.find((g) => g.cx === hx && g.cy === hy);
  if (gun) {
    switch (gunKind(gun)) {
      case "spray":
        return t("tool.spray");
      case "trap":
        return t("tool.trap");
      case "rocket":
        return t("tool.rocket");
      case "balloon":
        return t("tool.balloon");
      default:
        return t("tool.gun");
    }
  }
  const depot = p.depots.find((item) => item.cx === hx && item.cy === hy);
  if (depot) return t("map.hover.drones", { n: depot.n });
  return null;
}

export function drawLobbyOverlay(
  ctx: CanvasRenderingContext2D,
  frameNow: number,
  view: View | undefined,
  s: LobbyScene
) {
  const { p, tool, m } = s;

  // Круги показываем только у того, что сейчас ставят: втроём они
  // закрывают склад так, что на нём уже ничего не разобрать. Дальность
  // берём прокачанную, иначе не видно, что дал апгрейд.
  drawCoverage(
    ctx,
    p.guns,
    CELL,
    gunRange({ gunLevel: p.levels.guns }),
    sprayRange({ sprayLevel: p.levels.sprays }),
    trapRange({ trapLevel: p.levels.traps }),
    rocketRange({ rocketLevel: p.levels.rockets }),
    balloonRange({ balloonLevel: p.levels.balloons }),
    coverageFor(s)
  );

  const draggedDepot = m.dragDepot.current;
  drawDepots(
    ctx,
    draggedDepot
      ? p.depots.filter((item) => item.cx !== draggedDepot.cx || item.cy !== draggedDepot.cy)
      : p.depots,
    CELL
  );

  const d = m.draft.current ? normRect(m.draft.current) : null;
  if (d) {
    drawDraft(ctx, CELL, d, {
      cells: p.cells,
      burntOnly: tool === "repair" || tool === "scrap" ? tool : undefined,
      // У сноса «соединяет» и значит «не разорвёт склад» — одна и та же
      // проверка, второй флаг ей не нужен.
      scrapWhole: tool !== "scrap" || s.draftConnects,
      afford: s.draftAfford,
      connects: s.draftConnects,
    });
  }

  const hover = m.hover.current;
  const hx = hover ? Math.floor(hover.x) : -1;
  const hy = hover ? Math.floor(hover.y) : -1;

  // Установки и контейнеры переставляются одинаково: тянем и роняем. Видно
  // и куда можно, и куда нельзя.
  const placing = isBuildKind(tool) || m.dragGun.current || tapped(s, "gun");
  const stacking =
    tool === "drones" || draggedDepot || tapped(s, "depot");
  if (placing || stacking) {
    drawFreeCells(
      ctx,
      CELL,
      p.cells,
      p.guns,
      p.depots,
      placing ? "rgba(140, 215, 255, 0.16)" : "rgba(214, 168, 92, 0.18)"
    );
  }

  const dragged = m.dragGun.current ?? draggedDepot;
  if (dragged && hover) {
    const ok = dropAllowed(p.cells, p.guns, p.depots, hx, hy, dragged);
    // контейнер тащим вместе с его содержимым: видно, что именно несёшь
    if (draggedDepot) {
      const source = p.depots.find(
        (item) => item.cx === draggedDepot.cx && item.cy === draggedDepot.cy
      );
      if (source) drawDepots(ctx, [{ ...source, cx: hx, cy: hy }], CELL, !ok);
    }
    const from = m.dragGun.current;
    if (from) {
      const source = p.guns.find(
        (g) => g.cx === from.cx && g.cy === from.cy && gunKind(g) === from.kind
      );
      if (source) {
        const px = onMap(hx, hy) ? hx : from.cx;
        const py = onMap(hx, hy) ? hy : from.cy;
        const angle = Math.atan2(py + 0.5 - GRID / 2, px + 0.5 - GRID / 2);
        switch (gunKind(source)) {
          case "spray":
            drawSpray(ctx, px, py, CELL, angle, 0, ok);
            break;
          case "trap":
            drawTrap(ctx, px, py, CELL, ok);
            break;
          case "rocket":
            drawRocket(ctx, px, py, CELL, angle, ok);
            break;
          default:
            drawTurret(ctx, px, py, CELL, angle, ok);
            break;
        }
      }
    }
    drawDropTarget(ctx, CELL, hx, hy, ok, m.dragGun.current ? "#8ecae6" : "#f5c56f");
  } else if (hover) {
    // между кликами двойного клика рамка под предметом тоже не гаснет
    const gun = tapped(s, "gun");
    const box = gun ?? tapped(s, "depot");
    if (box && box.cx === hx && box.cy === hy) {
      drawDropTarget(ctx, CELL, hx, hy, true, gun ? "#8ecae6" : "#f5c56f");
    }
  }

  // Клетка под курсором — сработает тут инструмент или нет. При раскладке
  // контейнеров не рисуем: там уже подсвечены все свободные клетки.
  if (hover && !d && onMap(hx, hy) && tool !== "drones") {
    const v = p.cells[idx(hx, hy)];
    let ok = false;
    switch (tool) {
      case "area":
        ok = !isBuilding(v) && (!s.hasBuilding || touchesBuilding(p.cells, hx, hy));
        break;
      case "repair":
        ok = v === G_BURNT;
        break;
      case "gun":
      case "spray":
      case "trap":
      case "rocket":
        ok = v === G_BASE && !p.depots.some((q) => q.cx === hx && q.cy === hy);
        break;
    }
    drawHoverCell(ctx, CELL, hx, hy, ok);
  }

  // Выбранную категорию обводим: иначе среди пёстрой карты не найти, есть
  // ли у тебя разведка и где она стоит.
  drawPicked(ctx, CELL, pickedSpots(s), frameNow);

  m.priceTags.current = drawPriceTags(ctx, CELL, m.priceTags.current, frameNow);

  // Подпись только у установок и контейнеров: землю подписывать нечем.
  if (hover && onMap(hx, hy)) {
    const label = hoverLabel(s, hx, hy);
    if (label) drawHoverLabel(ctx, CELL, hx, hy, label, view?.zoom ?? 1);
  }
}
