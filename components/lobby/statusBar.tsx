"use client";

/*
 * Полоса сообщений под кнопками. Всё, что игра говорит игроку, идёт одной
 * строкой: и рамка с подтверждением, и тревога, и обычные сообщения.
 * Порядок — по тому, что сейчас важнее для рук: рамка, сообщение, пепелище,
 * основание склада, налёт, а в тишине — подсказка к инструменту.
 *
 * Полоса стоит в двух местах — над картой десктопа и под ней на телефоне —
 * поэтому отдаём не вёрстку, а цвет и содержимое: обёртку рисует лобби.
 */

import type { ReactNode } from "react";
import type { AttackOrder } from "@/lib/attack";
import type { Rect } from "@/lib/base";
import { MIN_BASE_CELLS, REPAIR_COST, STARTER_SIDE, fmt } from "@/lib/economy";
import type { Translate } from "@/lib/i18n";
import { Button } from "../ui";
import type { Tool } from "./tools";

export interface StatusBarInput {
  t: Translate;
  tool: Tool;
  /** Подсказка к выбранному инструменту — уже с числами. */
  hint: string;
  /** Рамка площади, если её тянут, — и что по ней насчитала стройка. */
  draft: { rect: Rect; cells: number; cost: number; connects: boolean; afford: boolean } | null;
  message: string | null;
  founded: boolean;
  /** Целых клеток склада. */
  intact: number;
  /** Чужие налёты в очереди — миссии сюда не входят. */
  raidsIn: AttackOrder[];
  commitDraft: () => void;
  cancelDraft: () => void;
  pickRepair: () => void;
  askRaze: () => void;
  askFound: () => void;
  defend: (order: AttackOrder) => void;
}

export function statusBar(s: StatusBarInput): { tone: string; body: ReactNode } {
  const { t, tool, draft, intact } = s;

  if (draft) {
    return {
      tone: "border-amber-700/60 bg-amber-950/30 text-amber-100",
      body: (
        <>
          <span className="font-mono">
            {t(
              tool === "scrap" ? "scrap.summary" : tool === "repair" ? "repair.summary" : "draft.summary",
              {
                w: draft.rect.w,
                h: draft.rect.h,
                cells: draft.cells,
                cost: fmt(Math.abs(draft.cost)),
              }
            )}
          </span>
          {!draft.connects && (
            <span className="text-red-400">{t(tool === "scrap" ? "scrap.splits" : "draft.gap")}</span>
          )}
          {draft.connects && !draft.afford && (
            <span className="text-red-400">{t("draft.tooExpensive")}</span>
          )}
          {(tool === "repair" || tool === "scrap") && draft.cells === 0 && (
            <span className="text-neutral-400">{t("repair.nothing")}</span>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="build"
              size="sm"
              onClick={s.commitDraft}
              disabled={!draft.connects || !draft.afford || draft.cells === 0}
            >
              {t("draft.confirm")}
            </Button>
            <Button size="sm" onClick={s.cancelDraft}>
              {t("draft.remove")}
            </Button>
          </div>
        </>
      ),
    };
  }

  if (s.message) {
    return {
      tone: "border-neutral-700 bg-neutral-900 text-neutral-200",
      body: <span className="min-w-0">{s.message}</span>,
    };
  }

  if (s.founded && intact === 0) {
    return {
      tone: "border-red-900/70 bg-red-950/30 text-red-100",
      body: (
        <>
          <span className="min-w-0">{t("burnt.notice", { cost: REPAIR_COST, side: STARTER_SIDE })}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" active={tool === "repair"} onClick={s.pickRepair}>
              {t("tool.repair")}
            </Button>
            <Button variant="danger" size="sm" onClick={s.askRaze}>
              {t("burnt.raze")}
            </Button>
          </div>
        </>
      ),
    };
  }

  if (!s.founded) {
    return {
      tone: "border-neutral-700 bg-neutral-900 text-neutral-200",
      body: (
        <>
          <span className="font-mono">
            <span className="text-neutral-400">{t("base.areaShort")} </span>
            <span className={intact >= MIN_BASE_CELLS ? "text-emerald-300" : "text-neutral-100"}>
              {intact}/{MIN_BASE_CELLS}
            </span>
          </span>
          <span className="min-w-0 truncate text-neutral-400">{t("base.drawHint")}</span>
          <Button
            variant="build"
            size="sm"
            className="ml-auto"
            onClick={s.askFound}
            disabled={intact < MIN_BASE_CELLS}
          >
            {t("base.foundShort")}
          </Button>
        </>
      ),
    };
  }

  if (s.raidsIn.length > 0) {
    const first = s.raidsIn[0];
    return {
      tone: "border-red-900/70 bg-red-950/30 text-red-100",
      body: (
        <>
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="min-w-0 truncate">
            {t("attacks.incoming", { from: first.from, drones: first.drones })}
          </span>
          <Button
            variant="danger"
            size="sm"
            className="ml-auto"
            onClick={() => s.defend(first)}
            disabled={intact === 0}
          >
            {s.raidsIn.length > 1
              ? t("attacks.defendCount", { count: s.raidsIn.length })
              : t("attacks.defend")}
          </Button>
        </>
      ),
    };
  }

  // В тишине — подсказка к инструменту.
  return {
    tone: "border-neutral-800 bg-neutral-900/40 text-neutral-500",
    body: <span className="min-w-0 truncate">{s.hint}</span>,
  };
}
