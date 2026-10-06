"use client";

/*
 * Чертежи: сохранённые раскладки склада. В панели — список с ценой
 * перестройки и кнопкой «построить», по нажатию на строку — большое окно с
 * картой, составом и разбором цены.
 *
 * Цена перестройки — разница: нынешний склад сносится и продаётся, чертёж
 * строится на его месте. Хватает денег на разницу — значит, можно строить,
 * даже если на руках меньше, чем стоит сам чертёж.
 */

import { useState, type ReactNode } from "react";
import { Hammer, Trash2 } from "lucide-react";
import { fmt } from "@/lib/economy";
import { blueprintCounts, rebuildCost, type Blueprint } from "@/lib/blueprint";
import type { Player } from "@/lib/player";
import { COLORS, installColors } from "@/lib/render";
import { Button, IconButton, Modal, inputClass } from "../ui";
import BlueprintPreview from "./BlueprintPreview";
import { useT, type Translate } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

/** Сколько чертежей видно без прокрутки: панель не должна выдавливать соседей. */
const VISIBLE = "max-h-[10.5rem]";

/** «Доплатить 1 200 кр» или «вернётся 300 кр». */
const deltaText = (t: Translate, delta: number) =>
  delta > 0
    ? t("blueprint.pay", { cost: fmt(delta) })
    : t("blueprint.refund", { cost: fmt(-delta) });

export default function BlueprintsPanel({
  list,
  player,
  onOpen,
  onBuild,
}: {
  list: Blueprint[];
  player: Player;
  onOpen: (b: Blueprint) => void;
  onBuild: (b: Blueprint) => void;
}) {
  const t = useT();
  if (!list.length) return <p className="text-neutral-500">{t("blueprint.empty")}</p>;

  return (
    <ul className={`${VISIBLE} -mr-3 space-y-0.5 overflow-y-auto overscroll-contain pr-1.5`}>
      {list.map((b) => {
        const { delta } = rebuildCost(player, b);
        const n = blueprintCounts(b);
        const afford = player.credits >= delta;
        return (
          <li
            key={b.id}
            className="flex items-center justify-between gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-neutral-800/60"
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(b)}>
              <div className="truncate font-semibold text-neutral-100">{b.name}</div>
              <div className="font-mono text-[11px] text-neutral-500">
                {t("blueprint.line", { area: fmt(n.area), installs: n.gun + n.rocket + n.spray + n.trap + n.balloon })}
                {" · "}
                <span className={afford ? "text-emerald-300" : "text-red-400"}>{deltaText(t, delta)}</span>
              </div>
            </button>
            <IconButton
              label={t("blueprint.build")}
              title={t("blueprint.build")}
              className="h-8 w-8 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!afford}
              onClick={() => onBuild(b)}
            >
              <Hammer className="h-4 w-4" />
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
}

/** Что входит в чертёж: строка легенды с цветным квадратиком, как на карте. */
const LEGEND: { key: keyof ReturnType<typeof blueprintCounts>; label: Key; color: string }[] = [
  { key: "area", label: "blueprint.area", color: COLORS.base },
  { key: "gun", label: "tool.gun", color: installColors("gun").top },
  { key: "rocket", label: "tool.rocket", color: installColors("rocket").top },
  { key: "spray", label: "tool.spray", color: installColors("spray").top },
  { key: "trap", label: "tool.trap", color: installColors("trap").top },
  { key: "balloon", label: "tool.balloon", color: installColors("balloon").top },
  { key: "drones", label: "tool.drones", color: COLORS.depot },
];

/** Карта чертежа и его состав, а под ними — то, что окну нужно сверх этого. */
function BlueprintBody({
  plan,
  children,
}: {
  plan: Pick<Blueprint, "cells" | "guns" | "depots">;
  children: ReactNode;
}) {
  const t = useT();
  const n = blueprintCounts(plan);
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <BlueprintPreview plan={plan} />
      <div className="space-y-4 text-sm">
        <div className="space-y-1">
          {LEGEND.filter((row) => row.key === "area" || n[row.key] > 0).map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-neutral-400">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/40"
                  style={{ background: row.color }}
                  aria-hidden
                />
                {t(row.label)}
              </span>
              <span className="font-mono text-neutral-100">{fmt(n[row.key])}</span>
            </div>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Большое окно чертежа: карта, состав, разбор цены и «построить». */
export function BlueprintDialog({
  blueprint,
  player,
  onBuild,
  onDelete,
  onClose,
}: {
  blueprint: Blueprint;
  player: Player;
  onBuild: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const { price, sold, delta } = rebuildCost(player, blueprint);
  const afford = player.credits >= delta;

  return (
    <Modal
      wide
      title={blueprint.name}
      subtitle={t("blueprint.hint")}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <IconButton label={t("blueprint.delete")} title={t("blueprint.delete")} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
          <Button variant="build" disabled={!afford} onClick={onBuild}>
            {t("blueprint.build")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      <BlueprintBody plan={blueprint}>
        <div className="space-y-1 border-t border-neutral-800 pt-3 font-mono text-xs">
          <div className="flex justify-between text-neutral-400">
            <span>{t("blueprint.price")}</span>
            <span className="text-neutral-200">{fmt(price)}</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>{t("blueprint.sold")}</span>
            <span className="text-neutral-200">−{fmt(sold)}</span>
          </div>
          <div className="flex justify-between pt-1 text-sm font-semibold">
            <span className="text-neutral-300">{t(delta > 0 ? "blueprint.toPay" : "blueprint.toGet")}</span>
            <span className={afford ? "text-emerald-300" : "text-red-400"}>{fmt(Math.abs(delta))}</span>
          </div>
          {!afford && (
            <p className="pt-1 text-red-400">{t("blueprint.short", { need: fmt(delta - player.credits) })}</p>
          )}
        </div>
      </BlueprintBody>
    </Modal>
  );
}

/**
 * Новый чертёж: то же большое окно, но с нынешним складом, полем имени и
 * кнопкой «добавить». Видно, что именно сохраняешь, прежде чем сохранить.
 */
export function NewBlueprintDialog({
  plan,
  player,
  defaultName,
  maxLength,
  onAdd,
  onClose,
}: {
  plan: Pick<Blueprint, "cells" | "guns" | "depots">;
  player: Player;
  defaultName: string;
  maxLength: number;
  onAdd: (name: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(defaultName);
  const ready = name.trim().length > 0;
  const { price } = rebuildCost(player, plan);

  return (
    <Modal
      wide
      title={t("blueprint.nameTitle")}
      subtitle={t("blueprint.nameHint")}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="build" disabled={!ready} onClick={() => onAdd(name)}>
            {t("blueprint.addConfirm")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      <BlueprintBody plan={plan}>
        <div className="space-y-3 border-t border-neutral-800 pt-3">
          <div className="flex justify-between font-mono text-xs text-neutral-400">
            <span>{t("blueprint.price")}</span>
            <span className="text-neutral-200">{fmt(price)}</span>
          </div>
          <input
            autoFocus
            value={name}
            maxLength={maxLength}
            aria-label={t("blueprint.nameField")}
            placeholder={t("blueprint.nameField")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) onAdd(name);
            }}
            className={`${inputClass} w-full`}
          />
        </div>
      </BlueprintBody>
    </Modal>
  );
}
