"use client";

/*
 * Выбор лица: шестнадцать готовых или своя картинка.
 *
 * Своя ужимается прямо здесь, до отправки: снимок с телефона весит
 * мегабайты, а показываем мы его кружком в две сотни пикселей. В хранилище
 * уезжает квадрат в три сотни пикселей весом в десятки килобайт, и лежит
 * он под id владельца — чужой не перезапишешь.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import {
  PRESETS,
  UPLOAD_MAX_BYTES,
  presetUrl,
  shrinkAvatar,
  type Avatar as AvatarValue,
} from "@/lib/avatar";
import { supabase } from "@/lib/supabase";
import AvatarView from "../Avatar";
import { Button, Modal } from "../ui";
import { useT } from "@/lib/i18n";

const PRESET_LIST = Array.from({ length: PRESETS }, (_, i) => String(i + 1));

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Адрес постоянный, а картинка меняется — иначе браузер покажет старую.
      const { data: pub } = db.storage.from("avatars").getPublicUrl(path);
      await onPick(`${pub.publicUrl}?v=${Date.now()}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("avatar.title")}
      subtitle={t("avatar.hint")}
      wide
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            variant="build"
            className="flex-1"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? t("avatar.uploading") : t("avatar.upload")}
          </Button>
          {avatar && (
            <Button
              disabled={busy}
              onClick={() => {
                void onPick(null);
                onClose();
              }}
            >
              {t("avatar.clear")}
            </Button>
          )}
          <Button onClick={onClose}>{t("common.close")}</Button>
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-4">
        <AvatarView avatar={avatar} name={name} email={email} size="lg" />
        <p className="text-sm text-neutral-400">{t("avatar.current")}</p>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {PRESET_LIST.map((id) => (
          <button
            key={id}
            type="button"
            aria-label={t("avatar.pick", { n: id })}
            onClick={() => {
              void onPick(id);
              onClose();
            }}
            className={`overflow-hidden rounded-full border-2 transition ${
              avatar === id
                ? "border-emerald-500"
                : "border-transparent hover:border-neutral-600"
            }`}
          >
            <Image
              src={presetUrl(Number(id))}
              alt=""
              width={96}
              height={96}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
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
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}
