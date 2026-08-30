import {
  GRID,
  G_BASE,
  G_BURNT,
  G_SCORCH,
  type Gun,
  isBuilding,
} from "./base";
import { GUN_RANGE, SHOT_LIFE, SMOKE_LIFE, type GameState } from "./engine";

export const COLORS = {
  groundA: "#3d6b3a",
  groundB: "#3a6537",
  base: "#f2f2ec",
  burnt: "#141414",
  scorch: "#1c1a14",
  gun: "#1b2a41",
  gunTop: "#8ecae6",
  range: "rgba(120, 200, 255, 0.16)",
  rangeLine: "rgba(140, 215, 255, 0.55)",
  drone: "#2b2b2b",
  droneAccent: "#e5383b",
  missile: "#ffd166",
  water: "#79c7ff",
  flash: "#ffe9a8",
  smoke: "20, 20, 20",
};

/** Всё, что нужно для отрисовки карты — и бою, и редактору. */
export interface Scene {
  cells: Uint8Array;
  guns: { cx: number; cy: number; alive?: boolean }[];
  depots?: { cx: number; cy: number; n: number }[];
}

/** Контейнеры с дронами — их видит только хозяин склада. */
export function drawDepots(
  ctx: CanvasRenderingContext2D,
  depots: { cx: number; cy: number; n: number }[],
  cell: number,
  dim = false
) {
  for (const d of depots) {
    const x = d.cx * cell;
    const y = d.cy * cell;
    ctx.fillStyle = dim ? "rgba(122, 90, 46, 0.5)" : "#7a5a2e";
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = dim ? "rgba(214, 168, 92, 0.5)" : "#d6a85c";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    ctx.beginPath();
    ctx.moveTo(x + cell * 0.5, y + 1);
    ctx.lineTo(x + cell * 0.5, y + cell - 1);
    ctx.stroke();
  }
}

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export function applyView(ctx: CanvasRenderingContext2D, dpr: number, v: View) {
  const k = dpr * v.zoom;
  ctx.setTransform(k, 0, 0, k, -v.panX * k, -v.panY * k);
}

/** Статичный слой: земля, склад, пепелище, тумбы пушек. */
export function drawStatic(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  cell: number,
  zoom = 1
) {
  ctx.fillStyle = COLORS.groundA;
  ctx.fillRect(0, 0, GRID * cell, GRID * cell);

  ctx.fillStyle = COLORS.groundB;
  for (let y = 0; y < GRID; y++) {
    for (let x = y & 1; x < GRID; x += 2) {
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const v = s.cells[y * GRID + x];
      if (v === 0) continue;
      if (v === G_BASE) ctx.fillStyle = COLORS.base;
      else if (v === G_BURNT) ctx.fillStyle = COLORS.burnt;
      else if (v === G_SCORCH) ctx.fillStyle = COLORS.scorch;
      else ctx.fillStyle = "#e0561a"; // подложка под огонь
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // на приближении показываем сетку клеток — по ней целишься
  if (cell * zoom >= 14) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.lineWidth = 0.5 / zoom;
    ctx.beginPath();
    for (let i = 0; i <= GRID; i++) {
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, GRID * cell);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(GRID * cell, i * cell);
    }
    ctx.stroke();
  }

  for (const g of s.guns) {
    if (g.alive === false) {
      ctx.fillStyle = "#4a4a4a";
      ctx.fillRect(g.cx * cell, g.cy * cell, cell, cell);
      continue;
    }
    ctx.fillStyle = COLORS.gun;
    ctx.fillRect(g.cx * cell, g.cy * cell, cell, cell);
    ctx.fillStyle = COLORS.gunTop;
    ctx.fillRect(g.cx * cell + cell * 0.25, g.cy * cell + cell * 0.25, cell * 0.5, cell * 0.5);
  }
}

/**
 * Общее поле покрытия ПВО. Все круги одним путём — тогда перекрытия
 * не темнеют и зона читается как единая.
 */
export function drawCoverage(
  ctx: CanvasRenderingContext2D,
  guns: Gun[] | { cx: number; cy: number; alive?: boolean }[],
  cell: number
) {
  const live = guns.filter((g) => (g as { alive?: boolean }).alive !== false);
  if (!live.length) return;
  ctx.beginPath();
  for (const g of live) {
    const cx = (g.cx + 0.5) * cell;
    const cy = (g.cy + 0.5) * cell;
    const r = (GUN_RANGE + 0.5) * cell;
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = COLORS.range;
  ctx.fill();
  ctx.strokeStyle = COLORS.rangeLine;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Динамика боя: прицел, огонь, дроны, ракеты, взрывы. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  cell: number,
  hover: { x: number; y: number } | null,
  now: number
) {
  drawDepots(ctx, s.depots, cell);

  // следы пуль в земле
  ctx.fillStyle = "rgba(26, 22, 16, 0.75)";
  for (const h of s.holes) {
    const r = cell * (0.16 + h.seed * 0.14);
    ctx.beginPath();
    ctx.arc(h.x * cell, h.y * cell, r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCoverage(ctx, s.guns, cell);

  // прицел: над зданием он водяной, над землёй стрелковый
  if (s.phase === "playing" && hover) {
    const water = isBuilding(s.cells[hover.y * GRID + hover.x]);
    const px = (hover.x + 0.5) * cell;
    const py = (hover.y + 0.5) * cell;
    ctx.strokeStyle = water ? COLORS.water : COLORS.flash;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, cell * 2, 0, Math.PI * 2);
    ctx.moveTo(px - cell * 3, py);
    ctx.lineTo(px - cell * 1.2, py);
    ctx.moveTo(px + cell * 1.2, py);
    ctx.lineTo(px + cell * 3, py);
    ctx.moveTo(px, py - cell * 3);
    ctx.lineTo(px, py - cell * 1.2);
    ctx.moveTo(px, py + cell * 1.2);
    ctx.lineTo(px, py + cell * 3);
    ctx.stroke();
  }

  // огонь
  for (const i of s.fire.keys()) {
    const x = i % GRID;
    const y = (i / GRID) | 0;
    const f = 0.5 + 0.5 * Math.sin(now * 0.012 + (x * 7 + y * 13));
    ctx.fillStyle = `rgb(${230 + f * 25}, ${70 + f * 90}, 20)`;
    ctx.fillRect(x * cell, y * cell, cell, cell);
    ctx.fillStyle = `rgba(255, 240, 160, ${0.25 + f * 0.45})`;
    ctx.fillRect(x * cell + cell * 0.3, y * cell + cell * 0.3, cell * 0.4, cell * 0.4);
  }

  // чёрный дым за подбитыми
  for (const p of s.puffs) {
    const k = p.t / SMOKE_LIFE;
    ctx.fillStyle = `rgba(${COLORS.smoke}, ${0.5 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(p.x * cell, p.y * cell, p.r * cell * (0.6 + k * 1.6), 0, Math.PI * 2);
    ctx.fill();
  }

  // ракеты
  ctx.strokeStyle = COLORS.missile;
  ctx.lineWidth = Math.max(1, cell * 0.25);
  ctx.beginPath();
  for (const m of s.missiles) {
    ctx.moveTo((m.x - m.dx * 0.9) * cell, (m.y - m.dy * 0.9) * cell);
    ctx.lineTo(m.x * cell, m.y * cell);
  }
  ctx.stroke();

  // дроны
  const r = cell * 0.85;
  ctx.lineWidth = Math.max(1, cell * 0.18);
  for (const d of s.drones) {
    const px = d.x * cell;
    const py = d.y * cell;
    ctx.strokeStyle = COLORS.drone;
    ctx.beginPath();
    ctx.moveTo(px - r, py - r);
    ctx.lineTo(px + r, py + r);
    ctx.moveTo(px + r, py - r);
    ctx.lineTo(px - r, py + r);
    ctx.stroke();
    ctx.fillStyle = COLORS.drone;
    for (const [ox, oy] of [
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
    ]) {
      ctx.beginPath();
      ctx.arc(px + ox, py + oy, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.droneAccent;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // вспышки очередей и всплески воды
  for (const sh of s.shots) {
    const k = 1 - sh.t / SHOT_LIFE;
    const px = sh.x * cell;
    const py = sh.y * cell;
    if (sh.water) {
      ctx.strokeStyle = `rgba(121, 199, 255, ${0.9 * k})`;
      ctx.lineWidth = Math.max(1, cell * 0.3);
      ctx.beginPath();
      for (let n = 0; n < 5; n++) {
        const a = -Math.PI / 2 + (n - 2) * 0.45 + (sh.seed - 0.5) * 0.3;
        const len = cell * (1.1 + sh.seed * 0.8);
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(200, 235, 255, ${0.8 * k})`;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const rr = cell * (1 + sh.seed * 0.7);
      ctx.strokeStyle = `rgba(255, 233, 168, ${k})`;
      ctx.lineWidth = Math.max(1, cell * 0.25);
      ctx.beginPath();
      for (let n = 0; n < 4; n++) {
        const a = (n / 4) * Math.PI + sh.seed * 2;
        ctx.moveTo(px - Math.cos(a) * rr, py - Math.sin(a) * rr);
        ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 220, ${k})`;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // взрывы
  for (const b of s.booms) {
    const k = b.t / 0.5;
    ctx.strokeStyle = `rgba(255, 200, 90, ${1 - k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x * cell, b.y * cell, b.r * cell * (0.3 + k), 0, Math.PI * 2);
    ctx.stroke();
  }
}
