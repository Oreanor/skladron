"use client";

/*
 * Три окна, в которых тратят кредиты: прокачка, полис и заём.
 *
 * В лобби они лежали разобранными на части — тело отдельно, низ отдельно,
 * заголовок в третьем месте, — и чтобы понять, что показывает полис, надо
 * было собрать его из трёх кусков. Здесь каждое окно целиком: что пишет,
 * что предлагает нажать и когда кнопка гаснет.
 */

import {
  netCost,
  levelBonus,
  INSURANCE_CELL,
  LOAN_HOURS,
  LOAN_MIN,
  LOAN_RATE,
  LOAN_STEP,
  MAX_INSURANCE_LEVEL,
  UPGRADE_KINDS,
  fmt,
  insuranceShare,
  loanDebt,
  loanMax,
  maxLevel,
  shownLevel,
  upgradeCost,
  type UpgradeKind,
} from "@/lib/economy";
import type { Player } from "@/lib/player";
import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HANDS } from "@/lib/tuning";
import { Button, Modal, Row } from "../ui";
import { useT, type Translate } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

function upgradeEffect(t: Translate, kind: UpgradeKind, level: number): string {
  const next = level + 1;
  switch (kind) {
    case "nets":
      return t(level === 1 ? "upgrade.netsFirstEffect" : "upgrade.netsSecondEffect", { cost: netCost(next) });
    case "insurance":
      return t("insurance.covers", { share: Math.round(insuranceShare(next) * 100) });
    case "loan":
      return t("upgrade.loanEffect", { before: fmt(loanMax(level)), after: fmt(loanMax(next)) });
    case "mg": {
      const accuracy = (lv: number) => Math.round(Math.min(HANDS.mg.maxHit, HANDS.mg.hit * levelBonus(lv, HANDS.mg.perLevel)) * 100);
      return t("upgrade.mgEffect", { before: accuracy(level), after: accuracy(next) });
    }
    case "water": {
      const radius = (lv: number) => (HANDS.water.radius * levelBonus(lv, HANDS.water.perLevel)).toFixed(2);
      return t("upgrade.waterEffect", { before: radius(level), after: radius(next) });
    }
    default:
      return t(`upgrade.${kind}Effect`);
  }
}

/** Портал не обрезается прокручиваемой областью модалки. */
function UpgradeTip({ text, disabled, children }: { text: string; disabled: boolean; children: ReactNode }) {
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <span
      className="inline-flex shrink-0"
      tabIndex={disabled ? 0 : undefined}
      aria-describedby={anchor ? id : undefined}
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
      onFocus={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onBlur={() => setAnchor(null)}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAnchor(null); } }}
    >
      {children}
      {anchor && createPortal(
        <div
          id={id} role="tooltip"
          className="pointer-events-none fixed z-[60] w-64 max-w-[calc(100vw-1rem)] rounded-md border border-neutral-600 bg-neutral-950 px-3 py-2 text-xs leading-relaxed text-neutral-200 shadow-xl"
          style={{
            left: Math.max(8, Math.min(anchor.right - 256, window.innerWidth - 264)),
            ...(anchor.top > 140 ? { bottom: window.innerHeight - anchor.top + 8 } : { top: anchor.bottom + 8 }),
          }}
        >{text}</div>, document.body
      )}
    </span>
  );
}

/** Прокачка классов: уровень и цена следующего. */
export function UpgradeDialog({
  player,
  onUpgrade,
  onClose,
}: {
  player: Player;
  onUpgrade: (kind: UpgradeKind) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Modal
      title={t("tool.upgrade")}
      onClose={onClose}
      footer={
        <Button variant="build" onClick={onClose}>
          {t("common.ok")}
        </Button>
      }
    >
      {!player.founded ? (
        <p className="text-neutral-500">{t("base.foundFirst")}</p>
      ) : (
        <div className="space-y-2">
          {UPGRADE_KINDS.map((kind) => {
            const level = player.levels[kind];
            const maxed = level >= maxLevel(kind);
            const cost = upgradeCost(level, kind);
            return (
              <div key={kind} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-neutral-200">
                  {t(`upgrade.${kind}` as Key)}
                  <span className="ml-2 font-mono text-xs text-amber-300">
                    {t("upgrade.level", { level: shownLevel(level) })}
                  </span>
                </span>
                <UpgradeTip text={maxed ? t("upgrade.max") : upgradeEffect(t, kind, level)} disabled={maxed || player.credits < cost}>
                <Button
                  variant="build"
                  size="sm"
                  disabled={maxed || player.credits < cost}
                  onClick={() => onUpgrade(kind)}
                >
                  {maxed ? t("upgrade.max") : t("upgrade.buy", { cost: fmt(cost) })}
                </Button>
                </UpgradeTip>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/** Полис: что покрывает сейчас и что добавит следующий уровень. */
export function InsuranceDialog({
  player,
  onUpgrade,
  onClose,
}: {
  player: Player;
  onUpgrade: (kind: UpgradeKind) => void;
  onClose: () => void;
}) {
  const t = useT();
  const level = player.levels.insurance;
  const canUpgrade = level < MAX_INSURANCE_LEVEL;
  const cost = upgradeCost(level, "insurance");

  return (
    <Modal
      title={`${t("tool.insurance")} · ${t("upgrade.level", { level: shownLevel(level) })}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          {canUpgrade && (
            <Button
              variant="build"
              disabled={player.credits < cost}
              onClick={() => onUpgrade("insurance")}
            >
              {t("upgrade.buy", { cost: fmt(cost) })}
            </Button>
          )}
          <Button variant={canUpgrade ? "outline" : "build"} onClick={onClose}>
            {t("common.ok")}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm text-neutral-300">
        <p>{t("insurance.cells", { cost: INSURANCE_CELL })}</p>
        <p>
          {level > 1
            ? t("insurance.covers", { share: Math.round(insuranceShare(level) * 100) })
            : t("insurance.basic")}
        </p>
        <p className="text-neutral-500">
          {canUpgrade
            ? t("insurance.next", {
                share: Math.round(insuranceShare(level + 1) * 100),
                cost: fmt(cost),
              })
            : t("insurance.full")}
        </p>
      </div>
    </Modal>
  );
}

/** Заём: пока не взят — сколько брать, взят — сколько осталось до возврата. */
export function LoanDialog({
  player,
  now,
  amount,
  onAmount,
  onTake,
  onRepay,
  onClose,
}: {
  player: Player;
  /** Часы идут снаружи: по ним же лобби считает срок в других местах. */
  now: number;
  amount: number;
  onAmount: (value: number) => void;
  onTake: () => void;
  onRepay: (amount: number) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const owed = player.loan > 0;
  const [repayment, setRepayment] = useState(0);
  const [repaying, setRepaying] = useState(false);
  const pay = Math.min(repayment, player.loan);
  const repay = async () => {
    if (repaying || pay < 1 || pay > player.credits) return;
    setRepaying(true);
    try { await onRepay(pay); setRepayment(0); }
    finally { setRepaying(false); }
  };
  // Потолок — по уровню кредита; поднимается в окне прокачки.
  const max = loanMax(player.levels.loan);
  // лимит мог стать меньше выбранного разве что при сбое — не даём просить больше
  const asked = Math.min(amount, max);

  /** Сколько осталось до возврата — часами и минутами. */
  const left = () => {
    const total = Math.max(0, Math.ceil(((player.loanDue ?? 0) - now) / 60000));
    return t("loan.left", {
      h: Math.floor(total / 60),
      m: String(total % 60).padStart(2, "0"),
    });
  };

  return (
    <Modal
      title={t("loan.title")}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          {owed ? (
            <Button
              variant="build"
              disabled={repaying || pay < 1 || player.credits < pay}
              onClick={() => void repay()}
            >
              {t("loan.repay", { debt: fmt(pay) })}
            </Button>
          ) : (
            <Button variant="build" onClick={onTake}>
              {t("loan.take", { amount: fmt(asked) })}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t(owed ? "common.ok" : "common.cancel")}
          </Button>
        </div>
      }
    >
      {owed ? (
        <div className="space-y-2 text-sm text-neutral-300">
          <p>{t("loan.owed", { debt: fmt(player.loan) })}</p>
          <input type="range" min={0} max={player.loan} step={1} value={pay}
            disabled={repaying} onChange={(e) => setRepayment(Number(e.target.value))}
            aria-label={t("loan.repayment")} className="h-8 w-full cursor-pointer accent-emerald-500" />
          <div className="flex justify-between font-mono text-xs text-neutral-500"><span>0</span><span>{fmt(player.loan)}</span></div>
          <p className="font-mono text-neutral-400">{left()}</p>
          <p className="text-neutral-500">{t("loan.overdue", { rate: LOAN_RATE })}</p>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-neutral-300">
          <p className="text-neutral-400">
            {t("loan.explain", { hours: LOAN_HOURS, rate: LOAN_RATE })}
          </p>
          <input
            type="range"
            min={LOAN_MIN}
            max={max}
            step={LOAN_STEP}
            value={asked}
            onChange={(e) => onAmount(Number(e.target.value))}
            className="h-8 w-full cursor-pointer accent-emerald-500"
            aria-label={t("loan.amount")}
          />
          <div className="-mt-2 flex justify-between font-mono text-xs text-neutral-500">
            <span>{fmt(LOAN_MIN)}</span>
            <span>{fmt(max)}</span>
          </div>
          <dl className="space-y-1 font-mono">
            <Row label={t("loan.amount")} value={fmt(asked)} />
            <Row label={t("loan.debt")} value={fmt(loanDebt(asked))} />
          </dl>
        </div>
      )}
    </Modal>
  );
}
