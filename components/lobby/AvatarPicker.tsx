"use client";

/*
 * Выбор аватара: большой кружок сверху — то, что выберешь, — а под ним
 * лента мелких со стрелками. Тычешь в мелкое, оно поднимается в большой.
 *
 * Загруженная своя картинка встаёт в ту же ленту первой и сразу
 * поднимается в большой кружок: своё лицо ищут не листанием. Ужимается она
 * здесь же, до отправки, — снимок с телефона весит мегабайты, а нужен
 * квадрат в три сотни пикселей.
 *
 * Выбор применяется по «ОК», а не по каждому тычку: листать и примерять
 * можно, ничего при этом не меняя.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  PRESETS,
  UPLOAD_MAX_BYTES,
  avatarUrl,
  shrinkAvatar,
  type Avatar as AvatarValue,
} from "@/lib/avatar";
import { supabase } from "@/lib/supabase";
import AvatarView from "../Avatar";
import { Button, Modal } from "../ui";
import { useT } from "@/lib/i18n";

const PRESET_LIST = Array.from({ length: PRESETS }, (_, i) => String(i + 1));
/** Сторона мелкого лица в ленте, px. */
const THUMB = 56;

export default function AvatarPicker({
  avatar,
  name,
  email,
  onPick,
  onClose,
}: {
  avatar: AvatarValue;
  name: string | null;
  email: string | null;
  onPick: (value: AvatarValue) => Promise<void> | void;
  onClose: () => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Своя картинка идёт первой, дальше готовые лица.
  const [faces, setFaces] = useState<string[]>(() =>
    avatar && avatar.startsWith("http") ? [avatar, ...PRESET_LIST] : PRESET_LIST
  );
  const [picked, setPicked] = useState<AvatarValue>(avatar);

  /** Лента шире окна: стрелки прокручивают её почти на экран. */
  const slide = (by: number) =>
    stripRef.current?.scrollBy({
      left: by * Math.max(THUMB * 3, stripRef.current.clientWidth * 0.8),
      behavior: "smooth",
    });

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const db = supabase();
      const { data } = (await db?.auth.getUser()) ?? { data: { user: null } };
      const uid = data.user?.id;
      if (!db || !uid) throw new Error(t("avatar.needSignIn"));

      const small = await shrinkAvatar(file);
      if (small.size > UPLOAD_MAX_BYTES) throw new Error(t("avatar.tooBig"));

      const path = `${uid}.webp`;
      const up = await db.storage
        .from("avatars")
        .upload(path, small, { contentType: "image/webp", upsert: true });
      if (up.error) throw up.error;

      // Адрес постоянный, а картинка меняется — без метки браузер покажет старую.
      const { data: pub } = db.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      setFaces([url, ...PRESET_LIST]);
      setPicked(url);
      stripRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const arrow =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border " +
    "border-neutral-700 text-neutral-300 transition hover:bg-neutral-800 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";

  return (
    <Modal
      title={t("avatar.title")}
      subtitle={t("avatar.hint")}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            variant="build"
            className="flex-1"
            disabled={busy}
            onClick={() => {
              void onPick(picked);
              onClose();
            }}
          >
            {t("common.ok")}
          </Button>
          <Button disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? t("avatar.uploading") : t("avatar.upload")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void onPick(null);
              onClose();
            }}
          >
            {t("avatar.clear")}
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex justify-center">
        <AvatarView avatar={picked} name={name} email={email} size="xl" />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t("avatar.prev")}
          title={t("avatar.prev")}
          onClick={() => slide(-1)}
          className={arrow}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={stripRef}
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-contain scroll-smooth py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {faces.map((face) => (
            <button
              key={face}
              type="button"
              aria-label={t("avatar.title")}
              aria-pressed={picked === face}
              onClick={() => setPicked(face)}
              style={{ width: THUMB, height: THUMB }}
              className={`shrink-0 overflow-hidden rounded-full border-2 transition ${
                picked === face
                  ? "border-emerald-500"
                  : "border-transparent hover:border-neutral-600"
              }`}
            >
              <Image
                src={avatarUrl(face) ?? ""}
                alt=""
                width={THUMB * 2}
                height={THUMB * 2}
                className="h-full w-full object-cover"
                unoptimized={face.startsWith("http")}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label={t("avatar.next")}
          title={t("avatar.next")}
          onClick={() => slide(1)}
          className={arrow}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      {error && <p className="mt-3 text-center text-xs text-red-400">{error}</p>}
    </Modal>
  );
}
