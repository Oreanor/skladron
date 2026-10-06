/*
 * Взрыв. Мягкие края — от готовых картинок с радиальным градиентом: свечение,
 * огонь и дым рисуются раз при первом взрыве, а дальше каждая — один
 * drawImage. Градиент на каждый клуб в каждом кадре стоил бы дорого, а
 * взрывов в волне бывают десятки разом.
 *
 * Всё раскладывается от места взрыва, без случайных чисел боя: бой у
 * защитника и на сервере обязан совпадать, и отрисовка в него не лезет.
 */

import { FX } from "../tuning";
import { COLORS } from "./colors";
import { hash } from "./hash";

type Blob = "glow" | "fire" | "smoke" | "trail";

/** Сторона картинки клуба, в точках. */
const BLOB_SIZE = 64;
const blobs = new Map<Blob, HTMLCanvasElement | null>();

const STOPS: Record<Blob, [number, string][]> = {
  // белое ядро, жёлтое и оранжевое — в сложении светом даёт жар
  glow: [
    [0, "rgba(255, 255, 240, 1)"],
    [0.25, "rgba(255, 230, 150, 0.9)"],
    [0.55, "rgba(255, 150, 50, 0.35)"],
    [1, "rgba(255, 110, 30, 0)"],
  ],
  fire: [
    [0, "rgba(255, 196, 92, 1)"],
    [0.45, "rgba(240, 110, 32, 0.9)"],
    [0.8, "rgba(170, 40, 14, 0.45)"],
    [1, "rgba(120, 20, 10, 0)"],
  ],
  smoke: [
    [0, "rgba(46, 42, 38, 0.9)"],
    [0.55, "rgba(52, 48, 44, 0.55)"],
    [1, "rgba(60, 56, 52, 0)"],
  ],
  // выхлоп ракеты: светлый, чуть тёплый, тает к краям
  trail: [
    [0, "rgba(246, 244, 236, 0.9)"],
    [0.5, "rgba(232, 230, 222, 0.5)"],
    [1, "rgba(220, 218, 210, 0)"],
  ],
};

function blob(kind: Blob) {
  if (blobs.has(kind)) return blobs.get(kind)!;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    c = document.createElement("canvas");
    c.width = c.height = BLOB_SIZE;
    const g = c.getContext("2d");
    if (g) {
      const h = BLOB_SIZE / 2;
      const grad = g.createRadialGradient(h, h, 0, h, h, h);
      for (const [at, color] of STOPS[kind]) grad.addColorStop(at, color);
      g.fillStyle = grad;
      g.fillRect(0, 0, BLOB_SIZE, BLOB_SIZE);
    } else c = null;
  }
  blobs.set(kind, c);
  return c;
}

function put(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, r: number, alpha: number) {
  if (alpha <= 0.01 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
}

/**
 * Мягкий клуб дыма или выхлопа с центром (x, y) и радиусом r. Прозрачность
 * ставит сам и не возвращает: вызывают пачкой, и после пачки вернуть
 * globalAlpha — дело вызывающего.
 */
export function drawSoft(
  ctx: CanvasRenderingContext2D,
  kind: "smoke" | "trail",
  x: number,
  y: number,
  r: number,
  alpha: number
) {
  const img = blob(kind);
  if (img) put(ctx, img, x, y, r, alpha);
  else {
    // без картинки (нет document) — плоский круг, как раньше
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = kind === "smoke" ? COLORS.smoke : COLORS.trail;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Ударная волна, искры и обломки. */
const WAVE_COLOR = "rgb(255, 225, 170)";
const SPARK_COLOR = "rgb(255, 205, 120)";
const DEBRIS_COLOR = "#2a2622";

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/** Фазы взрыва в секундах — от них, а не от доли жизни, чтобы огонь не тянулся вместе с дымом. */
const FLASH = 0.12;
const FIREBALL = 0.55;
const WAVE = 0.35;
const SPARKS = 0.6;
const SMOKE_FROM = 0.12;

/**
 * Взрыв по фазам: вспышка светом на всё вокруг, огненный шар из клубов —
 * растёт и остывает, ударная волна кольцом, искры штрихами, у крупного ещё
 * обломки, и дольше всех — дым, который расползается и тает.
 */
export function drawBoom(
  ctx: CanvasRenderingContext2D,
  b: { x: number; y: number; t: number; r: number },
  cell: number
) {
  const glow = blob("glow");
  const fire = blob("fire");
  const smoke = blob("smoke");
  if (!glow || !fire || !smoke) return;

  const t = b.t;
  const x = b.x * cell;
  const y = b.y * cell;
  const r = b.r * cell;
  const big = b.r >= 3;
  const turn = hash(b.x, b.y, 0) * Math.PI * 2;

  ctx.save();

  // Дым — снизу, его закрывает огонь. Клубы расходятся от центра и
  // сносятся ветром вправо, как дым над пожаром.
  if (t > SMOKE_FROM) {
    const d = clamp01((t - SMOKE_FROM) / (FX.boomLife - SMOKE_FROM));
    const puffs = big ? 7 : 5;
    const fade = Math.sin(Math.min(1, d * 3) * Math.PI * 0.5) * (1 - d);
    for (let i = 0; i < puffs; i++) {
      const a = turn + (i / puffs) * Math.PI * 2 + hash(b.x, b.y, i + 1) * 0.6;
      const dist = r * (0.15 + 0.45 * easeOut(d)) * (0.6 + hash(b.x, b.y, i + 10) * 0.6);
      const px = x + Math.cos(a) * dist + r * 0.35 * d;
      const py = y + Math.sin(a) * dist - r * 0.2 * d;
      put(ctx, smoke, px, py, r * (0.35 + 0.45 * easeOut(d)), 0.8 * fade);
    }
  }

  // Огненный шар: клубы вокруг центра, растут и остывают — светлое ядро
  // гаснет первым, оранжевые края держатся дольше.
  if (t < FIREBALL) {
    const f = t / FIREBALL;
    const grow = easeOut(Math.min(1, f * 1.6));
    const lobes = big ? 7 : 5;
    for (let i = 0; i < lobes; i++) {
      const a = turn + (i / lobes) * Math.PI * 2;
      const dist = r * 0.28 * grow * (0.7 + hash(b.x, b.y, i + 30) * 0.6);
      const size = r * (0.25 + 0.3 * grow) * (0.8 + hash(b.x, b.y, i + 50) * 0.4);
      put(ctx, fire, x + Math.cos(a) * dist, y + Math.sin(a) * dist, size, 1 - f * f);
    }
    ctx.globalCompositeOperation = "lighter";
    put(ctx, glow, x, y, r * (0.35 + 0.35 * grow), 1 - f * 1.4);
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.globalCompositeOperation = "lighter";

  // Вспышка: шире шара и светом — подсвечивает пол и соседей.
  if (t < FLASH) {
    put(ctx, glow, x, y, r * 1.7, 0.9 * (1 - t / FLASH));
  }

  // Ударная волна: тонкое кольцо уходит за шар.
  if (t < WAVE) {
    const w = t / WAVE;
    ctx.globalAlpha = 0.55 * (1 - w);
    ctx.strokeStyle = WAVE_COLOR;
    ctx.lineWidth = Math.max(0.6, cell * 0.25 * (1 - w));
    ctx.beginPath();
    ctx.arc(x, y, r * (0.3 + 1.2 * easeOut(w)), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Искры штрихами: летят быстро, тормозят и гаснут; хвост длиннее, пока
  // скорость большая.
  if (t < SPARKS) {
    const k = t / SPARKS;
    const n = (big ? 12 : 7) + Math.floor(hash(b.x, b.y, 60) * 3);
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = SPARK_COLOR;
    ctx.lineWidth = Math.max(0.6, cell * 0.14);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const h = hash(b.x, b.y, i + 70);
      const a = turn + ((i + h) / n) * Math.PI * 2;
      const far = r * (0.6 + 1.3 * h);
      const head = far * easeOut(k);
      const tail = far * easeOut(Math.max(0, k - 0.12));
      ctx.moveTo(x + Math.cos(a) * tail, y + Math.sin(a) * tail);
      ctx.lineTo(x + Math.cos(a) * head, y + Math.sin(a) * head);
    }
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  ctx.globalCompositeOperation = "source-over";

  // Обломки у крупного: тёмные крутящиеся куски, летят дальше огня.
  if (big && t < FX.boomLife * 0.6) {
    const k = t / (FX.boomLife * 0.6);
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = DEBRIS_COLOR;
    const s = Math.max(0.8, cell * 0.28);
    for (let i = 0; i < 5; i++) {
      const h = hash(b.x, b.y, i + 90);
      const a = turn + ((i + 0.5 + h * 0.5) / 5) * Math.PI * 2;
      const dist = r * (0.8 + 0.8 * h) * easeOut(k);
      ctx.save();
      ctx.translate(x + Math.cos(a) * dist, y + Math.sin(a) * dist);
      ctx.rotate(a + k * (4 + h * 6));
      ctx.fillRect(-s / 2, -s / 3, s, (s * 2) / 3);
      ctx.restore();
    }
  }

  ctx.restore();
}
