/*
 * Как выглядят предметы на карте: контейнер, огнетушитель, ловушка, турель,
 * дроны в контейнере. Отдельно от остальной отрисовки потому, что правят это
 * чаще всего остального и по одному: поменять вид ловушки — значит зайти
 * сюда, а не листать кадр боя целиком.
 *
 * Все рисуют в игровых координатах: клетка равна cell пикселей, начало — в
 * левом верхнем углу клетки. Цвета берутся из соседнего colors.ts.
 *
 * Неподвижные части — площадки, ящики, корпуса, башни — рисуются один раз в
 * готовую картинку (stamp) и дальше кладутся одним drawImage, башня — с
 * поворотом. В бою установки рисуются каждый кадр, и по полтора-два десятка
 * заливок на каждую из сотен съедали кадр целиком. Живое — струи, кольца,
 * форсунки, свет от неподвижного солнца — рисуется поверх кодом.
 *
 * Погибшая установка не рисуется вовсе: от неё остаётся обугленная клетка.
 */

import type { GunKind } from "../base";
import { SPRAY, TRAP } from "../tuning";
import { drawCharred } from "./char";
import { COLORS } from "./colors";
import { applyLight, dropShadow, shapePath } from "./light";

const TAU = Math.PI * 2;

// ---------- готовые картинки ----------

/** Точек картинки на клетку: хватает до восьмикратного приближения. */
const TEX = 128;
/** Сторона картинки в клетках: сама клетка и поля под тень и стволы. */
const STAMP = 1.5;

/** Рисует часть вокруг середины (mid, mid), где клетка — cell точек. */
type Paint = (g: CanvasRenderingContext2D, mid: number, cell: number) => void;

const stamps = new Map<string, HTMLCanvasElement | null>();

function stampOf(key: string, paint: Paint) {
  if (stamps.has(key)) return stamps.get(key)!;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    c = document.createElement("canvas");
    c.width = c.height = Math.ceil(TEX * STAMP);
    const g = c.getContext("2d");
    if (g) paint(g, c.width / 2, TEX);
    else c = null;
  }
  stamps.set(key, c);
  return c;
}

/**
 * Кладёт готовую картинку серединой в (x, y), повернув на angle. Без
 * картинок (на сервере) рисует напрямую — тем же paint.
 */
function stamp(
  ctx: CanvasRenderingContext2D,
  key: string,
  paint: Paint,
  x: number,
  y: number,
  cell: number,
  angle = 0
) {
  const img = stampOf(key, paint);
  if (!img) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    paint(ctx, 0, cell);
    ctx.restore();
    return;
  }
  const side = cell * STAMP;
  if (!angle) {
    ctx.drawImage(img, x - side / 2, y - side / 2, side, side);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -side / 2, -side / 2, side, side);
  ctx.restore();
}

// ---------- общее ----------

/** Как пушка сейчас выглядит в бою: всё, кроме места и угла, — по виду. */
export interface PieceState {
  /** Огнетушитель льёт: струи и мокрые форсунки. */
  wet?: number;
  /** Дальность струй огнетушителя или колец ловушки. */
  range?: number;
  /** Ракета в коробе ракетницы: пустой короб — перезаряжается. */
  loaded?: boolean;
  /** Сколько дронов держит ловушка: тогда по кругу бегут кольца. */
  held?: number;
  now?: number;
}

/**
 * Любая установка по виду. Одна развилка на всех: склад, кадр боя,
 * перетаскивание в лобби и значки правил раньше держали каждый свою, и в
 * одной из них пусковую шаров при перетаскивании рисовало пушкой.
 */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  kind: GunKind,
  cx: number,
  cy: number,
  cell: number,
  angle: number,
  alive = true,
  o: PieceState = {}
) {
  switch (kind) {
    case "spray":
      return drawSpray(ctx, cx, cy, cell, angle, o.wet ?? 0, alive, o.range);
    case "trap":
      return drawTrap(ctx, cx, cy, cell, alive, o.held ?? 0, o.now ?? 0, o.range);
    case "rocket":
      return drawRocket(ctx, cx, cy, cell, angle, alive, o.loaded ?? true);
    case "balloon":
      return drawBalloonPad(ctx, cx, cy, cell, alive);
    default:
      return drawTurret(ctx, cx, cy, cell, angle, alive);
  }
}

/**
 * Дрон сверху: крест рам, четыре винта по концам и цветная боеголовка в
 * середине — по её цвету и видно, что за начинка летит. r — полуразмах рамы.
 * Толщину линии ставит вызывающий: в бою она одна на всю стаю.
 */
export function drawDrone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  accent: string,
  frame: string = COLORS.drone
) {
  ctx.strokeStyle = frame;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
  ctx.fillStyle = frame;
  ctx.beginPath();
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    ctx.moveTo(x + ox + r * 0.4, y + oy);
    ctx.arc(x + ox, y + oy, r * 0.4, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, TAU);
  ctx.fill();
}

// ---------- контейнеры и шары ----------

/**
 * Контейнер целиком: тень, ящик, квадрокоптер на крышке и блик. Ящик меньше
 * клетки: между соседями остаётся щель, и ряд контейнеров читается как
 * ящики, а не сливается в одну плитку.
 */
const paintDepot: Paint = (ctx, m, cell) => {
  const half = cell / 2 - cell * 0.07;
  const off = cell * 0.21;
  const disc = cell * 0.14;
  dropShadow(ctx, "square", m, m, half, cell);
  ctx.fillStyle = COLORS.depot;
  ctx.beginPath();
  ctx.roundRect(m - half, m - half, half * 2, half * 2, cell * 0.1);
  ctx.fill();

  // Квадрокоптер сверху, с полями до края ящика: тонкие рамы крестом, на
  // концах — прозрачный диск винта с лопастью поперёк рамы, в центре —
  // корпус с камерой спереди.
  ctx.strokeStyle = COLORS.depotLine;
  ctx.lineWidth = cell * 0.055;
  ctx.beginPath();
  ctx.moveTo(m - off, m - off);
  ctx.lineTo(m + off, m + off);
  ctx.moveTo(m + off, m - off);
  ctx.lineTo(m - off, m + off);
  ctx.stroke();
  ctx.fillStyle = COLORS.depotLine;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const rx = m + dx * off;
    const ry = m + dy * off;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(rx, ry, disc, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(rx, ry, disc, cell * 0.03, Math.atan2(dy, dx) + Math.PI / 2, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(m - cell * 0.1, m - cell * 0.13, cell * 0.2, cell * 0.26, cell * 0.07);
  ctx.fill();
  ctx.fillStyle = COLORS.depot;
  ctx.beginPath();
  ctx.arc(m, m - cell * 0.06, cell * 0.035, 0, TAU);
  ctx.fill();
  applyLight(ctx, "square", m, m, half);
};

/**
 * Контейнеры с дронами на складе — их видит только хозяин. На крышке
 * квадрокоптер: клетка всего семь точек, так что это не рисунок, а
 * узнаваемое пятно. dim — бледный: так тащат ящик туда, куда нельзя.
 */
export function drawDepots(
  ctx: CanvasRenderingContext2D,
  depots: { cx: number; cy: number; n: number }[],
  cell: number,
  dim = false
) {
  if (!depots.length) return;
  ctx.globalAlpha = dim ? 0.5 : 1;
  for (const d of depots) stamp(ctx, "depot", paintDepot, (d.cx + 0.5) * cell, (d.cy + 0.5) * cell, cell);
  ctx.globalAlpha = 1;
}

/**
 * Шары в воздухе. Рисуем после дронов и перед прицелом: они висят выше
 * всего, что на земле, но заслонять перекрестье им незачем.
 */
export function drawBalloons(
  ctx: CanvasRenderingContext2D,
  all: { id: number; x: number; y: number; wait?: number }[],
  cell: number
) {
  const r = cell * 0.5;
  // ещё не выпущенные сидят в установке — их не видно
  const balloons = all.some((b) => (b.wait ?? 0) > 0) ? all.filter((b) => (b.wait ?? 0) <= 0) : all;

  // Тела одним проходом: цвет у всех один, а смена fillStyle стоит дороже
  // самой заливки — шаров над складом бывают сотни.
  ctx.beginPath();
  for (const b of balloons) {
    ctx.moveTo(b.x * cell + r, b.y * cell);
    ctx.arc(b.x * cell, b.y * cell, r, 0, TAU);
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
    ctx.arc(nx, ny, r * 0.2, 0, TAU);
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
 * Пусковая установка шаров целиком: круглая площадка и на ней шар — знак
 * того, что тут лежит запас, который выпустят разом, а не ствол. Круглая,
 * чтобы не путать с квадратными ящиками дронов.
 */
const paintBalloonPad: Paint = (ctx, m, cell) => {
  const r = cell * 0.46;
  dropShadow(ctx, "circle", m, m, r, cell);
  shapePath(ctx, "circle", m, m, r);
  ctx.fillStyle = COLORS.balloonPad;
  ctx.fill();
  ctx.strokeStyle = COLORS.balloonPadTop;
  ctx.lineWidth = cell * 0.09;
  ctx.stroke();

  // Один шар крупно — знак, а не пересчёт: семь мелких на клетке рябили.
  const br = cell * 0.27;
  const by = m - cell * 0.03;
  shapePath(ctx, "circle", m, by, br);
  ctx.fillStyle = COLORS.balloon;
  ctx.fill();
  ctx.strokeStyle = COLORS.balloonDark;
  ctx.lineWidth = cell * 0.05;
  ctx.stroke();
  // пипка снизу и блик сверху слева — по ним круг и читается шаром
  shapePath(ctx, "circle", m, by + br * 0.95, br * 0.2);
  ctx.fillStyle = COLORS.balloonDark;
  ctx.fill();
  shapePath(ctx, "circle", m - br * 0.35, by - br * 0.35, br * 0.28);
  ctx.fillStyle = COLORS.balloonGlare;
  ctx.fill();
  applyLight(ctx, "circle", m, m, r);
};

export function drawBalloonPad(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  alive = true
) {
  if (!alive) return drawCharred(ctx, cx, cy, cell);
  stamp(ctx, "balloonPad", paintBalloonPad, (cx + 0.5) * cell, (cy + 0.5) * cell, cell);
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

  ctx.fillStyle = COLORS.planeWing;
  wing(1);
  wing(-1);
  tail(1);
  tail(-1);

  // корпус
  ctx.fillStyle = COLORS.planeBody;
  ctx.beginPath();
  ctx.moveTo(cell * 1.9, 0);
  ctx.quadraticCurveTo(cell * 0.7, -cell * 0.32, -cell * 1.6, -cell * 0.2);
  ctx.lineTo(-cell * 1.6, cell * 0.2);
  ctx.quadraticCurveTo(cell * 0.7, cell * 0.32, cell * 1.9, 0);
  ctx.fill();

  // фонарь кабины — по нему видно, где у машины нос
  ctx.fillStyle = COLORS.glint;
  ctx.beginPath();
  ctx.ellipse(cell * 0.5, 0, cell * 0.3, cell * 0.17, 0, 0, TAU);
  ctx.fill();
}

// ---------- огнетушитель ----------

const SPRAY_R = 0.44;

/** Корпус огнетушителя без форсунок: тень, площадка, бак со швом, горловина и рукоять. */
const paintSprayBody: Paint = (ctx, m, cell) => {
  const r = cell * SPRAY_R;
  dropShadow(ctx, "circle", m, m, r, cell);

  // Площадка-основание.
  shapePath(ctx, "circle", m, m, r);
  ctx.fillStyle = COLORS.sprayShade;
  ctx.fill();
  ctx.strokeStyle = COLORS.sprayRim;
  ctx.lineWidth = cell * 0.1;
  ctx.stroke();

  // Цилиндр бака.
  shapePath(ctx, "circle", m, m, r * 0.72);
  ctx.fillStyle = COLORS.spray;
  ctx.fill();
  ctx.strokeStyle = COLORS.sprayMetal;
  ctx.lineWidth = cell * 0.08;
  ctx.stroke();

  // Кольцевой шов на баке.
  shapePath(ctx, "circle", m, m, r * 0.5);
  ctx.strokeStyle = COLORS.sprayShade;
  ctx.lineWidth = cell * 0.06;
  ctx.stroke();

  // Горловина и рукоять сверху.
  shapePath(ctx, "circle", m, m, cell * 0.16);
  ctx.fillStyle = COLORS.sprayRim;
  ctx.fill();
  ctx.fillStyle = COLORS.sprayMetal;
  ctx.fillRect(m - cell * 0.05, m - cell * 0.28, cell * 0.1, cell * 0.18);
  shapePath(ctx, "circle", m, m, cell * 0.06);
  ctx.fillStyle = COLORS.glint;
  ctx.fill();
};

/**
 * Огнетушитель сверху: бак с горловиной и форсунками по кругу. Когда льёт —
 * звезда струй, а форсунки мокрые. Форсунки и струи вертятся, корпус — нет.
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
  if (!alive) return drawCharred(ctx, cx, cy, cell);
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;
  const r = cell * SPRAY_R;

  if (wet > 0) {
    // Струи дышат: все разом то короче, то длиннее, от половины до полного
    // радиуса, толщина та же. Фаза — от угла поворота: он и так идёт, пока
    // установка льёт, и цикл выходит секунды в две. Только рисунок — тушит
    // она на весь радиус.
    const reach = range * (0.75 + 0.25 * Math.sin(angle));
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = COLORS.water;
    ctx.lineWidth = Math.max(1, cell * 0.22);
    ctx.beginPath();
    for (let j = 0; j < SPRAY.jets; j++) {
      const a = angle + (j * TAU) / SPRAY.jets;
      ctx.moveTo(x + Math.cos(a) * cell * 0.55, y + Math.sin(a) * cell * 0.55);
      ctx.lineTo(x + Math.cos(a) * cell * reach, y + Math.sin(a) * cell * reach);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  stamp(ctx, "sprayBody", paintSprayBody, x, y, cell);

  // Форсунки по кругу — по одной на струю.
  ctx.fillStyle = wet > 0 ? COLORS.water : COLORS.sprayMetal;
  ctx.beginPath();
  const nr = Math.max(0.7, cell * 0.09);
  for (let j = 0; j < SPRAY.jets; j++) {
    const a = angle + (j * TAU) / SPRAY.jets;
    const nx = x + Math.cos(a) * r * 0.82;
    const ny = y + Math.sin(a) * r * 0.82;
    ctx.moveTo(nx + nr, ny);
    ctx.arc(nx, ny, nr, 0, TAU);
  }
  ctx.fill();
  applyLight(ctx, "circle", x, y, r);
}

// ---------- ловушка ----------

const TRAP_HALF = 0.42;

/** Ловушка целиком: восьмиугольная платформа, плита, подкова магнита, сердечник и свет. */
const paintTrap: Paint = (ctx, m, cell) => {
  const half = cell * TRAP_HALF;
  dropShadow(ctx, "oct", m, m, half, cell);

  shapePath(ctx, "oct", m, m, half);
  ctx.fillStyle = COLORS.trap;
  ctx.fill();
  ctx.strokeStyle = COLORS.trapTop;
  ctx.lineWidth = cell * 0.1;
  ctx.stroke();
  shapePath(ctx, "oct", m, m, half * 0.62);
  ctx.fillStyle = COLORS.trapShade;
  ctx.fill();

  // Подкова магнита: два полюса и дуга между ними.
  const pr = cell * 0.13;
  const ox = cell * 0.2;
  ctx.strokeStyle = COLORS.trapTop;
  ctx.lineWidth = cell * 0.16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(m, m, cell * 0.22, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.lineCap = "butt";

  shapePath(ctx, "circle", m - ox, m + cell * 0.06, pr);
  ctx.fillStyle = COLORS.trapPoleN;
  ctx.fill();
  shapePath(ctx, "circle", m + ox, m + cell * 0.06, pr);
  ctx.fillStyle = COLORS.trapPoleS;
  ctx.fill();

  // Центральный сердечник.
  shapePath(ctx, "circle", m, m - cell * 0.06, cell * 0.1);
  ctx.fillStyle = COLORS.trapTop;
  ctx.fill();
  applyLight(ctx, "oct", m, m, half);
};

/**
 * Ловушка: восьмиугольная платформа с подковообразным магнитом.
 * Пока держит дронов — кольца, которые сжимаются к центру.
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
  if (!alive) return drawCharred(ctx, cx, cy, cell);
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;

  if (held > 0) {
    const maxR = range * cell;
    const rings = 4;
    ctx.strokeStyle = COLORS.trapTop;
    ctx.lineWidth = Math.max(1, cell * 0.12);
    for (let i = 0; i < rings; i++) {
      const phase = (((now * 0.0018 + i / rings) % 1) + 1) % 1;
      ctx.globalAlpha = 0.55 * (1 - phase);
      shapePath(ctx, "circle", x, y, Math.max(cell * 0.2, maxR * (1 - phase)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  stamp(ctx, "trap", paintTrap, x, y, cell);
}

// ---------- зенитка и ракетница ----------

const MOUNT_R = 0.46;

/**
 * Площадка, на которой крутится башня: общая у зенитки и ракетницы, с тенью
 * и четырьмя «болтами» по краю. Квадратная — у ракетницы, чтобы и формой её
 * не путать с зениткой.
 */
function paintMount(body: string, plate: string, accent: string, square: boolean): Paint {
  return (ctx, m, cell) => {
    const shape = square ? "square" : "circle";
    const r = cell * MOUNT_R;
    dropShadow(ctx, shape, m, m, r, cell);
    shapePath(ctx, shape, m, m, r);
    ctx.fillStyle = body;
    ctx.fill();
    shapePath(ctx, shape, m, m, r * 0.78);
    ctx.fillStyle = plate;
    ctx.fill();
    shapePath(ctx, shape, m, m, r);
    ctx.strokeStyle = accent;
    ctx.lineWidth = cell * 0.1;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.beginPath();
    const br = cell * 0.07;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const bx = m + Math.cos(a) * r * 0.72;
      const by = m + Math.sin(a) * r * 0.72;
      ctx.moveTo(bx + br, by);
      ctx.arc(bx, by, br, 0, TAU);
    }
    ctx.fill();
  };
}

const paintGunMount = paintMount(COLORS.gun, COLORS.gunPlate, COLORS.gunTop, false);
const paintRocketMount = paintMount(COLORS.rocket, COLORS.rocketPlate, COLORS.rocketTop, true);

/**
 * Башня зенитки стволами по +x: станина, казённик, спарка с дульными
 * тормозами, колпак наводчика с бликом прицела.
 */
const paintGunTop: Paint = (ctx, m, cell) => {
  const accent = COLORS.gunTop;
  const shade = COLORS.gunShade;
  ctx.save();
  ctx.translate(m, m);

  // Станина: клин, расширяющийся назад. На нём и держится вся спарка.
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(-cell * 0.34, -cell * 0.3);
  ctx.lineTo(cell * 0.06, -cell * 0.22);
  ctx.lineTo(cell * 0.06, cell * 0.22);
  ctx.lineTo(-cell * 0.34, cell * 0.3);
  ctx.closePath();
  ctx.fill();

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
    ctx.fillStyle = COLORS.gunBarrel;
    ctx.fillRect(cell * 0.2, oy - cell * 0.018, cell * 0.25, cell * 0.036);
  }

  // Колпак наводчика и блик прицела — центр, вокруг которого всё вертится.
  shapePath(ctx, "circle", -cell * 0.08, 0, cell * 0.17);
  ctx.fillStyle = accent;
  ctx.fill();
  shapePath(ctx, "circle", -cell * 0.06, -cell * 0.04, cell * 0.06);
  ctx.fillStyle = COLORS.glint;
  ctx.fill();
  ctx.restore();
};

/**
 * Башня ракетницы стволом по +x: рама, короб направляющих с рёбрами и
 * жёлоб; заряженная — ещё и ракета в жёлобе.
 */
function paintRocketTop(loaded: boolean): Paint {
  return (ctx, m, cell) => {
    const accent = COLORS.rocketTop;
    const shade = COLORS.rocketShade;
    ctx.save();
    ctx.translate(m, m);

    // Опорная рама и подъёмный механизм позади короба.
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(-cell * 0.36, -cell * 0.24);
    ctx.lineTo(-cell * 0.02, -cell * 0.3);
    ctx.lineTo(-cell * 0.02, cell * 0.3);
    ctx.lineTo(-cell * 0.36, cell * 0.24);
    ctx.closePath();
    ctx.fill();

    // Короб направляющих: широкий, приподнятый, с рёбрами по бокам. Короче
    // клетки: ракета выглядывает из короба лишь носом и на соседнюю
    // установку не залезает.
    ctx.fillStyle = COLORS.rocketPlate;
    ctx.fillRect(-cell * 0.08, -cell * 0.3, cell * 0.52, cell * 0.6);
    ctx.fillStyle = accent;
    ctx.fillRect(-cell * 0.08, -cell * 0.3, cell * 0.52, cell * 0.07);
    ctx.fillRect(-cell * 0.08, cell * 0.23, cell * 0.52, cell * 0.07);

    // Сама направляющая — тёмный жёлоб по оси.
    ctx.fillStyle = shade;
    ctx.fillRect(-cell * 0.02, -cell * 0.13, cell * 0.48, cell * 0.26);

    if (loaded) {
      // Ракета в жёлобе: светлый корпус и красная головка наружу.
      ctx.fillStyle = COLORS.rocketBody;
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
  };
}

const paintRocketLoaded = paintRocketTop(true);
const paintRocketEmpty = paintRocketTop(false);

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
  if (!alive) return drawCharred(ctx, cx, cy, cell);
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;
  stamp(ctx, "gunMount", paintGunMount, x, y, cell);
  stamp(ctx, "gunTop", paintGunTop, x, y, cell, angle);
  // свет после поворота: солнце стоит на месте, пока башня крутится
  applyLight(ctx, "circle", x, y, cell * MOUNT_R);
}

/**
 * Ракетница: квадратная площадка, а не круглая, как у зенитки, и вместо
 * спарки — короб направляющих с одной ракетой. Ракета в коробе видна,
 * только пока установка заряжена: пустой короб и значит «перезаряжается».
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
  if (!alive) return drawCharred(ctx, cx, cy, cell);
  const x = (cx + 0.5) * cell;
  const y = (cy + 0.5) * cell;
  stamp(ctx, "rocketMount", paintRocketMount, x, y, cell);
  if (loaded) stamp(ctx, "rocketLoaded", paintRocketLoaded, x, y, cell, angle);
  else stamp(ctx, "rocketEmpty", paintRocketEmpty, x, y, cell, angle);
  applyLight(ctx, "square", x, y, cell * MOUNT_R);
}
