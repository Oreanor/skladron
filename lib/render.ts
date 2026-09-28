import {
  GRID,
  G_BASE,
  G_BURNT,
  G_FIRE,
  G_SCORCH,
  type Gun,
} from "./base";
import {
  aimMode,
  gunRange,
  sprayRange,
  suppressRange,
  trapRange,
  type GameState,
} from "./engine";
import { FX, GUN, SPRAY, SUPPRESS, TRAP } from "./tuning";
import { COLORS } from "./render/colors";
import {
  drawDepots,
  drawSpray,
  drawTrap,
  drawTurret,
} from "./render/pieces";

// Палитра и сами предметы живут в render/: их правят отдельно от кадра боя.
export { COLORS } from "./render/colors";
export { drawDepots, drawScoutPlane, drawSpray, drawTrap, drawTurret } from "./render/pieces";

/** Всё, что нужно для отрисовки карты — и бою, и редактору. */
export interface Scene {
  cells: Uint8Array;
  guns: { cx: number; cy: number; alive?: boolean; kind?: string }[];
  depots?: { cx: number; cy: number; n: number }[];
}

/** Как карта сейчас показана: масштаб и сдвиг. */
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8;

export function applyView(ctx: CanvasRenderingContext2D, dpr: number, v: View) {
  const k = dpr * v.zoom;
  ctx.setTransform(k, 0, 0, k, -v.panX * k, -v.panY * k);
}

/** Статичный слой: земля, склад, пепелище, тумбы пушек. */
/** Видимый кусок карты в клетках — рисовать остальное незачем. */
export interface Clip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const FULL: Clip = { x0: 0, y0: 0, x1: GRID, y1: GRID };

export function drawStatic(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  cell: number,
  zoom = 1,
  clip: Clip = FULL
) {
  const x0 = Math.max(0, clip.x0);
  const y0 = Math.max(0, clip.y0);
  const x1 = Math.min(GRID, clip.x1);
  const y1 = Math.min(GRID, clip.y1);

  ctx.fillStyle = COLORS.groundA;
  ctx.fillRect(x0 * cell, y0 * cell, (x1 - x0) * cell, (y1 - y0) * cell);

  ctx.fillStyle = COLORS.groundB;
  for (let y = y0; y < y1; y++) {
    for (let x = x0 + ((x0 ^ y) & 1); x < x1; x += 2) {
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // Клетки красим слоями, по цвету за проход: смена fillStyle стоит дороже
  // самой заливки, а раньше она случалась на каждую из десяти тысяч клеток.
  const layers: [number, string][] = [
    [G_BASE, COLORS.base],
    [G_BURNT, COLORS.burnt],
    [G_SCORCH, COLORS.scorch],
    [G_FIRE, "#e0561a"], // подложка под огонь
  ];
  for (const [value, color] of layers) {
    ctx.fillStyle = color;
    for (let y = y0; y < y1; y++) {
      const row = y * GRID;
      for (let x = x0; x < x1; x++) {
        if (s.cells[row + x] === value) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  // на приближении показываем сетку клеток — по ней целишься
  if (cell * zoom >= 14) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.lineWidth = 0.5 / zoom;
    ctx.beginPath();
    for (let i = x0; i <= x1; i++) {
      ctx.moveTo(i * cell, y0 * cell);
      ctx.lineTo(i * cell, y1 * cell);
    }
    for (let i = y0; i <= y1; i++) {
      ctx.moveTo(x0 * cell, i * cell);
      ctx.lineTo(x1 * cell, i * cell);
    }
    ctx.stroke();
  }

  for (const g of s.guns) {
    const angle = Math.atan2(g.cy + 0.5 - GRID / 2, g.cx + 0.5 - GRID / 2);
    // Ствол смотрит наружу от середины склада, пока не начался бой: в бою
    // поверх этого слоя рисуется живая башня со своим углом.
    if (g.kind === "spray") drawSpray(ctx, g.cx, g.cy, cell, angle, 0, g.alive !== false);
    else if (g.kind === "trap") drawTrap(ctx, g.cx, g.cy, cell, g.alive !== false);
    else drawTurret(ctx, g.cx, g.cy, cell, angle, g.alive !== false);
  }
}

/** Чьи круги покрытия показывать: зениток, огнетушителей, ловушек. */
export type CoverageKind = "gun" | "spray" | "trap";

export function drawCoverage(
  ctx: CanvasRenderingContext2D,
  guns:
    | Gun[]
    | {
        cx: number;
        cy: number;
        alive?: boolean;
        kind?: string;
        spray?: boolean;
        trap?: boolean;
      }[],
  cell: number,
  range: number = GUN.range,
  spraysRange: number = SPRAY.range,
  trapsRange: number = TRAP.range,
  /**
   * Чьи круги рисовать. Пусто — ничьи: три набора кругов разом закрывают
   * склад так, что на нём уже ничего не разглядеть, поэтому в лобби видны
   * только круги того, что сейчас ставят.
   */
  show: readonly CoverageKind[] = ["gun", "spray", "trap"]
) {
  if (!show.length) return;
  const live = guns.filter((g) => (g as { alive?: boolean }).alive !== false);
  if (!live.length) return;
  const kindOf = (g: { kind?: string; spray?: boolean; trap?: boolean }) =>
    g.kind === "trap" || g.trap === true
      ? "trap"
      : g.kind === "spray" || g.spray === true
        ? "spray"
        : "gun";
  const styles = {
    gun: { r: range, fill: COLORS.range, stroke: COLORS.rangeLine },
    spray: {
      r: spraysRange,
      fill: "rgba(214, 64, 56, 0.12)",
      stroke: "rgba(255, 128, 121, 0.4)",
    },
    trap: {
      r: trapsRange,
      fill: COLORS.trapRange,
      stroke: COLORS.trapRangeLine,
    },
  } as const;
  for (const kind of show) {
    const part = live.filter((g) => kindOf(g) === kind);
    if (!part.length) continue;
    const st = styles[kind];
    const r = (st.r + 0.5) * cell;
    ctx.beginPath();
    for (const g of part) {
      const cx = (g.cx + 0.5) * cell;
      const cy = (g.cy + 0.5) * cell;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
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

  const reach = sprayRange(s);
  const trapsReach = trapRange(s);
  drawCoverage(ctx, s.guns, cell, gunRange(s), reach, trapsReach);
  for (const g of s.guns) {
    if (g.spray)
      drawSpray(ctx, g.cx, g.cy, cell, g.angle, g.wet, g.alive, reach, g.tank / SPRAY.tank);
    else if (g.trap) {
      let held = 0;
      if (g.alive) {
        for (const d of s.drones) if (d.heldBy === g.id) held++;
      }
      drawTrap(ctx, g.cx, g.cy, cell, g.alive, held, now, trapsReach);
    } else drawTurret(ctx, g.cx, g.cy, cell, g.angle, g.alive);
  }

  // прицел красим тем же правилом, по которому игра и стреляет: захваченный
  // дрон делает его стрелковым даже над складом
  if (s.phase === "playing" && hover) {
    const ax = s.aim ? s.aim.x : hover.x + 0.5;
    const ay = s.aim ? s.aim.y : hover.y + 0.5;
    const water = aimMode(s, ax, ay) === "water";
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
    const k = p.t / FX.smokeLife;
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

  // Круг подавления. Рисуем у всех подавителей, а не только у севших на
  // круг: глушат они с первой секунды полёта, и по кругу видно, до каких
  // установок рой уже дотянулся. Обводка пульсирует — иначе на пёстрой
  // карте кольцо теряется среди прочих кругов.
  const jammers = s.drones.filter(
    (d) => !d.hit && !d.heldBy && (d.payload === "jammer" || d.payload === "foamer")
  );
  if (jammers.length) {
    const reach = suppressRange(s) * cell;
    const pulse = 0.75 + 0.25 * Math.sin(now / 160);
    for (const d of jammers) {
      const foam = d.payload === "foamer";
      const x = d.x * cell;
      const y = d.y * cell;

      ctx.beginPath();
      ctx.arc(x, y, reach, 0, Math.PI * 2);
      ctx.fillStyle = foam ? COLORS.foamFill : COLORS.jamFill;
      ctx.fill();

      // сплошной обод плюс бегущий пунктир поверх: круг читается и на
      // выгоревшем чёрном, и на белом складе
      ctx.strokeStyle = foam ? COLORS.foam : COLORS.jam;
      ctx.lineWidth = Math.max(1.5, cell * 0.2 * pulse);
      ctx.stroke();

      ctx.save();
      ctx.setLineDash([cell * 1.6, cell * 1.2]);
      ctx.lineDashOffset = -(now / 24) % (cell * 2.8);
      ctx.lineWidth = Math.max(1, cell * 0.3);
      ctx.stroke();
      ctx.restore();
    }
  }

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
    ctx.fillStyle = COLORS.payload[d.payload] ?? COLORS.droneAccent;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Топливо подавителя — дугой вокруг боеголовки, как бак огнетушителя.
    // Горит только на круге над жертвой; пока летит — полный запас (~30 с).
    if (
      !d.hit &&
      (d.payload === "jammer" || d.payload === "foamer") &&
      d.fuel > 0
    ) {
      const frac = Math.max(0, Math.min(1, d.fuel / SUPPRESS.loiter));
      const foam = d.payload === "foamer";
      const ring = r * 0.7;
      ctx.beginPath();
      ctx.arc(px, py, ring, 0, Math.PI * 2);
      ctx.strokeStyle = foam ? "rgba(34, 211, 238, 0.25)" : "rgba(168, 85, 247, 0.25)";
      ctx.lineWidth = Math.max(1.5, cell * 0.16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.strokeStyle = foam ? COLORS.foam : COLORS.jam;
      ctx.stroke();
    }
  }
  ctx.lineWidth = Math.max(1, cell * 0.18);

  // И сами заглушённые установки: живые, но молчат. Крестик поверх виден
  // даже там, где круг перекрыт соседним.
  for (const g of s.guns) {
    if (!g.alive || g.jammed <= 0) continue;
    const x = (g.cx + 0.5) * cell;
    const y = (g.cy + 0.5) * cell;
    const rr = cell * 0.55;
    ctx.strokeStyle = g.spray ? COLORS.foamed : COLORS.jammed;
    ctx.lineWidth = Math.max(1, cell * 0.16);
    ctx.beginPath();
    ctx.moveTo(x - rr, y - rr);
    ctx.lineTo(x + rr, y + rr);
    ctx.moveTo(x + rr, y - rr);
    ctx.lineTo(x - rr, y + rr);
    ctx.stroke();
  }

  // вспышки очередей и всплески воды
  for (const sh of s.shots) {
    const k = 1 - sh.t / FX.shotLife;
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
