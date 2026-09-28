/*
 * Как выглядят предметы на карте: контейнер, огнетушитель, ловушка, турель,
 * самолёт разведки. Отдельно от остальной отрисовки потому, что правят это
 * чаще всего остального и по одному: поменять вид ловушки — значит зайти
 * сюда, а не листать кадр боя целиком.
 *
 * Все рисуют в игровых координатах: клетка равна cell пикселей, начало — в
 * левом верхнем углу клетки. Цвета берутся из соседнего colors.ts.
 */

import { SPRAY, TRAP } from "../tuning";
import { COLORS } from "./colors";

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
