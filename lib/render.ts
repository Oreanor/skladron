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

export const COLORS = {
  groundA: "#3d6b3a",
  groundB: "#3a6537",
  base: "#f2f2ec",
  burnt: "#141414",
  scorch: "#1c1a14",
  gun: "#1b2a41",
  gunTop: "#8ecae6",
  // Огнетушитель красный, как ему и положено: тем же красным обведена его
  // зона тушения, и на карте сразу видно, чей это круг.
  spray: "#6e2320",
  sprayTop: "#8f2c28",
  // Ловушка — бронза/янтарь: не путать с голубой зениткой и красным огнетушителем.
  trap: "#5a4320",
  trapTop: "#e0b84a",
  trapRange: "rgba(224, 184, 74, 0.14)",
  trapRangeLine: "rgba(232, 196, 90, 0.5)",
  range: "rgba(120, 200, 255, 0.16)",
  rangeLine: "rgba(140, 215, 255, 0.55)",
  drone: "#2b2b2b",
  droneAccent: "#e5383b",
  /**
   * Начинка видна по цвету боеголовки. Корпус у всех одинаково тёмный —
   * по нему дрон и читается дроном, — а вот пятно в середине разное, и на
   * подлёте сразу понятно, что именно летит.
   */
  payload: {
    plain: "#e5383b", // красный — обычная взрывчатка
    heavy: "#f59f00", // оранжевый — двойной заряд
    jammer: "#a855f7", // фиолетовый — глушилка зениток
    foamer: "#22d3ee", // голубой — глушилка огнетушителей
  } as Record<string, string>,
  /** Круг подавления. Заметный: по нему видно, какие установки молчат. */
  jam: "rgba(168, 85, 247, 0.85)",
  jamFill: "rgba(168, 85, 247, 0.17)",
  foam: "rgba(34, 211, 238, 0.85)",
  foamFill: "rgba(34, 211, 238, 0.17)",
  /** Перечёркнутая установка: она жива, но заглушена. */
  jammed: "rgba(168, 85, 247, 0.95)",
  foamed: "rgba(34, 211, 238, 0.95)",
  missile: "#ffd166",
  water: "#79c7ff",
  flash: "#ffe9a8",
  smoke: "20, 20, 20",
};

/** Всё, что нужно для отрисовки карты — и бою, и редактору. */
export interface Scene {
  cells: Uint8Array;
  guns: { cx: number; cy: number; alive?: boolean; kind?: string }[];
  depots?: { cx: number; cy: number; n: number }[];
}

/** Контейнеры с дронами — их видит только хозяин склада. */
/**
 * Контейнеры на складе. На крышке рисуем то, что внутри: винты квадрокоптера
 * у ударных дронов и силуэт самолёта у разведчиков — иначе на карте не
 * отличить, где какой ящик.
 */
export function drawDepots(
  ctx: CanvasRenderingContext2D,
  depots: { cx: number; cy: number; n: number; kind?: "basic" | "scout" }[],
  cell: number,
  dim = false
) {
  for (const d of depots) {
    const x = d.cx * cell;
    const y = d.cy * cell;
    const scout = d.kind === "scout";
    const fill = scout ? "58, 74, 46" : "122, 90, 46";
    const line = scout ? "168, 200, 130" : "214, 168, 92";
    ctx.fillStyle = `rgba(${fill}, ${dim ? 0.5 : 1})`;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = `rgba(${line}, ${dim ? 0.5 : 1})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

    // у разведчиков вместо винтов силуэт самолёта
    if (scout) {
      ctx.beginPath();
      ctx.moveTo(x + cell * 0.5, y + cell * 0.15);
      ctx.lineTo(x + cell * 0.5, y + cell * 0.85);
      ctx.moveTo(x + cell * 0.18, y + cell * 0.52);
      ctx.lineTo(x + cell * 0.82, y + cell * 0.52);
      ctx.moveTo(x + cell * 0.34, y + cell * 0.8);
      ctx.lineTo(x + cell * 0.66, y + cell * 0.8);
      ctx.stroke();
      continue;
    }

    // винты по углам и корпус между ними — клетка всего 7 px, так что это
    // не рисунок, а узнаваемое пятно
    const r = cell * 0.13;
    const off = cell * 0.28;
    const rotors: [number, number][] = [
      [off, off],
      [cell - off, off],
      [off, cell - off],
      [cell - off, cell - off],
    ];
    ctx.beginPath();
    for (const [ox, oy] of rotors) {
      ctx.moveTo(x + ox + r, y + oy);
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.fillRect(x + cell * 0.4, y + cell * 0.4, cell * 0.2, cell * 0.2);
  }
}

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

/**
 * Разведывательный БПЛА сверху: узкий корпус, стреловидное крыло и хвостовое
 * оперение. Рисуется в начале координат носом по +x — поворот и перенос
 * делает вызывающий.
 */
export function drawScoutPlane(ctx: CanvasRenderingContext2D, cell: number) {
  const wing = (side: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(cell * 0.55, side * cell * 0.2);
    ctx.lineTo(-cell * 0.6, side * cell * 1.65);
    ctx.lineTo(-cell * 1.05, side * cell * 1.65);
    ctx.lineTo(-cell * 0.35, side * cell * 0.2);
    ctx.closePath();
    ctx.fill();
  };
  const tail = (side: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(-cell * 0.95, side * cell * 0.15);
    ctx.lineTo(-cell * 1.4, side * cell * 0.75);
    ctx.lineTo(-cell * 1.6, side * cell * 0.75);
    ctx.lineTo(-cell * 1.35, side * cell * 0.15);
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = "#5f96b4";
  wing(1);
  wing(-1);
  tail(1);
  tail(-1);

  // корпус
  ctx.fillStyle = "#8ecae6";
  ctx.beginPath();
  ctx.moveTo(cell * 1.9, 0);
  ctx.quadraticCurveTo(cell * 0.7, -cell * 0.32, -cell * 1.6, -cell * 0.2);
  ctx.lineTo(-cell * 1.6, cell * 0.2);
  ctx.quadraticCurveTo(cell * 0.7, cell * 0.32, cell * 1.9, 0);
  ctx.fill();

  // фонарь кабины — по нему видно, где у машины нос
  ctx.fillStyle = "#e8f6ff";
  ctx.beginPath();
  ctx.ellipse(cell * 0.5, 0, cell * 0.3, cell * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Огнетушитель сверху: бак с горловиной и форсунками по кругу.
 * Когда льёт — звезда струй; остаток воды — дугой по ободу.
 */
export function drawSpray(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  angle: number,
  wet: number,
  alive = true,
  range: number = SPRAY.range,
  /** Сколько воды осталось в баке, от нуля до единицы. */
  tank = 1
) {
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;
  const r = cell * 0.44;
  const body = alive ? (tank > 0 ? COLORS.spray : "#2a2f33") : "#3f3f3f";
  const accent = alive ? COLORS.sprayTop : "#555";
  const shade = alive ? "#3a1412" : "#2a2a2a";
  const metal = alive ? "#c45a52" : "#666";

  if (alive && wet > 0) {
    ctx.strokeStyle = "rgba(121, 199, 255, 0.75)";
    ctx.lineWidth = Math.max(1, cell * 0.22);
    ctx.beginPath();
    for (let j = 0; j < SPRAY.jets; j++) {
      const a = angle + (j * Math.PI * 2) / SPRAY.jets;
      ctx.moveTo(x + Math.cos(a) * cell * 0.55, y + Math.sin(a) * cell * 0.55);
      ctx.lineTo(x + Math.cos(a) * cell * range, y + Math.sin(a) * cell * range);
    }
    ctx.stroke();
  }

  // Площадка-основание.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(0.55, cell * 0.1);
  ctx.stroke();

  // Цилиндр бака.
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = metal;
  ctx.lineWidth = Math.max(0.5, cell * 0.08);
  ctx.stroke();

  // Кольцевой шов на баке.
  if (alive) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = shade;
    ctx.lineWidth = Math.max(0.5, cell * 0.06);
    ctx.stroke();
  }

  // Форсунки по кругу — восемь точек, как струй.
  if (alive) {
    for (let j = 0; j < SPRAY.jets; j++) {
      const a = angle + (j * Math.PI * 2) / SPRAY.jets;
      const nx = x + Math.cos(a) * r * 0.82;
      const ny = y + Math.sin(a) * r * 0.82;
      ctx.beginPath();
      ctx.arc(nx, ny, Math.max(0.7, cell * 0.09), 0, Math.PI * 2);
      ctx.fillStyle = wet > 0 ? COLORS.water : metal;
      ctx.fill();
    }
  }

  // Горловина и рукоять сверху.
  ctx.beginPath();
  ctx.arc(x, y, cell * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  if (alive) {
    ctx.fillStyle = metal;
    ctx.fillRect(x - cell * 0.05, y - cell * 0.28, cell * 0.1, cell * 0.18);
    ctx.fillStyle = "#e8f0ff";
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  // Остаток воды — дугой по ободу: пустой бак виден сразу.
  if (alive && tank > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * tank);
    ctx.strokeStyle = "rgba(121, 199, 255, 0.85)";
    ctx.lineWidth = Math.max(0.7, cell * 0.12);
    ctx.stroke();
  }
}

/**
 * Ловушка: восьмиугольная платформа с подковообразным магнитом.
 * При удержании — кольца, которые сжимаются к центру.
 */
export function drawTrap(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  alive = true,
  held = 0,
  now = 0,
  range: number = TRAP.range
) {
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;
  const half = cell * 0.42;
  const body = alive ? COLORS.trap : "#3f3f3f";
  const accent = alive ? COLORS.trapTop : "#555";
  const shade = alive ? "#3a2c14" : "#2a2a2a";
  const poleN = alive ? "#d8e8ff" : "#777";
  const poleS = alive ? "#e07050" : "#666";

  if (alive && held > 0) {
    const maxR = range * cell;
    const rings = 4;
    for (let i = 0; i < rings; i++) {
      const phase = ((now * 0.0018 + i / rings) % 1 + 1) % 1;
      const rr = maxR * (1 - phase);
      const a = 0.55 * (1 - phase);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(cell * 0.2, rr), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(224, 184, 74, ${a})`;
      ctx.lineWidth = Math.max(1, cell * 0.12);
      ctx.stroke();
    }
  }

  // Восьмиугольная площадка.
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const px = x + Math.cos(a) * half;
    const py = y + Math.sin(a) * half;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(0.6, cell * 0.1);
  ctx.stroke();

  // Внутренняя плита.
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const px = x + Math.cos(a) * half * 0.62;
    const py = y + Math.sin(a) * half * 0.62;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = shade;
  ctx.fill();

  if (!alive) return;

  // Подкова магнита: два полюса и дуга между ними.
  const pr = cell * 0.13;
  const ox = cell * 0.2;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.2, cell * 0.16);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, cell * 0.22, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.lineCap = "butt";

  ctx.fillStyle = poleN;
  ctx.beginPath();
  ctx.arc(x - ox, y + cell * 0.06, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = poleS;
  ctx.beginPath();
  ctx.arc(x + ox, y + cell * 0.06, pr, 0, Math.PI * 2);
  ctx.fill();

  // Центральный сердечник.
  ctx.beginPath();
  ctx.arc(x, y - cell * 0.06, cell * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

/**
 * Зенитка сверху: площадка, башня со щитком, ствол с дульным кольцом.
 * На мелкой клетке силуэт всё ещё читается как «пушка смотрит сюда».
 */
export function drawTurret(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  angle: number,
  alive = true
) {
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;
  const r = cell * 0.46;
  const body = alive ? COLORS.gun : "#3f3f3f";
  const accent = alive ? COLORS.gunTop : "#555";
  const shade = alive ? "#121c2c" : "#2a2a2a";
  const plate = alive ? "#243652" : "#363636";

  // Площадка и обод — база, на которой крутится башня.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(0.55, cell * 0.1);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Четыре «болта» по краю площадки — чуть живее, чем голый круг.
  if (alive && cell >= 5) {
    ctx.fillStyle = accent;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(a) * r * 0.72,
        y + Math.sin(a) * r * 0.72,
        Math.max(0.6, cell * 0.07),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  if (!alive) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Боковые уши-противовесы: башня шире ствола.
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(-cell * 0.08, -cell * 0.34);
  ctx.lineTo(cell * 0.22, -cell * 0.28);
  ctx.lineTo(cell * 0.22, cell * 0.28);
  ctx.lineTo(-cell * 0.08, cell * 0.34);
  ctx.closePath();
  ctx.fill();

  // Щиток перед башней.
  ctx.fillStyle = accent;
  ctx.fillRect(cell * 0.08, -cell * 0.26, cell * 0.22, cell * 0.52);
  ctx.fillStyle = shade;
  ctx.fillRect(cell * 0.14, -cell * 0.16, cell * 0.1, cell * 0.32);

  // Ствол: тёмная труба + светлая казённая часть.
  ctx.fillStyle = accent;
  ctx.fillRect(cell * 0.18, -cell * 0.11, cell * 0.28, cell * 0.22);
  ctx.fillStyle = shade;
  ctx.fillRect(cell * 0.42, -cell * 0.09, cell * 0.58, cell * 0.18);
  // Тонкая щель по оси ствола — читается как канал.
  ctx.fillStyle = alive ? "#6aa8c4" : "#666";
  ctx.fillRect(cell * 0.48, -cell * 0.025, cell * 0.48, cell * 0.05);

  // Дульное кольцо.
  ctx.fillStyle = accent;
  ctx.fillRect(cell * 0.92, -cell * 0.14, cell * 0.14, cell * 0.28);
  ctx.fillStyle = shade;
  ctx.fillRect(cell * 1.0, -cell * 0.08, cell * 0.08, cell * 0.16);

  // Купол башни и «прицел».
  ctx.beginPath();
  ctx.arc(0, 0, cell * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cell * 0.02, -cell * 0.05, cell * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = "#e8f6ff";
  ctx.fill();

  ctx.restore();
}

/**
 * Общее поле покрытия ПВО. Все круги одним путём — тогда перекрытия
 * не темнеют и зона читается как единая.
 */
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
  trapsRange: number = TRAP.range
) {
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
  for (const kind of ["gun", "spray", "trap"] as const) {
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
