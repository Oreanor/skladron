"use client";

/*
 * Лицо игрока. Выбрано — показываем картинку, не выбрано — инициалы, как
 * было раньше. Размер всегда задаётся снаружи: в списках лицо одно, в
 * окне начала боя вдвое крупнее, и решать это компоненту не по чину.
 */

import Image from "next/image";
import { avatarUrl, type Avatar as AvatarValue } from "@/lib/avatar";
import { initials } from "./AccountMenu";

/** Во что раскрывается size: списки и шапка — одно, окно боя — вдвое. */
const SIZES = {
  sm: { px: 100, cls: "h-[100px] w-[100px] text-2xl" },
  lg: { px: 200, cls: "h-[200px] w-[200px] text-5xl" },
  /** Кружок в шапке: там места ровно под кнопку. */
  chip: { px: 40, cls: "h-10 w-10 text-xs" },
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
  const shell =
    `shrink-0 overflow-hidden rounded-full border border-neutral-700 ` +
    `bg-neutral-900/60 ${cls} ${className}`;

  if (!url) {
    return (
      <span
        className={`${shell} flex items-center justify-center font-bold uppercase tracking-wide text-neutral-200`}
      >
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
