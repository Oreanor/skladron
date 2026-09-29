"use client";

/*
 * Выбор лица: одно большое, стрелки по бокам, листается по кругу.
 *
 * Сеткой из шестнадцати мелких лиц было не разобрать, кого выбираешь, — а
 * выбираешь ты то, каким тебя увидят остальные. Поэтому показываем по
 * одному и крупно; перебрать шестнадцать штук стрелками недолго.
 *
 * Загруженная своя картинка встаёт в ту же карусель первой: пролистал
 * мимо — вернулся, не потерял. Ужимается она здесь же, до отправки: снимок
 * с телефона весит мегабайты, а нужен квадрат в три сотни пикселей.
 */

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  PRESETS,
  UPLOAD_MAX_BYTES,
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

  // Своя картинка идёт первой, дальше готовые лица.
  const [faces, setFaces] = useState<string[]>(() =>
    avatar && avatar.startsWith("http") ? [avatar, ...PRESET_LIST] : PRESET_LIST
  );
  const [at, setAt] = useState(() => {
    const i = avatar ? faces.indexOf(avatar) : -1;
    return i < 0 ? 0 : i;
  });

  const step = (by: number) => setAt((i) => (i + by + faces.length) % faces.length);
  const shown = faces[at] ?? null;

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
      // В карусель первой и сразу показываем: своё лицо ищут не листанием.
      setFaces([url, ...PRESET_LIST]);
      setAt(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const arrow =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border " +
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
              void onPick(shown);
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
      <div className="flex items-center justify-center gap-4 py-2">
        <button
          type="button"
          aria-label={t("avatar.prev")}
          title={t("avatar.prev")}
          onClick={() => step(-1)}
          className={arrow}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <AvatarView avatar={shown} name={name} email={email} size="xl" />

        <button
          type="button"
          aria-label={t("avatar.next")}
          title={t("avatar.next")}
          onClick={() => step(1)}
          className={arrow}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <p className="text-center font-mono text-xs text-neutral-500">
        {at + 1}/{faces.length}
      </p>

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
