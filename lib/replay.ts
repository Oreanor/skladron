// Запись боя для нападавшего. Сам бой детерминирован: карта, пушки, ящики и
// расписание вылетов известны обеим сторонам, а случайность сидит на seed.
// Недетерминированы только руки защитника — их и записываем: куда наведён
// прицел и жмёт ли он гашетку, кадр за кадром.

/** Шаг симуляции. И бой, и его повтор идут строго этими шагами. */
export const STEP = 1 / 60;

/** Дольше этого не записываем: налёт всё равно решается в первые минуты. */
export const MAX_FRAMES = 12000; // 200 секунд

export interface Frame {
  /** Клетка под прицелом. -1, если прицел убран с карты. */
  x: number;
  y: number;
  firing: boolean;
}

const IDLE = "-";

const encodeFrame = (f: Frame | null) =>
  !f || f.x < 0 ? IDLE : `${f.x}.${f.y}${f.firing ? "!" : ""}`;

/**
 * Кадры сжимаем повторами: прицел стоит на месте куда дольше, чем движется,
 * и без этого запись боя была бы в десятки килобайт.
 */
export function encodeTrace(frames: (Frame | null)[]): string {
  const out: string[] = [];
  let prev = "";
  let count = 0;
  const flush = () => {
    if (!count) return;
    out.push(count > 1 ? `${prev}*${count}` : prev);
  };
  for (const f of frames) {
    const code = encodeFrame(f);
    if (code === prev) {
      count++;
      continue;
    }
    flush();
    prev = code;
    count = 1;
  }
  flush();
  return out.join(",");
}

export function decodeTrace(src: string): (Frame | null)[] {
  const out: (Frame | null)[] = [];
  if (!src) return out;
  for (const chunk of src.split(",")) {
    const [code, times] = chunk.split("*");
    const n = times ? Number(times) : 1;
    let frame: Frame | null = null;
    if (code !== IDLE) {
      const firing = code.endsWith("!");
      const [x, y] = (firing ? code.slice(0, -1) : code).split(".");
      frame = { x: Number(x), y: Number(y), firing };
    }
    for (let i = 0; i < n; i++) out.push(frame);
  }
  return out;
}

/** Слепок склада защитника до боя: без него повтор не с чего начинать. */
export interface BattleSnapshot {
  cells: string; // карта в base64, как её отдаёт сервер
  guns: { cx: number; cy: number }[];
  depots: { cx: number; cy: number; n: number; kind?: string }[];
  levels: { guns?: number; mg?: number; water?: number };
  trace: string;
}
