"use client";

/*
 * Лицо игрока. Выбрано — картинка, не выбрано — инициалы.
 * Два размера: большой (профиль, выбиралка, перед боем) и маленький
 * (списки, кнопка аккаунта). Размер задаёт вызывающий.
 */

import Image from "next/image";
import { avatarUrl, type Avatar as AvatarValue } from "@/lib/avatar";
import { initials } from "./AccountMenu";

const SIZES = {
  /** Списки и кнопки. */
  sm: { px: 40, cls: "h-10 w-10 text-xs" },
  /** Профиль, выбиралка, окно перед боем. */
  lg: { px: 160, cls: "h-40 w-40 text-5xl" },
} as const;

export type AvatarSize = keyof typeof SIZES;

export default function Avatar({
  avatar,
  name,
  email = null,
  size = "sm",
  className = "",
}: {
  avatar: AvatarValue;
  /** Имя нужно и для инициалов, и как подпись картинке. */
  name: string | null;
  email?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const url = avatarUrl(avatar);
  const { px, cls } = SIZES[size];
  // inline-flex обязателен: у строчного span ни размеры, ни обрезка по
  // скруглению не работают, и картинка вылезала квадратом.
  const shell =
    `inline-flex shrink-0 items-center justify-center overflow-hidden ` +
    `rounded-full border border-neutral-700 bg-neutral-900/60 ${cls} ${className}`;

  if (!url) {
    return (
      <span className={`${shell} font-bold uppercase tracking-wide text-neutral-200`}>
        {initials(name, email)}
      </span>
    );
  }

  return (
    <span className={shell}>
      <Image
        src={url}
        alt={name ?? ""}
        width={px}
        height={px}
        className="h-full w-full object-cover"
        // Загруженные лежат в хранилище Supabase, готовые — в public.
        unoptimized={url.startsWith("http")}
      />
    </span>
  );
}
