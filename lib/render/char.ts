/*
 * Уголь: сгоревший пол склада и выжженная трава. Почти чёрное с едва
 * заметной фактурой — крапинки и тонкие трещинки. Фактура рисуется раз в
 * маленькую картинку и ложится узором: на обычном масштабе это ровная
 * чернота, а приблизишь — видно, что пол обуглен, а не покрашен.
 */

import { COLORS } from "./colors";
import { hash } from "./hash";

export type Char = "floor" | "grass";

/** Сторона картинки фактуры в точках и сколько игровых точек она занимает. */
const TEX = 64;
const TEX_WORLD = 16;

/** Основа — цвет из палитры, поверх — зола, прогар и трещинки. */
const LOOK: Record<Char, { base: string; light: string; dark: string; crack: string }> = {
  floor: { base: COLORS.burnt, light: "rgba(58, 54, 50, 0.55)", dark: "rgba(0, 0, 0, 0.6)", crack: "rgba(70, 64, 58, 0.45)" },
  grass: { base: COLORS.scorch, light: "rgba(70, 62, 44, 0.5)", dark: "rgba(0, 0, 0, 0.55)", crack: "rgba(82, 72, 52, 0.4)" },
};

const textures = new Map<Char, HTMLCanvasElement | null>();

function texture(kind: Char) {
  if (textures.has(kind)) return textures.get(kind)!;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    c = document.createElement("canvas");
    c.width = c.height = TEX;
    const g = c.getContext("2d");
    if (g) {
      const look = LOOK[kind];
      g.fillStyle = look.base;
      g.fillRect(0, 0, TEX, TEX);
      // крапинки: светлые — зола, тёмные — прогар
      for (let i = 0; i < 260; i++) {
        const x = hash(i * 3) * TEX;
        const y = hash(i * 3 + 1) * TEX;
        const s = 1 + Math.floor(hash(i * 3 + 2) * 2);
        g.fillStyle = i % 2 ? look.light : look.dark;
        g.fillRect(x, y, s, s);
      }
      // трещинки — короткие ломаные; рисуем и со сдвигом на сторону, чтобы
      // узор сходился на стыках без шва
      g.strokeStyle = look.crack;
      g.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        let x = hash(1000 + i * 7) * TEX;
        let y = hash(1001 + i * 7) * TEX;
        let a = hash(1002 + i * 7) * Math.PI * 2;
        const pts: [number, number][] = [[x, y]];
        const steps = 3 + Math.floor(hash(1003 + i * 7) * 4);
        for (let j = 0; j < steps; j++) {
          a += (hash(1004 + i * 7 + j * 13) - 0.5) * 1.4;
          x += Math.cos(a) * 4;
          y += Math.sin(a) * 4;
          pts.push([x, y]);
        }
        for (const ox of [-TEX, 0, TEX]) {
          for (const oy of [-TEX, 0, TEX]) {
            g.beginPath();
            pts.forEach(([px, py], j) => (j ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
            g.stroke();
          }
        }
      }
    } else c = null;
  }
  textures.set(kind, c);
  return c;
}

const patterns = new WeakMap<CanvasRenderingContext2D, Map<Char, CanvasPattern | string>>();

/** Заливка угля для этого холста: узор, а где узора нет — ровный цвет. */
export function charFill(ctx: CanvasRenderingContext2D, kind: Char): CanvasPattern | string {
  let own = patterns.get(ctx);
  if (!own) patterns.set(ctx, (own = new Map()));
  const ready = own.get(kind);
  if (ready) return ready;
  const tex = texture(kind);
  const pattern = tex ? ctx.createPattern(tex, "repeat") : null;
  if (pattern && typeof DOMMatrix !== "undefined") {
    pattern.setTransform(new DOMMatrix().scale(TEX_WORLD / TEX));
  }
  const fill = pattern ?? LOOK[kind].base;
  own.set(kind, fill);
  return fill;
}

/** Обугленная клетка — то, что остаётся от погибшей установки. */
export function drawCharred(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number) {
  ctx.fillStyle = charFill(ctx, "floor");
  ctx.fillRect(cx * cell, cy * cell, cell, cell);
}
