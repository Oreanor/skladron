"use client";

import { useEffect, type ReactNode } from "react";
import { fmt } from "@/lib/economy";

/** Карточка боковой панели на десктопе. В мобильных шторках не используется. */
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
          {title && (
            <span className="text-xs uppercase tracking-widest text-neutral-400">{title}</span>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Мобильная шторка снизу. Живёт только под lg — на десктопе то же содержимое
 * лежит в боковой колонке, поэтому дублировать его на экране незачем.
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
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-x-0 bottom-0 top-14 cursor-default bg-black/60"
      />
      <div className="relative max-h-[82dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur">
          <span className="text-xs uppercase tracking-widest text-neutral-400">{title}</span>
          <button
            onClick={onClose}
            className="-my-1 rounded px-3 py-1 text-lg leading-none text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ✕
          </button>
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

/** Кнопка-иконка в мобильной шапке. */
export function IconButton({
  label,
  badge,
  onClick,
  children,
}: {
  label: string;
  badge?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900/60 text-neutral-300 active:bg-neutral-800"
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
