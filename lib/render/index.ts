import { GRID, G_BASE, G_BURNT, G_FIRE, G_SCORCH, gunKind, type Gun } from "../base";
import {
  aimMode,
  balloonRange,
  gunRange,
  rocketRange,
  sprayRange,
  suppressRange,
  trapRange,
  type GameState,
} from "../engine";
import { BALLOON, BLOW, FX, GUN, ROCKET, SPRAY, SUPPRESS, TRAP } from "../tuning";
import { charFill } from "./char";
import { COLORS } from "./colors";
import { drawBattleDepots } from "./depots";
import { drawBoom, drawSoft } from "./fx";
import { hash } from "./hash";
import { slabBevel, slabShadow } from "./light";
import { drawBalloons, drawDroneSwarm, drawPiece, drawNet } from "./pieces";

// Палитра и сами предметы живут в render/: их правят отдельно от кадра боя.
export { drawNet } from "./pieces";
export { COLORS, installColors } from "./colors";
export {
  drawBalloonPad,
  drawBalloons,
  drawDepots,
  drawDrone,
  drawDroneSwarm,
  drawPiece,
  drawRocket,
  drawScoutPlane,
  drawSpray,
  drawTrap,
  drawTurret,
} from "./pieces";

/** Всё, что нужно для отрисовки карты — и бою, и редактору. */
export interface Scene {
  cells: Uint8Array;
  guns: { cx: number; cy: number; alive?: boolean; kind?: string }[];
  depots?: { cx: number; cy: number; n: number }[];
}

/** Как карта сейчас показана: масштаб и сдвиг. */
export interface View {
  showNets?: boolean;
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

/** Видимый кусок карты в клетках — рисовать остальное незачем. */
export interface Clip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const FULL: Clip = { x0: 0, y0: 0, x1: GRID, y1: GRID };

/** С какого размера клетки на экране, в точках, показываем сетку — по ней целишься. */
const GRID_FROM = 14;

/** Статичный слой: земля, склад, пепелище, установки в лобби. */
export function drawStatic(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  cell: number,
  zoom = 1,
  clip: Clip = FULL
) {
  const area = {
    x0: Math.max(0, clip.x0),
    y0: Math.max(0, clip.y0),
    x1: Math.min(GRID, clip.x1),
    y1: Math.min(GRID, clip.y1),
  };
  const { x0, y0, x1, y1 } = area;

  ctx.fillStyle = COLORS.groundA;
  ctx.fillRect(x0 * cell, y0 * cell, (x1 - x0) * cell, (y1 - y0) * cell);

  // Каждый слой — одним путём и одной заливкой: по команде на клетку выходили
  // тысячи заливок, а угольный узор на каждой клетке стоил дороже всего кадра.
  const checker = new Path2D();
  for (let y = y0; y < y1; y++) {
    for (let x = x0 + ((x0 ^ y) & 1); x < x1; x += 2) checker.rect(x * cell, y * cell, cell, cell);
  }
  ctx.fillStyle = COLORS.groundB;
  ctx.fill(checker);

  slabShadow(ctx, s.cells, cell, area);

  // Клетки — слоями, по пути на тип: один проход по карте, по заливке на слой.
  const layers: [number, string | CanvasPattern][] = [
    [G_BASE, COLORS.base],
    // сгоревший пол и выжженная трава — уголь с едва заметной фактурой
    [G_BURNT, charFill(ctx, "floor")],
    [G_SCORCH, charFill(ctx, "grass")],
    [G_FIRE, COLORS.fireBase],
  ];
  const paths = layers.map(() => new Path2D());
  const slot: number[] = [];
  layers.forEach(([value], i) => (slot[value] = i));
  for (let y = y0; y < y1; y++) {
    const row = y * GRID;
    for (let x = x0; x < x1; x++) {
      const i = slot[s.cells[row + x]];
      if (i !== undefined) paths[i].rect(x * cell, y * cell, cell, cell);
    }
  }
  layers.forEach(([, color], i) => {
    ctx.fillStyle = color;
    ctx.fill(paths[i]);
  });

  slabBevel(ctx, s.cells, cell, area);

  if (cell * zoom >= GRID_FROM) {
    ctx.strokeStyle = COLORS.grid;
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

  // В бою и повторе пушек тут нет — их рисует живой кадр со своим углом.
  // В лобби ствол смотрит наружу от середины склада.
  for (const g of s.guns) {
    const angle = Math.atan2(g.cy + 0.5 - GRID / 2, g.cx + 0.5 - GRID / 2);
    drawPiece(ctx, gunKind(g as Gun), g.cx, g.cy, cell, angle, g.alive !== false);
  }
}
/** Чьи круги покрытия показывать: зениток, ракетниц, огнетушителей, ловушек. */
export type CoverageKind = "gun" | "rocket" | "spray" | "trap" | "balloon" | "net";

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
        balloon?: boolean;
      }[],
  cell: number,
  range: number = GUN.range,
  spraysRange: number = SPRAY.range,
  trapsRange: number = TRAP.range,
  rocketsRange: number = ROCKET.range,
  balloonsRange: number = BALLOON.range,
  /**
   * Чьи круги рисовать. Пусто — ничьи: три набора кругов разом закрывают
   * склад так, что на нём уже ничего не разглядеть, поэтому в лобби видны
   * только круги того, что сейчас ставят.
   */
  show: readonly CoverageKind[] = ["gun", "rocket", "spray", "trap", "balloon"]
) {
  if (!show.length) return;

  // Слой пересобираем, только когда поменялся набор живых установок или их
  // дальность: в бою это гибель установки, в лобби — постройка и
  // перестановка. В остальные кадры — одна готовая картинка. Отпечаток
  // набора считаем числом, без строк и копий массива: он нужен каждый кадр.
  let print = 0;
  let count = 0;
  for (const g of guns) {
    if ((g as { alive?: boolean }).alive === false) continue;
    count++;
    print = (Math.imul(print, 31) + (g.cx * GRID + g.cy) * KIND_CODES + KIND_CODE[kindOf(g)]) | 0;
  }
  if (!count) return;
  const key = `${cell}|${show.join()}|${range}|${rocketsRange}|${spraysRange}|${trapsRange}|${balloonsRange}|${count}|${print}`;
  let cached = coverageLayers.get(ctx.canvas);
  if (!cached || cached.key !== key) {
    const live = guns.filter((g) => (g as { alive?: boolean }).alive !== false);
    const styles: Record<CoverageKind, { r: number; fill: string; stroke: string }> = {
      gun: { r: range, fill: COLORS.range, stroke: COLORS.rangeLine },
      rocket: { r: rocketsRange, fill: COLORS.rocketRange, stroke: COLORS.rocketRangeLine },
      spray: { r: spraysRange, fill: COLORS.sprayRange, stroke: COLORS.sprayRangeLine },
      trap: { r: trapsRange, fill: COLORS.trapRange, stroke: COLORS.trapRangeLine },
      net: { r: 0, fill: "transparent", stroke: "transparent" },
      balloon: { r: balloonsRange, fill: COLORS.balloonRange, stroke: COLORS.balloonRangeLine },
    };
    const side = GRID * cell * COVER_SCALE;
    const layer = cached?.layer ?? document.createElement("canvas");
    layer.width = side;
    layer.height = side;
    const g = layer.getContext("2d");
    if (!g) return;
    g.setTransform(COVER_SCALE, 0, 0, COVER_SCALE, 0, 0);
    for (const kind of show) {
      const part = live.filter((item) => kindOf(item) === kind);
      if (!part.length) continue;
      const st = styles[kind];
      const r = (st.r + 0.5) * cell;
      const circles = (target: CanvasRenderingContext2D, radius: number) => {
        target.beginPath();
        for (const item of part) {
          const cx = (item.cx + 0.5) * cell;
          const cy = (item.cy + 0.5) * cell;
          target.moveTo(cx + radius, cy);
          target.arc(cx, cy, radius, 0, Math.PI * 2);
        }
      };
      // Заливка вида — полупрозрачная, одна на все его круги, и обводка у
      // каждого круга: по пересекающимся дугам видно, где зона перекрыта
      // дважды и трижды.
      circles(g, r);
      g.fillStyle = st.fill;
      g.fill();
      g.strokeStyle = st.stroke;
      g.lineWidth = 1;
      g.stroke();
    }
    cached = { key, layer };
    coverageLayers.set(ctx.canvas, cached);
  }
  ctx.drawImage(cached.layer, 0, 0, GRID * cell, GRID * cell);
}

/** Чей это круг покрытия: в бою вид — флагами, в лобби — полем kind. */
function kindOf(g: {
  kind?: string;
  spray?: boolean;
  trap?: boolean;
  rocket?: boolean;
  balloon?: boolean;
}): CoverageKind {
  if (g.kind === "net") return "net";
  if (g.kind === "balloon" || g.balloon) return "balloon";
  if (g.kind === "trap" || g.trap) return "trap";
  if (g.kind === "spray" || g.spray) return "spray";
  if (g.kind === "rocket" || g.rocket) return "rocket";
  return "gun";
}

/** Номер вида для отпечатка набора установок. */
const KIND_CODE: Record<CoverageKind, number> = { gun: 0, rocket: 1, spray: 2, trap: 3, balloon: 4, net: 5 };
const KIND_CODES = 6;

/** Слой зон рисуется вдвое крупнее карты: при приближении края не мылятся. */
const COVER_SCALE = 2;
/** Готовые зоны для каждого холста — у боя, лобби и разведки свои. */
const coverageLayers = new WeakMap<
  HTMLCanvasElement | OffscreenCanvas,
  { key: string; layer: HTMLCanvasElement }
>();


/**
 * Лопнувший шар: белая вспышка, расходящееся кольцо и шесть красных клочков
 * резины, разлетающихся и гаснущих. Разлёт — по номеру шара, без жребия:
 * картинка боя случайностью не пользуется.
 */
export function drawPops(ctx: CanvasRenderingContext2D, pops: { id: number; x: number; y: number; t: number }[], cell: number) {
  for (const p of pops) {
    const k = Math.min(1, p.t / FX.popLife);
    const x = p.x * cell;
    const y = p.y * cell;
    const fade = 1 - k;
    if (k < 0.3) {
      ctx.globalAlpha = (1 - k / 0.3) * 0.9;
      ctx.fillStyle = COLORS.popFlash;
      ctx.beginPath();
      ctx.arc(x, y, cell * (0.45 + k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = fade * 0.8;
    ctx.strokeStyle = COLORS.balloon;
    ctx.lineWidth = Math.max(0.6, cell * 0.12 * fade);
    ctx.beginPath();
    ctx.arc(x, y, cell * (0.5 + 0.7 * k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = fade;
    ctx.fillStyle = COLORS.balloon;
    for (let j = 0; j < 6; j++) {
      const a = p.id * 1.7 + (j * Math.PI) / 3;
      const d = cell * (0.4 + 1.4 * k);
      const sx = x + Math.cos(a) * d;
      const sy = y + Math.sin(a) * d;
      const sz = cell * 0.22 * (1 - 0.5 * k);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a + k * 6);
      ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** Динамика боя: прицел, огонь, дроны, ракеты, взрывы. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  cell: number,
  hover: { x: number; y: number } | null,
  now: number,
  /** Круги действия установок и дронов-подавителей, зона обдува. В бою их можно убрать. */
  zones = true,
  showNets = true
) {
  drawBattleDepots(ctx, s, cell);

  // следы пуль в земле
  // Одним путём: следов бывает до FX.maxHoles, по заливке на каждый — дорого.
  ctx.fillStyle = COLORS.hole;
  ctx.beginPath();
  for (const h of s.holes) {
    const r = cell * (0.16 + h.seed * 0.14);
    ctx.moveTo(h.x * cell + r, h.y * cell);
    ctx.arc(h.x * cell, h.y * cell, r, 0, Math.PI * 2);
  }
  ctx.fill();

  const reach = sprayRange(s);
  const trapsReach = trapRange(s);
  if (zones) {
    drawCoverage(ctx, s.guns, cell, gunRange(s), reach, trapsReach, rocketRange(s), balloonRange(s));
  }
  // Ракета в воздухе — значит направляющая пуста: по ней видно, кто сейчас
  // перезаряжается, а кто готов пустить.
  const launched = new Set<number>();
  for (const r of s.rockets) launched.add(r.from);
  // Сколько дронов держит каждая ловушка — одним проходом по стае, а не
  // стаей на каждую ловушку.
  const held = new Map<number, number>();
  for (const d of s.drones) if (d.heldBy) held.set(d.heldBy, (held.get(d.heldBy) ?? 0) + 1);
  for (const g of s.guns) {
    const kind = gunKind(g);
    // выпустила шары — на её месте ничего не осталось
    if (kind === "balloon" && g.spent) continue;
    drawPiece(ctx, kind, g.cx, g.cy, cell, g.angle, g.alive, {
      // Льёт только с водой, без пены и пока идёт бой. Счётчик струй в
      // движке у пустой или заглушённой установки застывает, а когда бой
      // кончился — у всех: симуляция встала, пока последний очаг ещё
      // заливали. По нему одному струи висели бы и в паузе перед итогом,
      // и в конце повтора.
      wet: s.phase === "playing" && g.jammed <= 0 ? g.wet : 0,
      range: kind === "trap" ? trapsReach : reach,
      loaded: !launched.has(g.id),
      held: held.get(g.id) ?? 0,
      now,
    });
  }

  if (showNets) for (const i of s.nets) drawNet(ctx, i % GRID, Math.floor(i / GRID), cell);
  drawBalloons(ctx, s.balloons, cell);
  drawPops(ctx, s.pops, cell);

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

  // Огонь мерцает от тёмно-оранжевого к жёлтому, у каждой клетки своя фаза.
  // Яркость — ступенями, и клетки одной ступени заливаются одним путём: по
  // две заливки на клетку при тысяче горящих стоили кадру столько же, сколько
  // вся стая. Сердцевина лежит внутри своей клетки и чужих не перекрывает,
  // так что порядок заливок картинку не меняет.
  if (s.fire.size) {
    const flames: Path2D[] = [];
    const cores: Path2D[] = [];
    for (const i of s.fire.keys()) {
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const f = 0.5 + 0.5 * Math.sin(now * 0.012 + (x * 7 + y * 13));
      const level = Math.round(f * (FIRE_STEPS - 1));
      (flames[level] ??= new Path2D()).rect(x * cell, y * cell, cell, cell);
      (cores[level] ??= new Path2D()).rect(x * cell + cell * 0.3, y * cell + cell * 0.3, cell * 0.4, cell * 0.4);
    }
    for (let level = 0; level < FIRE_STEPS; level++) {
      const flame = flames[level];
      if (!flame) continue;
      const f = level / (FIRE_STEPS - 1);
      ctx.fillStyle = FIRE_SHADES[level];
      ctx.fill(flame);
      ctx.globalAlpha = 0.25 + f * 0.45;
      ctx.fillStyle = COLORS.fireCore;
      ctx.fill(cores[level]);
      ctx.globalAlpha = 1;
    }
  }

  drawFireSmoke(ctx, s.fire.keys(), s.fire.size, cell, now);

  // Дым за подбитыми и выхлоп ракет — мягкими клубами, как у взрыва. След
  // ракеты из таких клубов сливается в сплошной шлейф, который пухнет и тает.
  for (const p of s.puffs) {
    const k = p.t / (p.life ?? FX.smokeLife);
    const fade = (1 - k) * Math.min(1, k * 8 + 0.4);
    if (p.light) {
      drawSoft(ctx, "trail", p.x * cell, p.y * cell, p.r * cell * (0.9 + k * 2.2), 0.6 * fade);
    } else {
      drawSoft(ctx, "smoke", p.x * cell, p.y * cell, p.r * cell * (0.9 + k * 2.2), 0.75 * fade);
    }
  }
  ctx.globalAlpha = 1;

  // Снаряды зениток — короткие трассеры, парой, по одному из каждого
  // ствола спарки. Пара только на картинке: в бою это один снаряд, и бьёт
  // он как один.
  ctx.strokeStyle = COLORS.missile;
  ctx.lineWidth = Math.max(0.6, cell * 0.14);
  ctx.beginPath();
  for (const m of s.missiles) {
    for (const side of [-1, 1]) {
      const ox = -m.dy * side * 0.14;
      const oy = m.dx * side * 0.14;
      ctx.moveTo((m.x + ox - m.dx * 0.9) * cell, (m.y + oy - m.dy * 0.9) * cell);
      ctx.lineTo((m.x + ox) * cell, (m.y + oy) * cell);
    }
  }
  ctx.stroke();

  // Ракеты ракетниц. Их мало и живут они долго, так что рисуем как предмет:
  // корпус, красная головка и факел из сопла. Дымный след за ними сыплется
  // в общую кучу клубов и нарисован выше.
  // Снаряд стрелка — шарик цвета ганметал с тёмной обводкой и бликом.
  // Раньше это была ракета в полклетки, и её за секунду полёта никто не
  // замечал. Шарик чуть пульсирует, чтобы читался на любом фоне.
  for (const r of s.foeRockets) {
    const pulse = 1 + 0.12 * Math.sin(now / 60 + r.id);
    // Десятая клетки: шарик в треть клетки выглядел пушечным ядром.
    // Не меньше двух точек, чтобы на общем виде не пропал совсем.
    const rad = Math.max(cell * 0.1, 2) * pulse;
    const x = r.x * cell;
    const y = r.y * cell;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.foeShell;
    ctx.fill();
    ctx.lineWidth = Math.max(0.75, cell * 0.02);
    ctx.strokeStyle = COLORS.foeBody;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.fill();
  }

  for (const m of s.rockets) {
    const len = cell * 0.55;
    // Факел пульсирует — по мигающему хвосту ракета видна и на пёстром фоне.
    const f = 0.6 + 0.4 * Math.sin(now / 40 + m.id);
    ctx.save();
    ctx.translate(m.x * cell, m.y * cell);
    ctx.rotate(Math.atan2(m.dy, m.dx));

    ctx.beginPath();
    ctx.moveTo(-len * 0.35, -cell * 0.12);
    ctx.lineTo(-len * (0.9 + f * 0.8), 0);
    ctx.lineTo(-len * 0.35, cell * 0.12);
    ctx.closePath();
    ctx.fillStyle = COLORS.flame;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-len * 0.3, -cell * 0.06);
    ctx.lineTo(-len * (0.5 + f * 0.5), 0);
    ctx.lineTo(-len * 0.3, cell * 0.06);
    ctx.closePath();
    ctx.fillStyle = COLORS.flameCore;
    ctx.fill();

    ctx.fillStyle = COLORS.rocketBody;
    ctx.fillRect(-len * 0.35, -cell * 0.09, len, cell * 0.18);
    ctx.beginPath();
    ctx.moveTo(len * 0.65, -cell * 0.09);
    ctx.lineTo(len * 0.95, 0);
    ctx.lineTo(len * 0.65, cell * 0.09);
    ctx.closePath();
    ctx.fillStyle = COLORS.droneAccent;
    ctx.fill();

    ctx.restore();
  }

  // Круг подавления. Рисуем у всех подавителей, а не только у севших на
  // круг: глушат они с первой секунды полёта, и по кругу видно, до каких
  // установок рой уже дотянулся. Обводка пульсирует — иначе на пёстрой
  // карте кольцо теряется среди прочих кругов.
  // Круги дронов — тоже зоны действия: выключены зоны — не видно и их.
  const jammers = zones ? s.drones.filter((d) => !d.hit && !d.heldBy && COLORS.suppress[d.payload]) : [];
  if (jammers.length) {
    const pulse = 0.75 + 0.25 * Math.sin(now / 160);
    for (const d of jammers) {
      const look = COLORS.suppress[d.payload];
      // Радиус у размагничивания свой, вдвое короче: круг рисуем по дрону,
      // а не один на всех.
      const reach = suppressRange(s, d.payload) * cell;
      const x = d.x * cell;
      const y = d.y * cell;

      ctx.beginPath();
      ctx.arc(x, y, reach, 0, Math.PI * 2);
      ctx.fillStyle = look.fill;
      ctx.fill();

      // сплошной обод плюс бегущий пунктир поверх: круг читается и на
      // выгоревшем чёрном, и на белом складе
      ctx.strokeStyle = look.line;
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

  // Зона обдува. Рисуем бледно и только ободом: она большая, их бывает
  // много, и заливать ею пол-экрана незачем — важно, где у неё край.
  const fans = zones ? s.drones.filter((d) => !d.hit && d.payload === "blower") : [];
  if (fans.length) {
    const reach = BLOW.range * cell;
    ctx.beginPath();
    for (const d of fans) {
      ctx.moveTo(d.x * cell + reach, d.y * cell);
      ctx.arc(d.x * cell, d.y * cell, reach, 0, Math.PI * 2);
    }
    ctx.fillStyle = COLORS.blowFill;
    ctx.fill();
    ctx.save();
    ctx.setLineDash([cell * 0.9, cell * 1.4]);
    ctx.lineDashOffset = -(now / 40) % (cell * 2.3);
    ctx.strokeStyle = COLORS.blow;
    ctx.lineWidth = Math.max(1, cell * 0.16);
    ctx.stroke();
    ctx.restore();
  }

  // Дроны: рама ±0.54 и винты 0.4 от неё — в размахе полторы клетки, как
  // раз зона попадания снаряда (0.8–0.9). Прежние 0.85 давали почти три.
  const r = cell * 0.54;
  ctx.lineWidth = Math.max(1, cell * 0.13);
  drawDroneSwarm(ctx, s.drones, cell, r, (d) => COLORS.payload[d.payload] ?? COLORS.droneAccent);

  for (const d of s.drones) {
    // Топливо подавителя — дугой вокруг боеголовки, как бак огнетушителя.
    // Горит только на круге над жертвой; пока летит — полный запас (~30 с).
    const look = d.hit ? undefined : COLORS.suppress[d.payload];
    if (look && d.fuel > 0) {
      const px = d.x * cell;
      const py = d.y * cell;
      const frac = Math.max(0, Math.min(1, d.fuel / SUPPRESS.loiter));
      const ring = r * 0.7;
      ctx.beginPath();
      ctx.arc(px, py, ring, 0, Math.PI * 2);
      ctx.strokeStyle = look.faint;
      ctx.lineWidth = Math.max(1.5, cell * 0.16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.strokeStyle = look.line;
      ctx.stroke();
    }
  }

  // И сами заглушённые установки: живые, но молчат. Крестик поверх виден
  // даже там, где круг перекрыт соседним.
  for (const g of s.guns) {
    if (!g.alive || g.jammed <= 0) continue;
    const x = (g.cx + 0.5) * cell;
    const y = (g.cy + 0.5) * cell;
    const rr = cell * 0.55;
    // Крестик красим по тому, кто эту установку и глушит.
    ctx.strokeStyle = (g.trap
      ? COLORS.suppress.demag
      : g.spray
        ? COLORS.suppress.foamer
        : COLORS.suppress.jammer
    ).crossed;
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
      ctx.globalAlpha = 0.9 * k;
      ctx.strokeStyle = COLORS.water;
      ctx.lineWidth = Math.max(1, cell * 0.3);
      ctx.beginPath();
      for (let n = 0; n < 5; n++) {
        const a = -Math.PI / 2 + (n - 2) * 0.45 + (sh.seed - 0.5) * 0.3;
        const len = cell * (1.1 + sh.seed * 0.8);
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.8 * k;
      ctx.fillStyle = COLORS.waterSpray;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const rr = cell * (1 + sh.seed * 0.7);
      ctx.globalAlpha = k;
      ctx.strokeStyle = COLORS.flash;
      ctx.lineWidth = Math.max(1, cell * 0.25);
      ctx.beginPath();
      for (let n = 0; n < 4; n++) {
        const a = (n / 4) * Math.PI + sh.seed * 2;
        ctx.moveTo(px - Math.cos(a) * rr, py - Math.sin(a) * rr);
        ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
      }
      ctx.stroke();
      ctx.fillStyle = COLORS.flashCore;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // взрывы
  for (const b of s.booms) drawBoom(ctx, b, cell);
}


/** Ступеней яркости у мерцания огня: на глаз переход между ними не виден. */
const FIRE_STEPS = 16;
const FIRE_SHADES = Array.from({ length: FIRE_STEPS }, (_, level) => {
  const f = level / (FIRE_STEPS - 1);
  return `rgb(${230 + f * 25}, ${70 + f * 90}, 20)`;
});

/** Сколько секунд живёт клуб дыма над пожаром — от клетки до растворения. */
const SMOKE_LIFE = 3.2;

/**
 * Дым над горящими клетками: клубы поднимаются, расширяются, сносятся
 * ветром и тают. Каждый клуб — функция времени и номера клетки, в бою его
 * нет вовсе: бой у защитника и на сервере обязан совпадать, а отрисовка в
 * него не лезет. Над большим пожаром клубов на клетку меньше, иначе на
 * сотнях горящих клеток дым съел бы кадр, а над огромным клуб идёт не от
 * каждой клетки: они всё равно сливаются в сплошную пелену.
 */
function drawFireSmoke(
  ctx: CanvasRenderingContext2D,
  cells: Iterable<number>,
  count: number,
  cell: number,
  now: number
) {
  if (!count) return;
  const per = count > 300 ? 1 : count > 150 ? 2 : 3;
  // Клубов не больше SMOKE_MAX: клуб — отдельный drawImage, и тысяча их
  // съедала полкадра на слабой машине. Дымят клетки по своему жребию, так
  // что набор не прыгает от кадра к кадру; редкие клубы чуть крупнее.
  const thin = Math.max(1, Math.ceil(count / SMOKE_MAX));
  const grow = Math.min(1.5, 1 + (thin - 1) * 0.25);
  const t = now / 1000;
  // Над большим пожаром клубы — сотни крупных полупрозрачных картинок, и
  // смешивать их в полном разрешении дороже всего кадра. Дым мягкий, без
  // краёв, поэтому рисуем его в слой вдвое мельче и растягиваем: пикселей
  // вчетверо меньше, а на глаз то же.
  const target = (count * per) / thin >= SMOKE_LAYER_FROM ? smokeLayer(ctx) : null;
  const g = target ?? ctx;
  g.save();
  for (const i of cells) {
    const x = i % GRID;
    const y = (i / GRID) | 0;
    if (thin > 1 && hash(x, y, 5) * thin >= 1) continue;
    // у каждой клетки свой сдвиг по фазе — иначе весь пожар дышал бы разом
    const shift = ((x * 92821 + y * 68917) % 1000) / 1000;
    for (let j = 0; j < per; j++) {
      const k = (t / SMOKE_LIFE + shift + j / per) % 1;
      const rise = k * 4; // клеток вверх за жизнь клуба
      const drift = k * 1.4 + Math.sin((t + shift * 7) * 1.7 + j) * 0.25; // ветер вправо
      // Мягкий клуб, как у взрыва: проявляется и тает. Края у него
      // прозрачные, поэтому радиус больше прежнего плоского круга.
      drawSoft(
        g,
        "smoke",
        (x + 0.5 + drift) * cell,
        (y + 0.4 - rise) * cell,
        cell * (0.85 + 2.6 * k) * grow,
        0.7 * Math.sin(k * Math.PI)
      );
    }
  }
  g.restore();
  if (target) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(target.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}

/** Больше стольких клубов над пожаром не рисуем. */
const SMOKE_MAX = 400;
/** Во сколько раз слой дыма мельче холста. */
const SMOKE_SHRINK = 2;
/** С какого числа клубов дым идёт через слой: мелкому пожару слой дороже самих клубов. */
const SMOKE_LAYER_FROM = 120;
/** Слой дыма у каждого холста свой — у боя и повтора разные. */
const smokeLayers = new WeakMap<HTMLCanvasElement | OffscreenCanvas, CanvasRenderingContext2D | null>();

/**
 * Пустой слой дыма под этот холст, уже с его преобразованием, только
 * уменьшенным: рисовать в него можно теми же игровыми координатами.
 */
function smokeLayer(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  let g = smokeLayers.get(ctx.canvas);
  if (g === undefined) {
    g = document.createElement("canvas").getContext("2d");
    smokeLayers.set(ctx.canvas, g);
  }
  if (!g) return null;
  const w = Math.ceil(ctx.canvas.width / SMOKE_SHRINK);
  const h = Math.ceil(ctx.canvas.height / SMOKE_SHRINK);
  if (g.canvas.width !== w) g.canvas.width = w;
  if (g.canvas.height !== h) g.canvas.height = h;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  // тот же вид, что у холста, только в SMOKE_SHRINK раз мельче
  const m = ctx.getTransform();
  const k = w / ctx.canvas.width;
  g.setTransform(m.a * k, m.b * k, m.c * k, m.d * k, m.e * k, m.f * k);
  return g;
}


/**
 * Подпись-плашка над клеткой. Размер держим экранный, а не игровой, иначе
 * на отдалении она станет нечитаемой; но на 0.5× обратный масштаб раздул бы
 * её вдвое, поэтому он с потолком.
 */
export function drawHoverLabel(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cx: number,
  cy: number,
  label: string,
  zoom: number
) {
  const inv = Math.min(1 / (zoom || 1), 1.35);
  ctx.save();
  ctx.translate((cx + 0.5) * cell, cy * cell - cell * 0.35);
  ctx.scale(inv, inv);
  ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(label).width;
  const padX = 6;
  const padY = 3;
  const boxH = 12 + padY * 2;
  const boxY = -boxH;
  ctx.fillStyle = COLORS.labelBg;
  ctx.fillRect(-tw / 2 - padX, boxY, tw + padX * 2, boxH);
  ctx.fillStyle = COLORS.labelText;
  ctx.fillText(label, 0, boxY + boxH / 2);
  ctx.restore();
}
