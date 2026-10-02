"use client";

/*
 * Руки на карте лобби: рамка площади, перетаскивание пушек и контейнеров,
 * тапы инструментом, всплывающие ценники.
 *
 * Состояние руки живёт в refs, а не в React: мышь двигается чаще, чем
 * стоит перерисовывать лобби, и карта рисует рамку прямо из ref каждый
 * кадр. React зовут только тогда, когда меняется что-то видимое вне карты.
 *
 * Refs заводит хук (он обязан звучать до ранних return лобби), а
 * обработчики собирает обычная функция: им нужны действия стройки, которые
 * лобби объявляет уже после этих return.
 */

import { useRef } from "react";
import { fmt } from "@/lib/economy";
import { normRect, gunKind, type DepotKind, type GunKind, type Rect } from "@/lib/base";
import type { Player } from "@/lib/player";
import type { Translate } from "@/lib/i18n";
import type { Pt } from "../MapCanvas";
import type { PriceTag } from "./overlay";
import { isBuildKind, type Tool } from "./tools";

/** Что сейчас делает рука с рамкой: тянет новую, двигает или тянет уголок. */
export interface Drag {
  mode: "create" | "move" | "resize";
  corner: number;
  startX: number;
  startY: number;
  origin: Rect;
  moved: boolean;
}

export function useMapRefs() {
  return {
    /** Заготовка площади — рамка, которую ещё не утвердили. */
    draft: useRef<Rect | null>(null),
    drag: useRef<Drag | null>(null),
    hover: useRef<Pt | null>(null),
    /** Ценники, всплывающие над клеткой в момент покупки. */
    priceTags: useRef<PriceTag[]>([]),
    /** Последняя нарисованная рамка: по ней решаем, нужен ли React-рендер. */
    draftKey: useRef(""),
    painting: useRef(false),
    /** Контейнер и установка, которые сейчас тащат. */
    dragDepot: useRef<{ cx: number; cy: number } | null>(null),
    dragGun: useRef<{ cx: number; cy: number; kind: GunKind } | null>(null),
    /** Прошлый тап по установке или ящику: второй подряд по той же клетке продаёт. */
    lastTap: useRef<{ x: number; y: number; at: number } | null>(null),
  };
}

export type MapRefs = ReturnType<typeof useMapRefs>;

/** «−100 кр» над клеткой: видно, за что ушли деньги, и куда вернулись. */
export function pushPriceTag(m: MapRefs, t: Translate, x: number, y: number, amount: number) {
  m.priceTags.current.push({
    x,
    y,
    text: `${amount < 0 ? "−" : "+"}${fmt(Math.abs(amount))} ${t("battle.creditsSuffix")}`,
    gain: amount > 0,
    at: performance.now(),
  });
}

const cellOf = (pt: Pt) => ({ x: Math.floor(pt.x), y: Math.floor(pt.y) });

/** Какой уголок рамки под курсором: 0…3, или −1. */
function cornerNear(r: Rect, pt: Pt) {
  const corners: [number, number][] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(corners[i][0] - pt.x) < 2.5 && Math.abs(corners[i][1] - pt.y) < 2.5) return i;
  }
  return -1;
}

/** Что умеет лобби — обработчики только решают, что из этого позвать. */
export interface MapActions {
  p: Player;
  tool: Tool;
  /** Инструмент работает рамкой: площадь, ремонт, снос. */
  drafting: boolean;
  /** Перерисовать лобби: что-то видимое поменялось вне карты. */
  rerender: () => void;
  buildOne: (x: number, y: number) => void;
  repairAt: (x: number, y: number) => void;
  scrapAt: (x: number, y: number) => void;
  gunAt: (x: number, y: number, kind: GunKind) => void;
  buyDepotAt: (x: number, y: number, kind: DepotKind) => Promise<void>;
  moveDepot: (from: { cx: number; cy: number }, x: number, y: number) => void;
  moveGun: (from: { cx: number; cy: number; kind: GunKind }, x: number, y: number) => void;
  /** Продать установку или контейнер с этой клетки по номиналу. */
  sellAt: (x: number, y: number) => void;
  commitDraft: () => void;
}

/** Сколько ждём второго тапа, мс. */
export const DOUBLE_TAP = 400;

export function mapHandlers(m: MapRefs, a: MapActions) {
  const { p, tool, drafting, rerender } = a;

  const onDown = (pt: Pt, button: number) => {
    if (button !== 0) return;
    const c = cellOf(pt);

    // Уголок рамки главнее всего: он маленький, специально под курсором, и
    // рядом с ним вполне может стоять пушка.
    const rect = drafting && m.draft.current ? normRect(m.draft.current) : null;
    if (rect) {
      const corner = cornerNear(rect, pt);
      if (corner >= 0) {
        m.drag.current = { mode: "resize", corner, startX: pt.x, startY: pt.y, origin: rect, moved: false };
        return;
      }
    }

    // Что стоит на складе, то и берётся мышкой — в любом режиме. Иначе
    // непонятно, почему пушка тащится при одной кнопке и не тащится при другой.
    const depot = p.depots.find((q) => q.cx === c.x && q.cy === c.y);
    if (depot) {
      m.dragDepot.current = { cx: depot.cx, cy: depot.cy };
      rerender();
      return;
    }
    const gun = p.guns.find((q) => q.cx === c.x && q.cy === c.y);
    if (gun) {
      m.dragGun.current = { cx: gun.cx, cy: gun.cy, kind: gunKind(gun) };
      rerender();
      return;
    }

    if (tool === "drones" || tool === "balloons") {
      void a.buyDepotAt(c.x, c.y, tool === "balloons" ? "balloon" : "basic");
      return;
    }
    if (isBuildKind(tool)) {
      a.gunAt(c.x, c.y, tool);
      return;
    }
    if (!drafting) return;

    const cur = m.draft.current ? normRect(m.draft.current) : null;
    if (cur) {
      const corner = cornerNear(cur, pt);
      if (corner >= 0) {
        m.drag.current = { mode: "resize", corner, startX: pt.x, startY: pt.y, origin: cur, moved: false };
        return;
      }
      if (pt.x >= cur.x && pt.x <= cur.x + cur.w && pt.y >= cur.y && pt.y <= cur.y + cur.h) {
        m.drag.current = { mode: "move", corner: -1, startX: pt.x, startY: pt.y, origin: cur, moved: false };
        return;
      }
    }
    m.draft.current = { x: Math.floor(pt.x), y: Math.floor(pt.y), w: 0, h: 0 };
    m.drag.current = {
      mode: "create",
      corner: -1,
      startX: pt.x,
      startY: pt.y,
      origin: { x: Math.floor(pt.x), y: Math.floor(pt.y), w: 0, h: 0 },
      moved: false,
    };
  };

  const onMove = (pt: Pt) => {
    m.hover.current = pt;
    const drag = m.drag.current;
    if (!drag || !drafting) return;
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) drag.moved = true;

    switch (drag.mode) {
      case "create":
        m.draft.current = {
          x: drag.origin.x,
          y: drag.origin.y,
          w: Math.round(pt.x - drag.origin.x),
          h: Math.round(pt.y - drag.origin.y),
        };
        break;
      case "move":
        m.draft.current = {
          x: drag.origin.x + Math.round(dx),
          y: drag.origin.y + Math.round(dy),
          w: drag.origin.w,
          h: drag.origin.h,
        };
        break;
      default: {
        const o = drag.origin;
        let x0 = o.x;
        let y0 = o.y;
        let x1 = o.x + o.w;
        let y1 = o.y + o.h;
        if (drag.corner === 0 || drag.corner === 2) x0 = Math.round(pt.x);
        else x1 = Math.round(pt.x);
        if (drag.corner === 0 || drag.corner === 1) y0 = Math.round(pt.y);
        else y1 = Math.round(pt.y);
        m.draft.current = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        break;
      }
    }
    // Рамку каждый кадр рисует overlay прямо из ref. React нужен только
    // ради цифр в подсказке — а они меняются, лишь когда рамка сменила
    // клетки, а не на каждый пиксель мыши.
    const r = m.draft.current;
    const key = r ? `${r.x}|${r.y}|${r.w}|${r.h}` : "";
    if (key !== m.draftKey.current) {
      m.draftKey.current = key;
      rerender();
    }
  };

  /**
   * Взял и отпустил на той же клетке — это тап. Второй тап по ней же подряд
   * продаёт то, что на ней стоит.
   */
  const tapped = (x: number, y: number) => {
    const now = performance.now();
    const last = m.lastTap.current;
    if (last && last.x === x && last.y === y && now - last.at < DOUBLE_TAP) {
      m.lastTap.current = null;
      a.sellAt(x, y);
      return;
    }
    m.lastTap.current = { x, y, at: now };
  };

  const onUp = (pt: Pt) => {
    m.painting.current = false;

    const fromDepot = m.dragDepot.current;
    if (fromDepot) {
      m.dragDepot.current = null;
      const c = cellOf(pt);
      if (c.x !== fromDepot.cx || c.y !== fromDepot.cy) a.moveDepot(fromDepot, c.x, c.y);
      else tapped(c.x, c.y);
      rerender();
      return;
    }
    const fromGun = m.dragGun.current;
    if (fromGun) {
      m.dragGun.current = null;
      const c = cellOf(pt);
      // Отпустил там же, откуда взял — это тап, а не перенос.
      if (c.x !== fromGun.cx || c.y !== fromGun.cy) a.moveGun(fromGun, c.x, c.y);
      else tapped(c.x, c.y);
      rerender();
      return;
    }
    const drag = m.drag.current;
    if (!drag || !drafting) return;
    m.drag.current = null;

    if (drag.mode === "create" && !drag.moved) {
      // одиночный тап: достраиваем или чиним ровно одну клетку
      m.draft.current = null;
      const c = cellOf(pt);
      if (tool === "repair") a.repairAt(c.x, c.y);
      else if (tool === "scrap") a.scrapAt(c.x, c.y);
      else a.buildOne(c.x, c.y);
      return;
    }
    if (drag.mode !== "create" && !drag.moved) {
      a.commitDraft(); // клик по заготовке утверждает её
      return;
    }
    rerender();
  };

  const onRightClick = () => {
    if (drafting && m.draft.current) {
      m.draft.current = null;
      m.drag.current = null;
      rerender();
    }
  };

  const onLeave = () => {
    m.hover.current = null;
    m.painting.current = false;
  };

  return { onDown, onMove, onUp, onRightClick, onLeave };
}
