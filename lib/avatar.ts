/*
 * Аватарка игрока: либо одно из готовых лиц, либо своя картинка.
 *
 * В профиле лежит одна строка. Пусто — рисуем инициалы, как раньше;
 * «1»…«16» — готовое лицо из public/avatars; всё, что начинается с http, —
 * своя загруженная картинка. Разбирать её умеет только этот файл, чтобы
 * знание о формате не расползлось по кнопкам и спискам.
 */

/** Сколько готовых лиц лежит в public/avatars. */
export const PRESETS = 16;

/**
 * Сторона, к которой ужимается загруженная картинка. Столько же, сколько у
 * готовых лиц: аватарку показываем крупно, до 200 пикселей в окне начала
 * боя, и мельче она стала бы мылом.
 */
export const UPLOAD_SIDE = 320;
/** Больше этого на сервер не отправляем: ужатая укладывается в разы меньше. */
export const UPLOAD_MAX_BYTES = 120 * 1024;

export type Avatar = string | null;

/** Адрес картинки, или null — значит рисуем инициалы. */
export function avatarUrl(avatar: Avatar): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("http")) return avatar;
  const n = Number(avatar);
  return Number.isInteger(n) && n >= 1 && n <= PRESETS ? `/avatars/${n}.webp` : null;
}

/** Адрес готового лица по номеру — для самой выбиралки. */
export const presetUrl = (n: number) => `/avatars/${n}.webp`;

/**
 * Ужимает выбранный файл до квадрата UPLOAD_SIDE и кодирует в webp.
 *
 * Делаем это на клиенте и до отправки: фотография с телефона весит
 * мегабайты, а показываем мы её кружком в тридцать пикселей. Кадрируем по
 * центру короткой стороны — лицо обычно там, а растянутый овал выглядит
 * хуже обрезанных краёв.
 */
export async function shrinkAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = UPLOAD_SIDE;
  canvas.height = UPLOAD_SIDE;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    UPLOAD_SIDE,
    UPLOAD_SIDE
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((done) =>
    canvas.toBlob(done, "image/webp", 0.82)
  );
  if (!blob) throw new Error("encode failed");
  return blob;
}
