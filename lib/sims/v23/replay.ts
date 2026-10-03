// Замороженный движок версии 23. Не править — сгенерировано scripts/freeze-sim.cjs.
/* eslint-disable */
// @ts-nocheck
// Запись боя для нападавшего. Сам бой детерминирован: карта, пушки, ящики и
// расписание вылетов известны обеим сторонам, а случайность сидит на seed.
// Недетерминированы только руки защитника — их и записываем: куда наведён
// прицел и жмёт ли он гашетку, кадр за кадром.

import { GRID } from "./base";
import { SIM } from "./tuning";

export interface Frame {
  /** Клетка под прицелом. Прицел убран с карты — кадра нет вовсе (null). */
  x: number;
  y: number;
  firing: boolean;
}

const IDLE = "-";

// Кадр — «x:y», у стреляющего с «!» на конце; прицела нет — «-».
const encodeFrame = (f: Frame | null) =>
  f ? `${f.x}:${f.y}${f.firing ? "!" : ""}` : IDLE;

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

export function decodeTrace(src: string, limit = SIM.maxFrames): (Frame | null)[] {
  const out: (Frame | null)[] = [];
  if (!src) return out;
  for (const chunk of src.split(",")) {
    const parts = chunk.split("*");
    if (parts.length > 2 || !parts[0]) throw new Error("bad trace chunk");
    const [code, times] = parts;
    // Только десятичные цифры: иначе Number("1e6") или "0x10" раздуют запись.
    if (times !== undefined && !/^\d{1,6}$/.test(times)) {
      throw new Error("bad trace repeat");
    }
    const n = times === undefined ? 1 : Number(times);
    if (!Number.isSafeInteger(n) || n < 1 || out.length + n > limit) {
      throw new Error("trace is too long");
    }
    let frame: Frame | null = null;
    if (code !== IDLE) {
      const firing = code.endsWith("!");
      const point = firing ? code.slice(0, -1) : code;
      if (!/^\d{1,3}:\d{1,3}$/.test(point)) throw new Error("bad trace frame");
      const [rawX, rawY] = point.split(":");
      const x = Number(rawX);
      const y = Number(rawY);
      // Бой пишет только клетки поля: за краем прицела нет, там кадр «-».
      if (x >= GRID || y >= GRID) {
        throw new Error("trace coordinates are out of bounds");
      }
      frame = { x, y, firing };
    }
    for (let i = 0; i < n; i++) out.push(frame);
  }
  return out;
}
