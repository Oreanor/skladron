"use client";

/*
 * Общие детали журналов боёв и миссий. Строки в них устроены одинаково:
 * щелчок по строке открывает повтор (или план своего налёта), справа —
 * кнопки «смотреть» и «переиграть», рядом с названием — лучший счёт.
 * Различаться журналы должны только тем, что у них правда разное.
 */

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Play, RotateCcw } from "lucide-react";
import { IconButton } from "../ui";
import { useT } from "@/lib/i18n";

/** Список. Высота — несколько строк: журнал не должен выдавливать соседей. */
export const JournalList = ({ children }: { children: ReactNode }) => (
  <ul className="-mr-3 max-h-[10.5rem] space-y-0.5 overflow-y-auto overscroll-contain pr-1.5">{children}</ul>
);

/** Значок на кнопке строки. */
export const ROW_ICON = "h-4 w-4";

/** Клавиши, которыми «нажимают» строку-кнопку. */
const PRESS_KEYS = new Set(["Enter", " "]);

/**
 * Строка журнала. С open она сама кнопка — но не <button>: внутри у неё
 * свои кнопки, а кнопка в кнопке — невалидная разметка.
 */
export function JournalRow({
  open,
  title,
  dim = false,
  children,
}: {
  open?: () => void;
  title?: string;
  /** Ждёт своей очереди: видна, но приглушена. */
  dim?: boolean;
  children: ReactNode;
}) {
  const action = open && {
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (!PRESS_KEYS.has(e.key)) return;
      e.preventDefault();
      open();
    },
    role: "button",
    tabIndex: 0,
    title,
  };
  return (
    <li
      {...action}
      className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-neutral-800/60 ${
        open ? "cursor-pointer" : ""
      } ${dim ? "opacity-60" : ""}`}
    >
      {children}
    </li>
  );
}

/** Кнопки справа в строке. */
export const RowButtons = ({ children }: { children: ReactNode }) => (
  <div className="flex shrink-0 gap-1">{children}</div>
);

/**
 * Кнопка в строке. Щелчок по ней не «нажимает» строку. busy — прошлый бой
 * ещё пишется на сервер, и начинать новый рано.
 */
export function RowButton({
  label,
  onPress,
  busy,
  className = "",
  children,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <IconButton
      label={label}
      title={busy ? t("competitions.saving") : label}
      disabled={busy}
      className={`h-8 w-8 disabled:cursor-wait disabled:opacity-40 ${className}`}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onPress();
      }}
    >
      {children}
    </IconButton>
  );
}

export function WatchButton({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <RowButton label={t("replay.watch")} onPress={onPress}>
      <Play className={ROW_ICON} />
    </RowButton>
  );
}

export function RetakeButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const t = useT();
  return (
    <RowButton label={t("competitions.retake")} busy={busy} onPress={onPress}>
      <RotateCcw className={ROW_ICON} />
    </RowButton>
  );
}

/** Лучший счёт рядом с названием: у миссии — уцелело, у налёта — сгорело. */
export function BestScore({ pct, done = true, title }: { pct: number; done?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`ml-3 font-mono font-bold ${done ? "text-emerald-300" : "text-neutral-500"}`}
    >
      {pct}%
    </span>
  );
}

/** Текст строки: заголовок и под ним мелкая строка с цифрами. */
export const RowText = ({ head, line, muted = false }: { head: ReactNode; line: ReactNode; muted?: boolean }) => (
  <div className="min-w-0">
    <div className={`truncate ${muted ? "text-neutral-400" : "text-neutral-200"}`}>{head}</div>
    <div className="font-mono text-[11px] text-neutral-500">{line}</div>
  </div>
);
