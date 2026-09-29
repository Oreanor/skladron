"use client";

/*
 * Выбор аватара: большой кружок сверху — то, что выберешь, — а под ним
 * лента мелких со стрелками. Тычешь в мелкое, оно поднимается в большой.
 *
 * Стрелки по бокам ленты и ←/→ на клавиатуре листают выбранное лицо —
 * так быстрее, чем целиться в мелкий кружок. Ленту всё ещё можно
 * тащить пальцем или мышью.
 *
 * Загруженная своя картинка встаёт в ту же ленту первой и сразу
 * поднимается в большой кружок: своё лицо ищут не листанием. Ужимается она
 * здесь же, до отправки, — снимок с телефона весит мегабайты, а нужен
 * квадрат в три сотни пикселей.
 *
 * Выбор применяется по «ОК», а не по каждому тычку: листать и примерять
 * можно, ничего при этом не меняя.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
/** Пока сдвиг меньше — считаем клик по лицу, не перетаскивание ленты. */
const DRAG_THRESHOLD_PX = 6;

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
  /** Жест мыши/тача: откуда взяли, какой scrollLeft, ушло ли за порог. */
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [faces, setFaces] = useState<string[]>(() => stripFaces(avatar));
  const [picked, setPicked] = useState<AvatarValue>(() => normalizeAvatarForStorage(avatar));
  const [uploadVersion, setUploadVersion] = useState(0);
  const facesRef = useRef(faces);
  const pickedRef = useRef(picked);
  facesRef.current = faces;
  pickedRef.current = picked;

  /** Сдвиг выбранного: стрелки ленты и ←/→ на клавиатуре. */
  const step = (by: number) => {
    const list = facesRef.current;
    if (!list.length) return;
    const cur = pickedRef.current;
    const i = cur ? list.indexOf(cur) : -1;
    const next = list[(i < 0 ? 0 : i + by + list.length) % list.length]!;
    setPicked(next);
    const strip = stripRef.current;
    const thumb = strip?.children[list.indexOf(next)] as HTMLElement | undefined;
    thumb?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const endStripDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (stripRef.current?.hasPointerCapture(e.pointerId)) {
      stripRef.current.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
    // moved оставляем до следующего pointerdown — чтобы клик по лицу не сработал.
    dragRef.current = drag.moved ? { ...drag, pointerId: -1 } : null;
  };

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
        <>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              className="whitespace-nowrap"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? t("avatar.uploading") : t("avatar.upload")}
            </Button>
            <Button
              className="whitespace-nowrap"
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
            disabled={busy}
            onClick={() => {
              void applyPick(picked);
              onClose();
            }}
          >
            {t("common.ok")}
          </Button>
        </>
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
          size="lg"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t("avatar.prev")}
          title={t("avatar.prev")}
          onClick={() => step(-1)}
          className={arrow}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={stripRef}
          onPointerDown={(e) => {
            // Только основная кнопка; стрелки и overflow-scroll остаются как были.
            if (e.button !== 0 || !stripRef.current) return;
            dragRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startScroll: stripRef.current.scrollLeft,
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current;
            const strip = stripRef.current;
            if (!drag || !strip || drag.pointerId !== e.pointerId) return;
            const dx = e.clientX - drag.startX;
            if (!drag.moved) {
              if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
              drag.moved = true;
              setDragging(true);
              strip.setPointerCapture(e.pointerId);
            }
            strip.scrollLeft = drag.startScroll - dx;
          }}
          onPointerUp={endStripDrag}
          onPointerCancel={endStripDrag}
          className={`flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-contain py-1 touch-pan-y [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            dragging ? "cursor-grabbing select-none" : "cursor-grab"
          }`}
        >
          {faces.map((face) => (
            <button
              key={face}
              type="button"
              aria-label={t("avatar.title")}
              aria-pressed={picked === face}
              onClick={() => {
                if (dragRef.current?.moved) return;
                setPicked(face);
              }}
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
                draggable={false}
                className="pointer-events-none h-full w-full object-cover"
                unoptimized={face.startsWith("http")}
              />
            </button>
          ))}
        </div>

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
