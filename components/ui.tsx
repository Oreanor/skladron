"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { fmt } from "@/lib/economy";
import { useT } from "@/lib/i18n";

/*
 * Общая мелочь интерфейса. Правило простое: цвет означает смысл, а не вкус.
 *   emerald — постройка и подтверждение,
 *   red     — атака и опасность,
 *   amber   — временный режим (раскладка контейнеров),
 *   светлый — нейтральное завершение (купить, закрыть, вернуться),
 *   обводка — второстепенное.
 * Размеры на телефоне крупнее, чем на десктопе: это зашито в сами размеры,
 * чтобы каждая кнопка не дописывала себе lg:py-*.
 */

type Variant = "build" | "danger" | "neutral" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";
type Tone = "emerald" | "red" | "amber";

const BASE =
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-md " +
  "font-semibold transition focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-neutral-400 disabled:cursor-not-allowed";

const VARIANTS: Record<Variant, string> = {
  build:
    "bg-emerald-500 text-emerald-950 hover:bg-emerald-400 " +
    "disabled:bg-neutral-800 disabled:text-neutral-500",
  danger:
    "bg-red-600 text-white hover:bg-red-500 " +
    "disabled:bg-neutral-800 disabled:text-neutral-500",
  neutral:
    "bg-neutral-100 text-neutral-900 hover:bg-white " +
    "disabled:bg-neutral-800 disabled:text-neutral-500",
  outline:
    "border border-neutral-700 text-neutral-300 hover:bg-neutral-800 " +
    "active:bg-neutral-800 disabled:opacity-40",
  ghost: "text-neutral-500 hover:text-neutral-200 disabled:opacity-40",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-2 text-xs lg:py-1.5",
  md: "px-4 py-3 text-sm lg:py-2",
  lg: "px-5 py-3.5 text-sm lg:py-3",
};

/** Включённое состояние кнопки-переключателя. */
const ACTIVE: Record<Tone, string> = {
  emerald: "border-emerald-500 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20",
  red: "border-red-500 bg-red-500/15 text-red-200 hover:bg-red-500/20",
  amber: "border-amber-500 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Кнопка-переключатель во включённом состоянии (поверх outline). */
  active?: boolean;
  tone?: Tone;
  block?: boolean;
}

export function Button({
  variant = "outline",
  size = "md",
  active = false,
  tone = "emerald",
  block = false,
  className = "",
  ...rest
}: ButtonProps) {
  const look = active ? `border ${ACTIVE[tone]}` : VARIANTS[variant];
  return (
    <button
      {...rest}
      className={`${BASE} ${SIZES[size]} ${look} ${block ? "w-full" : ""} ${className}`}
    />
  );
}

/** Квадратная кнопка с иконкой — шапка телефона, углы карты. */
export function IconButton({
  label,
  badge,
  round = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  badge?: number;
  round?: boolean;
}) {
  return (
    <button
      {...rest}
      aria-label={label}
      className={`relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center border border-neutral-700 bg-neutral-900/60 text-neutral-300 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
        round ? "rounded-full" : "rounded-md"
      } ${className}`}
    >
      {children}
      {badge ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/** Заголовок секции — один и тот же в панелях, шторках и меню. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs uppercase tracking-widest text-neutral-400">{children}</span>
  );
}

/** Карточка боковой панели на десктопе. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-neutral-700 bg-neutral-900/60 p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <SectionTitle>{title}</SectionTitle>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Строка списка внутри панели: входящая атака, враг. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <li className={`rounded-md border border-neutral-800 bg-neutral-950/60 p-2 ${className}`}>
      {children}
    </li>
  );
}

const NOTICE: Record<"info" | "warn" | "danger", string> = {
  info: "border-neutral-700 bg-neutral-900/70 text-neutral-300",
  warn: "border-orange-800/60 bg-orange-950/30 text-orange-200",
  danger: "border-red-800 bg-red-950/50 text-red-200",
};

/** Полоса-уведомление над доком инструментов. */
export function Notice({
  tone = "info",
  className = "",
  children,
}: {
  tone?: "info" | "warn" | "danger";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 text-sm ${NOTICE[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export const inputClass =
  "min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base " +
  "text-neutral-200 placeholder:text-neutral-600 focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-neutral-500 lg:py-1.5 lg:text-sm";

/**
 * Мобильная шторка снизу. Живёт только под lg — на десктопе то же содержимое
 * лежит в боковой колонке. Затемнение не доходит до шапки, чтобы переключаться
 * между панелями одним тапом, а не двумя.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end lg:hidden">
      <button
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-x-0 bottom-0 top-14 cursor-default bg-black/60"
      />
      <div className="relative max-h-[82dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur">
          <SectionTitle>{title}</SectionTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="-my-1 text-lg leading-none">
            ✕
          </Button>
        </div>
        <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="shrink-0 text-neutral-100">{value}</dd>
    </div>
  );
}

export function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="text-neutral-200">{fmt(value)}</span>
    </div>
  );
}

/** Счётчик «подпись + значение» — строка состояния и HUD боя. */
export function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5 lg:gap-2">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 lg:text-xs">
        {label}
      </span>
      <span className={tone ?? "text-neutral-100"}>{value}</span>
    </div>
  );
}

/** Горизонтальная лента счётчиков, которая прокручивается на узком экране. */
export function ChipBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex shrink-0 gap-3 overflow-x-auto rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 font-mono text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}

const svg = "h-5 w-5 stroke-current";

export function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7} className={svg}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" strokeLinecap="round" />
    </svg>
  );
}

export function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7} className={svg}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17 14.4c2 .7 3.5 2.4 3.5 4.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} className={svg}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

/** Модальное окно поверх всего: диалог налёта и его сводка. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-2xl border border-neutral-700 bg-neutral-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-md sm:pb-5">
        <h3 className="mb-1 text-lg font-bold">{title}</h3>
        {subtitle && <p className="mb-4 text-xs text-neutral-500">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/** Диалог с одним полем: назвать склад или переименовать его. */
export function NameDialog({
  title,
  subtitle,
  confirm,
  initial = "",
  maxLength,
  onCancel,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  confirm: string;
  initial?: string;
  maxLength: number;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const ready = value.trim().length > 0;

  return (
    <Modal title={title} subtitle={subtitle} onClose={onCancel}>
      <input
        autoFocus
        value={value}
        maxLength={maxLength}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) onSubmit(value);
        }}
        placeholder={t("base.namePlaceholder")}
        className={`${inputClass} mb-1 w-full`}
      />
      <p className="mb-4 text-right font-mono text-[11px] text-neutral-600">
        {value.length}/{maxLength}
      </p>
      <div className="flex gap-2">
        <Button
          variant="build"
          className="flex-1"
          disabled={!ready}
          onClick={() => onSubmit(value)}
        >
          {confirm}
        </Button>
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </Modal>
  );
}

/** Подтверждение необратимого действия. */
export function ConfirmDialog({
  title,
  subtitle,
  confirm,
  onCancel,
  onConfirm,
}: {
  title: string;
  subtitle?: string;
  confirm: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <Modal title={title} subtitle={subtitle} onClose={onCancel}>
      <div className="flex gap-2">
        <Button variant="danger" className="flex-1" onClick={onConfirm}>
          {confirm}
        </Button>
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </Modal>
  );
}

/**
 * Квадратная кнопка инструмента: глиф крупно, цена мелко под ним. Занимает
 * меньше места, чем строка с подписью, и одинаково читается на телефоне.
 */
export function ToolButton({
  label,
  price,
  hint,
  active,
  icon,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  price: string;
  hint: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <button
      {...rest}
      title={`${label} · ${hint}`}
      aria-label={`${label}, ${hint}`}
      aria-pressed={active}
      className={`flex aspect-square w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-40 lg:aspect-auto lg:h-auto lg:py-2 ${
        active
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
          : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
      }`}
    >
      {icon}
      <span className="w-full truncate text-center text-[11px] font-semibold leading-none">
        {label}
      </span>
      <span className="w-full truncate text-center font-mono text-[10px] leading-none text-neutral-500">
        {price}
      </span>
    </button>
  );
}

/** Сколько сообщение висит, если его не закрыли и не сменило другое. */
export const TOAST_MS = 30_000;

/**
 * Сообщение поверх карты. Раньше оно стояло в потоке и на каждое событие
 * поджимало карту — теперь всплывает absolute и вёрстку не трогает.
 */
export function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="toast-in absolute left-1/2 top-2 z-20 w-[min(28rem,calc(100%-1rem))] -translate-x-1/2">
      <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-sm text-neutral-200 shadow-2xl backdrop-blur">
        <span className="min-w-0">{text}</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("common.close")}
          className="-mr-2 shrink-0"
          onClick={onClose}
        >
          ✕
        </Button>
      </div>
    </div>
  );
}

/**
 * Квадрокоптер: четыре луча с винтами и корпус. В lucide такого нет, а
 * коробка на кнопке дронов сбивала с толку — коробка это контейнер, не дрон.
 */
export function IconDrone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6} className="h-5 w-5 stroke-current">
      <path d="M8.5 8.5 6 6M15.5 8.5 18 6M8.5 15.5 6 18M15.5 15.5 18 18" strokeLinecap="round" />
      <circle cx="5" cy="5" r="2.4" />
      <circle cx="19" cy="5" r="2.4" />
      <circle cx="5" cy="19" r="2.4" />
      <circle cx="19" cy="19" r="2.4" />
      <rect x="9" y="9" width="6" height="6" rx="1.6" />
    </svg>
  );
}
