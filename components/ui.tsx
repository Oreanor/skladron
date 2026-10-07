"use client";

import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

// Иконки живут отдельными .svg в components/icons — правятся редактором,
// а не руками в JSX. Реэкспортируем, чтобы места вызова не менялись.
export { IconBalloon, IconDrone, IconMenu, IconTarget, IconUsers } from "./icons";
import { useT } from "@/lib/i18n";
import { shownLevel } from "@/lib/economy";

/*
 * Общая мелочь интерфейса. Цвет = роль, не вкус.
 *   build   — primary: OK, купить, подтвердить (изумруд);
 *   danger  — опасное действие: атака, снос;
 *   outline — secondary: отмена, пропуск, рядом с primary;
 *   neutral — светлое завершение экрана-итога (редко; чаще build);
 *   ghost   — тихая иконка/крест в шапке.
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
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-50 " +
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
  collapsed,
  onToggle,
  dragging,
  onGrab,
  onDrop,
  onOver,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  /** Свёрнута: видна только шапка. */
  collapsed?: boolean;
  /** Клик по названию сворачивает и разворачивает. */
  onToggle?: () => void;
  /** Панель тащат — показываем это бледностью. */
  dragging?: boolean;
  /** Взяли за заголовок. */
  onGrab?: () => void;
  /** Отпустили. */
  onDrop?: () => void;
  /** Над этой панелью тащат другую. */
  onOver?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      // Тащат только за заголовок: повесь draggable на всю панель — и любой
      // ползунок внутри начнёт таскать её вместо бегунка.
      onDragOver={
        onOver
          ? (e) => {
              e.preventDefault();
              onOver();
            }
          : undefined
      }
      className={`rounded-md border border-neutral-700 bg-neutral-900/60 p-4 transition-opacity ${
        dragging ? "opacity-40" : ""
      } ${className}`}
    >
      {(title || action) && (
        <div className={`flex items-center justify-between gap-2 ${collapsed ? "" : "mb-3"}`}>
          {title &&
            (onToggle ? (
              <button
                type="button"
                onClick={onToggle}
                draggable={Boolean(onGrab)}
                onDragStart={onGrab}
                onDragEnd={onDrop}
                className="flex min-w-0 flex-1 cursor-grab items-center gap-1 text-left active:cursor-grabbing"
              >
                <span className="text-neutral-600">{collapsed ? "▸" : "▾"}</span>
                <SectionTitle>{title}</SectionTitle>
              </button>
            ) : (
              <SectionTitle>{title}</SectionTitle>
            ))}
          {/* Кнопка выше строки заголовка: без отрицательных отступов шапка
              вырастала при развороте, и заголовок съезжал вниз. Так она
              заходит в поле панели, а шапка всегда высотой в заголовок. */}
          {!collapsed && action && <div className="-my-2 shrink-0 lg:-my-1.5">{action}</div>}
        </div>
      )}
      {!collapsed && children}
    </div>
  );
}

/** Строка списка внутри панели: входящая атака, враг. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <li
      className={`rounded-md border border-neutral-800 bg-neutral-950/60 p-2 transition-colors hover:border-neutral-700 hover:bg-neutral-900/80 ${className}`}
    >
      {children}
    </li>
  );
}

/*
 * Поле ввода. w-full тут обязателен: flex-1 растягивает только внутри
 * строки-флекса, а в модалках поле стоит само по себе — и оставалось
 * шириной по умолчанию, клеточек на двадцать. Флексу w-full не мешает:
 * там ширину задаёт flex-basis.
 */
export const inputClass =
  "w-full min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base " +
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
  action,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  action?: ReactNode;
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
    // Обёртка на весь экран, но сама нажатий не ловит: шапка с кнопками
    // панелей остаётся живой, и тычок в соседнюю кнопку сразу меняет
    // шторку — закрывать текущую крестиком не нужно.
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-end lg:hidden">
      <button
        aria-label={t("common.close")}
        onClick={onClose}
        className="pointer-events-auto absolute inset-x-0 bottom-0 top-14 cursor-default bg-black/60"
      />
      <div className="pointer-events-auto relative max-h-[82dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur">
          <SectionTitle>{title}</SectionTitle>
          {action && <div className="ml-auto shrink-0 whitespace-nowrap">{action}</div>}
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
export function ChipBar({
  children,
  className = "",
  bare = false,
}: {
  children: ReactNode;
  className?: string;
  /** Без рамки и подложки: строка счётчиков в шапке ничего не обводит. */
  bare?: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 gap-3 overflow-x-auto px-3 py-2 font-mono text-xs ${
        bare ? "" : "rounded-md border border-neutral-800 bg-neutral-900/60"
      } [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}

/** Модальное окно поверх всего: диалог налёта и его сводка. */
export function Modal({
  title,
  subtitle,
  wide = false,
  footer,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Широкая карточка: для длинных текстов вроде правил. */
  wide?: boolean;
  /** Прибитая к низу строка кнопок: она не уезжает вместе с текстом. */
  footer?: ReactNode;
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
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      // клик мимо карточки — то же самое, что крестик
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {/*
        Шапка и низ прибиты, прокручивается только текст: иначе на длинной
        карточке крестик и «ОК» уезжают вверх, и закрыть её нечем.
      */}
      <div
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-neutral-700 bg-neutral-900 shadow-2xl sm:rounded-md ${
          wide ? "max-w-3xl" : "max-w-sm"
        }`}
      >
        <div className="flex shrink-0 items-start gap-2 px-5 pb-2 pt-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold">{title}</h3>
            {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="×"
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg leading-none text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200"
            >
              ×
            </button>
          )}
        </div>
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${
            footer ? "pb-3" : "pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5"
          }`}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-neutral-800 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:pb-3">
            <div className="flex flex-col items-center gap-2 [&>*]:max-w-full">
              {footer}
            </div>
          </div>
        )}
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
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onCancel}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="build" disabled={!ready} onClick={() => onSubmit(value)}>
            {confirm}
          </Button>
          <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      }
    >
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
      <p className="text-right font-mono text-[11px] text-neutral-600">
        {value.length}/{maxLength}
      </p>
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
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onCancel}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="danger" onClick={onConfirm}>
            {confirm}
          </Button>
          <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      }
    >
      <></>
    </Modal>
  );
}

/**
 * Кнопка инструмента: глиф крупно, подпись и цена мелко под ним. Высота — по
 * содержимому, с тесными отступами: на телефоне три ряда квадратов съедали
 * треть экрана, и карта над ними выходила плоской полосой.
 */
export function ToolButton({
  label,
  price,
  hint,
  active,
  icon,
  level,
  count,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  price: string;
  hint: string;
  active: boolean;
  icon: ReactNode;
  /** Уровень класса, если он у этого инструмента есть: рисуем уголком. */
  level?: number;
  /** Сколько такого добра на складе: счётчик переехал сюда из шапки. */
  count?: number;
}) {
  const t = useT();
  return (
    <button
      {...rest}
      title={`${label} · ${hint}`}
      aria-label={`${label}, ${hint}`}
      aria-pressed={active}
      // сверху оставляем место счётчику и уровню — иконка идёт под ними
      className={`relative flex w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border px-1 pb-1 pt-3.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-40 lg:h-auto lg:pb-1.5 lg:pt-4 ${
        active
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
          : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
      }`}
    >
      {count !== undefined && (
        <span className="absolute left-1.5 top-1 font-mono text-sm font-bold leading-none text-neutral-100">
          {count}
        </span>
      )}
      {/* уровень пишем всегда, даже первый: сразу видно, что качается */}
      {level !== undefined && (
        <span className="absolute right-1 top-1 font-mono text-[9px] leading-tight text-amber-300">
          {t("upgrade.level", { level: shownLevel(level) })}
        </span>
      )}
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

/**
 * Сколько сообщение висит в полосе, пока его не сменит следующее. Раньше
 * это была всплывашка с крестиком и держалась полминуты; в постоянном поле
 * столько ни к чему — за ним же живёт подсказка инструмента.
 */
export const MESSAGE_MS = 12_000;
