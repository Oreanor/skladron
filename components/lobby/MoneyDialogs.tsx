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
  INSURANCE_CELL,
  LOAN_HOURS,
  LOAN_MAX,
  LOAN_MIN,
  LOAN_RATE,
  LOAN_STEP,
  MAX_INSURANCE_LEVEL,
  UPGRADE_KINDS,
  fmt,
  insuranceShare,
  loanDebt,
  maxLevel,
  shownLevel,
  upgradeCost,
  type UpgradeKind,
} from "@/lib/economy";
import type { Player } from "@/lib/player";
import { Button, Modal, Row } from "../ui";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

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
                <Button
                  variant="build"
                  size="sm"
                  disabled={maxed || player.credits < cost}
                  onClick={() => onUpgrade(kind)}
                >
                  {maxed ? t("upgrade.max") : t("upgrade.buy", { cost: fmt(cost) })}
                </Button>
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
  onRepay: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const owed = player.loan > 0;

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
              disabled={player.credits < player.loan}
              onClick={onRepay}
            >
              {t("loan.repay", { debt: fmt(player.loan) })}
            </Button>
          ) : (
            <Button variant="build" onClick={onTake}>
              {t("loan.take", { amount: fmt(amount) })}
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
            max={LOAN_MAX}
            step={LOAN_STEP}
            value={amount}
            onChange={(e) => onAmount(Number(e.target.value))}
            className="h-8 w-full cursor-pointer accent-emerald-500"
            aria-label={t("loan.amount")}
          />
          <dl className="space-y-1 font-mono">
            <Row label={t("loan.amount")} value={fmt(amount)} />
            <Row label={t("loan.debt")} value={fmt(loanDebt(amount))} />
          </dl>
        </div>
      )}
    </Modal>
  );
}
