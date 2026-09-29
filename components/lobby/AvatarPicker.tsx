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
  isUploadedAvatarUrl,
  normalizeAvatarForStorage,
  removeExtraUserAvatarFiles,
  removeUserAvatarUpload,
  shrinkAvatar,
  userAvatarStoragePath,
  type Avatar as AvatarValue,
} from "@/lib/avatar";
import { supabase } from "@/lib/supabase";
import AvatarView from "../Avatar";
import { Button, Modal } from "../ui";
import { useT } from "@/lib/i18n";

const PRESET_LIST = Array.from({ length: PRESETS }, (_, i) => String(i + 1));
/** Сторона мелкого лица в ленте, px. */
const THUMB = 56;

/** В ленте — одна своя картинка максимум, без накопления старых URL. */
function stripFaces(avatar: AvatarValue): string[] {
  if (avatar && isUploadedAvatarUrl(avatar)) {
    return [normalizeAvatarForStorage(avatar)!, ...PRESET_LIST];
  }
  return PRESET_LIST;
}

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

  const [faces, setFaces] = useState<string[]>(() => stripFaces(avatar));
  const [picked, setPicked] = useState<AvatarValue>(() => normalizeAvatarForStorage(avatar));
  const [uploadVersion, setUploadVersion] = useState(0);

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

      await removeExtraUserAvatarFiles(db, uid);

      const path = userAvatarStoragePath(uid);
      const up = await db.storage
        .from("avatars")
        .upload(path, small, { contentType: "image/webp", upsert: true });
      if (up.error) throw up.error;

      const { data: pub } = db.storage.from("avatars").getPublicUrl(path);
      const stored = normalizeAvatarForStorage(pub.publicUrl)!;
      setUploadVersion(Date.now());
      setFaces(stripFaces(stored));
      setPicked(stored);
      stripRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applyPick = async (value: AvatarValue) => {
    const db = supabase();
    const { data } = (await db?.auth.getUser()) ?? { data: { user: null } };
    const uid = data.user?.id;
    const next = normalizeAvatarForStorage(value);
    const prev = normalizeAvatarForStorage(avatar);
    if (db && uid && prev && isUploadedAvatarUrl(prev) && next !== prev) {
      await removeUserAvatarUpload(db, uid);
    }
    await onPick(next);
  };

  const faceSrc = (face: string) => {
    const url = avatarUrl(face);
    if (!url || !isUploadedAvatarUrl(face)) return url;
    return uploadVersion ? `${url}?v=${uploadVersion}` : url;
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
        // Загрузка и инициалы — рядом одной строкой, «ОК» под ними во всю
        // ширину: он закрывает окно, а те двое только меняют, что в кружке.
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              className="flex-1 whitespace-nowrap"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? t("avatar.uploading") : t("avatar.upload")}
            </Button>
            <Button
              className="flex-1 whitespace-nowrap"
              disabled={busy}
              onClick={() => {
                void applyPick(null);
                onClose();
              }}
            >
              {t("avatar.clear")}
            </Button>
          </div>
          <Button
            variant="build"
            className="w-full"
            disabled={busy}
            onClick={() => {
              void applyPick(picked);
              onClose();
            }}
          >
            {t("common.ok")}
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex justify-center">
        <AvatarView
          avatar={
            picked && isUploadedAvatarUrl(picked) && uploadVersion
              ? `${avatarUrl(picked)}?v=${uploadVersion}`
              : picked
          }
          name={name}
          email={email}
          size="xl"
        />
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
                src={faceSrc(face) ?? ""}
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
