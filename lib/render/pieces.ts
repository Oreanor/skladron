/*
 * Как выглядят предметы на карте: контейнер, огнетушитель, ловушка, турель,
 * дроны в контейнере. Отдельно от остальной отрисовки потому, что правят это
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
 * Контейнеры на складе. На крышке рисуем то, что внутри: винты у дронов,
 * кружок с верёвкой у шаров. Клетка всего семь точек, так что это не
 * рисунок, а узнаваемое пятно.
 */
export function drawDepots(
  ctx: CanvasRenderingContext2D,
  depots: { cx: number; cy: number; n: number; kind?: string }[],
  cell: number,
  dim = false
) {
  const a = dim ? 0.5 : 1;
  // Ящик меньше клетки: между соседями остаётся щель, и ряд контейнеров
  // читается как ящики, а не сливается в одну плитку.
  const gap = cell * 0.07;
  for (const d of depots) {
    const x = d.cx * cell;
    const y = d.cy * cell;
    const balloons = d.kind === "balloon";
    // Светлый ящик и приглушённый рисунок: тёмные ящики со светлым дроном
    // на светлом полу рябили сплошным рядом.
    const fill = balloons ? "226, 150, 144" : "206, 170, 116";
    const line = balloons ? "156, 52, 56" : "128, 92, 50";
    ctx.fillStyle = `rgba(${fill}, ${a})`;
    ctx.beginPath();
    ctx.roundRect(x + gap, y + gap, cell - gap * 2, cell - gap * 2, cell * 0.1);
    ctx.fill();
    const mx = x + cell * 0.5;
    const my = y + cell * 0.5;
    ctx.fillStyle = `rgba(${line}, ${a})`;
    ctx.strokeStyle = `rgba(${line}, ${a})`;

    if (balloons) {
      // Шар: залитый кружок с бликом и тонкая верёвочка вниз.
      const cy = y + cell * 0.42;
      const r = cell * 0.27;
      ctx.lineWidth = cell * 0.05;
      ctx.beginPath();
      ctx.moveTo(mx, cy + r);
      ctx.lineTo(mx, y + cell * 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 235, 230, ${0.8 * a})`;
      ctx.beginPath();
      ctx.arc(mx - r * 0.35, cy - r * 0.35, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // Квадрокоптер сверху, с полями до края ящика: тонкие рамы крестом, на
    // концах — прозрачный диск винта с лопастью поперёк рамы, в центре —
    // корпус с камерой спереди.
    const off = cell * 0.21;
    const disc = cell * 0.14;
    ctx.lineWidth = cell * 0.055;
    ctx.beginPath();
    ctx.moveTo(mx - off, my - off);
    ctx.lineTo(mx + off, my + off);
    ctx.moveTo(mx + off, my - off);
    ctx.lineTo(mx - off, my + off);
    ctx.stroke();
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const rx = mx + dx * off;
      const ry = my + dy * off;
      ctx.fillStyle = `rgba(${line}, ${0.18 * a})`;
      ctx.beginPath();
      ctx.arc(rx, ry, disc, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${line}, ${a})`;
      ctx.beginPath();
      ctx.ellipse(rx, ry, disc, cell * 0.03, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(mx - cell * 0.1, my - cell * 0.13, cell * 0.2, cell * 0.26, cell * 0.07);
    ctx.fill();
    ctx.fillStyle = `rgba(${fill}, ${a})`;
    ctx.beginPath();
    ctx.arc(mx, my - cell * 0.06, cell * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Шары в воздухе. Рисуем после дронов и перед прицелом: они висят выше
 * всего, что на земле, но заслонять перекрестье им незачем.
 */
export function drawBalloons(
  ctx: CanvasRenderingContext2D,
  balloons: { id: number; x: number; y: number }[],
  cell: number
) {
  const r = cell * 0.5;

  // Тела одним проходом: цвет у всех один, а смена fillStyle стоит дороже
  // самой заливки — шаров над складом бывают сотни.
  ctx.beginPath();
  for (const b of balloons) {
    ctx.moveTo(b.x * cell + r, b.y * cell);
    ctx.arc(b.x * cell, b.y * cell, r, 0, Math.PI * 2);
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = COLORS.balloon;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.balloonDark;
  ctx.lineWidth = Math.max(1, cell * 0.14);
  ctx.stroke();

  // Пипка снизу: сверху её видно кружком у самого края, и именно она
  // отличает надутый шар от пузыря.
  ctx.beginPath();
  for (const b of balloons) {
    const nx = b.x * cell;
    const ny = b.y * cell + r * 0.78;
    ctx.moveTo(nx + r * 0.2, ny);
    ctx.arc(nx, ny, r * 0.2, 0, Math.PI * 2);
  }
  ctx.fillStyle = COLORS.balloonDark;
  ctx.fill();

  // Блик серпом по верхнему левому боку — тем же одним путём.
  ctx.beginPath();
  for (const b of balloons) {
    ctx.moveTo(b.x * cell, b.y * cell);
    ctx.arc(b.x * cell, b.y * cell, r * 0.62, Math.PI * 1.05, Math.PI * 1.55);
  }
  ctx.strokeStyle = COLORS.balloonGlare;
  ctx.lineWidth = Math.max(1, cell * 0.16);
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
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
  range: number = SPRAY.range
) {
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;
  const r = cell * 0.44;
  const body = alive ? COLORS.spray : "#3f3f3f";
  const accent = alive ? COLORS.sprayTop : "#555";
  const shade = alive ? "#3a1412" : "#2a2a2a";
  const metal = alive ? "#c45a52" : "#666";

  if (alive && wet > 0) {
    // Струи дышат: все разом то короче, то длиннее, от половины до полного
    // радиуса, толщина та же. Фаза — от угла поворота: он и так идёт, пока
    // установка льёт, и цикл выходит секунды в две. Только рисунок — тушит
    // она на весь радиус.
    const reach = range * (0.75 + 0.25 * Math.sin(angle));
    ctx.strokeStyle = "rgba(121, 199, 255, 0.75)";
    ctx.lineWidth = Math.max(1, cell * 0.22);
    ctx.beginPath();
    for (let j = 0; j < SPRAY.jets; j++) {
      const a = angle + (j * Math.PI * 2) / SPRAY.jets;
      ctx.moveTo(x + Math.cos(a) * cell * 0.55, y + Math.sin(a) * cell * 0.55);
      ctx.lineTo(x + Math.cos(a) * cell * reach, y + Math.sin(a) * cell * reach);
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

/** Площадка, на которой крутится башня: общая у зенитки и ракетницы. */
function drawMount(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  body: string,
  plate: string,
  accent: string,
  alive: boolean,
  /** Квадратная площадка вместо круглой — у ракетницы, чтобы и формой не путать с зениткой. */
  square = false
) {
  const r = cell * 0.46;
  const pad = (k: number) => {
    ctx.beginPath();
    if (square) ctx.roundRect(x - r * k, y - r * k, r * k * 2, r * k * 2, r * k * 0.25);
    else ctx.arc(x, y, r * k, 0, Math.PI * 2);
  };
  pad(1);
  ctx.fillStyle = body;
  ctx.fill();
  pad(0.78);
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(0.55, cell * 0.1);
  pad(1);
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
}

/**
 * Зенитка сверху: круглая площадка, станина и спарка коротких стволов с
 * дульными тормозами. Спарка тут не украшение — по ней
 * зенитка и отличается от ракетницы, у которой на том же лафете короб
 * направляющих. На мелкой клетке от рисунка остаются два штриха наружу,
 * и этого хватает, чтобы прочитать «ствол смотрит туда».
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
  const body = alive ? COLORS.gun : "#3f3f3f";
  const accent = alive ? COLORS.gunTop : "#555";
  const shade = alive ? "#121c2c" : "#2a2a2a";
  const plate = alive ? "#243652" : "#363636";

  drawMount(ctx, x, y, cell, body, plate, accent, alive);
  if (!alive) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Станина: клин, расширяющийся назад. На нём и держится вся спарка.
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(-cell * 0.34, -cell * 0.3);
  ctx.lineTo(cell * 0.06, -cell * 0.22);
  ctx.lineTo(cell * 0.06, cell * 0.22);
  ctx.lineTo(-cell * 0.34, cell * 0.3);
  ctx.closePath();
  ctx.fill();

  // Коробов с лентами по бокам тут больше нет: светлыми брусками той же
  // толщины, что и стволы, они читались парой лишних стволов назад, а не
  // ящиками. Станины под спаркой хватает, чтобы корма не выглядела пустой.

  // Казённик: скоба, что держит оба ствола.
  ctx.fillStyle = accent;
  ctx.fillRect(-cell * 0.02, -cell * 0.26, cell * 0.2, cell * 0.52);

  // Спарка: два ствола с дульными тормозами. Короткие — чуть за край
  // площадки: длинные залезали на соседнюю клетку, а там обычно своя пушка.
  for (const side of [-1, 1]) {
    const oy = side * cell * 0.14;
    ctx.fillStyle = shade;
    ctx.fillRect(cell * 0.1, oy - cell * 0.055, cell * 0.48, cell * 0.11);
    ctx.fillStyle = accent;
    ctx.fillRect(cell * 0.47, oy - cell * 0.09, cell * 0.11, cell * 0.18);
    ctx.fillStyle = alive ? "#6aa8c4" : "#666";
    ctx.fillRect(cell * 0.2, oy - cell * 0.018, cell * 0.25, cell * 0.036);
  }

  // Колпак наводчика и блик прицела — центр, вокруг которого всё вертится.
  ctx.beginPath();
  ctx.arc(-cell * 0.08, 0, cell * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-cell * 0.06, -cell * 0.04, cell * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = "#e8f6ff";
  ctx.fill();

  ctx.restore();
}

/**
 * Ракетница: квадратная площадка, а не круглая, как у зенитки, и вместо спарки — короб
 * направляющих с одной ракетой. Ракета в коробе видна, только пока
 * установка заряжена: пустой короб на карте и значит «перезаряжается».
 */
export function drawRocket(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  angle: number,
  alive = true,
  loaded = true
) {
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;
  const body = alive ? COLORS.rocket : "#3f3f3f";
  const accent = alive ? COLORS.rocketTop : "#555";
  const shade = alive ? "#1f0f05" : "#2a2a2a";
  const plate = alive ? "#5a2e12" : "#363636";

  drawMount(ctx, x, y, cell, body, plate, accent, alive, true);
  if (!alive) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Опорная рама и подъёмный механизм позади короба.
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(-cell * 0.36, -cell * 0.24);
  ctx.lineTo(-cell * 0.02, -cell * 0.3);
  ctx.lineTo(-cell * 0.02, cell * 0.3);
  ctx.lineTo(-cell * 0.36, cell * 0.24);
  ctx.closePath();
  ctx.fill();

  // Короб направляющих: широкий, приподнятый, с рёбрами по бокам.
  ctx.fillStyle = plate;
  // Короче клетки: ракета выглядывает из короба лишь носом и на соседнюю
  // установку не залезает.
  ctx.fillRect(-cell * 0.08, -cell * 0.3, cell * 0.52, cell * 0.6);
  ctx.fillStyle = accent;
  ctx.fillRect(-cell * 0.08, -cell * 0.3, cell * 0.52, cell * 0.07);
  ctx.fillRect(-cell * 0.08, cell * 0.23, cell * 0.52, cell * 0.07);

  // Сама направляющая — тёмный жёлоб по оси.
  ctx.fillStyle = shade;
  ctx.fillRect(-cell * 0.02, -cell * 0.13, cell * 0.48, cell * 0.26);

  if (loaded) {
    // Ракета в жёлобе: светлый корпус и красная головка наружу.
    ctx.fillStyle = "#dfe7ef";
    ctx.fillRect(cell * 0.04, -cell * 0.09, cell * 0.42, cell * 0.18);
    ctx.beginPath();
    ctx.moveTo(cell * 0.45, -cell * 0.09);
    ctx.lineTo(cell * 0.6, 0);
    ctx.lineTo(cell * 0.45, cell * 0.09);
    ctx.closePath();
    ctx.fillStyle = COLORS.droneAccent;
    ctx.fill();
    // Хвостовое оперение — по нему ракета читается ракетой, а не бруском.
    ctx.fillStyle = accent;
    ctx.fillRect(cell * 0.06, -cell * 0.2, cell * 0.1, cell * 0.4);
  }

  ctx.restore();
}

/**
 * Общее поле покрытия ПВО. Все круги одним путём — тогда перекрытия
 * не темнеют и зона читается как единая.
 */
