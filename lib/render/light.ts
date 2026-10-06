/*
 * Свет и тени: солнце сверху слева, у всех одно. Тень ложится вниз-вправо,
 * блик — на верхний левый бок, затенение — на нижний правый.
 *
 * Блик рисуется готовой картинкой по форме предмета: градиент на каждую
 * установку в каждом кадре боя стоил бы дорого, а картинка — один drawImage.
 */

export type Shape = "circle" | "square" | "oct";

/** Насколько тень сдвинута от предмета, в долях клетки. */
const SHADOW_OFF = 0.12;
const SHADOW = "rgba(0, 0, 0, 0.32)";

function path(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number) {
  ctx.beginPath();
  if (shape === "circle") ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (shape === "square") ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.25);
  else {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
}

/** Тень предмета на полу: та же форма, сдвинутая вниз-вправо. */
export function dropShadow(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  r: number,
  cell: number
) {
  const o = cell * SHADOW_OFF;
  path(ctx, shape, x + o, y + o, r);
  ctx.fillStyle = SHADOW;
  ctx.fill();
}

/** Картинка блика в этот размер — на сторону, в точках. */
const LIGHT_SIZE = 64;
const lights = new Map<Shape, HTMLCanvasElement | null>();

function lightFor(shape: Shape) {
  if (lights.has(shape)) return lights.get(shape)!;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    c = document.createElement("canvas");
    c.width = c.height = LIGHT_SIZE;
    const g = c.getContext("2d");
    if (g) {
      const h = LIGHT_SIZE / 2;
      path(g, shape, h, h, h);
      g.clip();
      const grad = g.createLinearGradient(0, 0, LIGHT_SIZE, LIGHT_SIZE);
      grad.addColorStop(0, "rgba(255, 255, 255, 0.38)");
      grad.addColorStop(0.45, "rgba(255, 255, 255, 0)");
      grad.addColorStop(0.6, "rgba(0, 0, 0, 0)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0.34)");
      g.fillStyle = grad;
      g.fillRect(0, 0, LIGHT_SIZE, LIGHT_SIZE);
    } else c = null;
  }
  lights.set(shape, c);
  return c;
}

/** Свет поверх предмета: блик сверху слева, затенение снизу справа. */
export function applyLight(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number) {
  const img = lightFor(shape);
  if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
}
