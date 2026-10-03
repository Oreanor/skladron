// Замороженный движок версии 22. Не править — сгенерировано scripts/freeze-sim.cjs.
/* eslint-disable */
// @ts-nocheck
import {
  GRID,
  G_BASE,
  G_BURNT,
  G_FIRE,
  G_SCORCH,
  gunKind,
  type Gun,
} from "../base";
import {
  aimMode,
  gunRange,
  rocketRange,
  sprayRange,
  suppressRange,
  trapRange,
  type GameState,
} from "../engine";
import { BLOW, FX, GUN, ROCKET, SPRAY, SUPPRESS, TRAP } from "../tuning";
import { COLORS } from "./colors";
import {
  drawBalloons,
  drawDepots,
  drawRocket,
  drawSpray,
  drawTrap,
  drawTurret,
} from "./pieces";

// Палитра и сами предметы живут в render/: их правят отдельно от кадра боя.
export { COLORS, installColors } from "./colors";
export {
  drawBalloons,
  drawDepots,
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
    const kind = gunKind(g as Gun);
    // В бою и повторе пушек тут нет — их рисует живой кадр со своим углом.
    // В лобби ствол смотрит наружу от середины склада.
    switch (kind) {
      case "spray":
        drawSpray(ctx, g.cx, g.cy, cell, angle, 0, g.alive !== false);
        break;
      case "trap":
        drawTrap(ctx, g.cx, g.cy, cell, g.alive !== false);
        break;
      case "rocket":
        drawRocket(ctx, g.cx, g.cy, cell, angle, g.alive !== false);
        break;
      default:
        drawTurret(ctx, g.cx, g.cy, cell, angle, g.alive !== false);
        break;
    }
  }
}

/** Чьи круги покрытия показывать: зениток, ракетниц, огнетушителей, ловушек. */
export type CoverageKind = "gun" | "rocket" | "spray" | "trap";

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
  rocketsRange: number = ROCKET.range,
  /**
   * Чьи круги рисовать. Пусто — ничьи: три набора кругов разом закрывают
   * склад так, что на нём уже ничего не разглядеть, поэтому в лобби видны
   * только круги того, что сейчас ставят.
   */
  show: readonly CoverageKind[] = ["gun", "rocket", "spray", "trap"]
) {
  if (!show.length) return;
  const live = guns.filter((g) => (g as { alive?: boolean }).alive !== false);
  if (!live.length) return;
  const kindOf = (g: {
    kind?: string;
    spray?: boolean;
    trap?: boolean;
    rocket?: boolean;
  }): CoverageKind =>
    g.kind === "trap" || g.trap === true
      ? "trap"
      : g.kind === "spray" || g.spray === true
        ? "spray"
        : g.kind === "rocket" || g.rocket === true
          ? "rocket"
          : "gun";
  const styles = {
    gun: { r: range, fill: COLORS.range, stroke: COLORS.rangeLine },
    rocket: {
      r: rocketsRange,
      fill: COLORS.rocketRange,
      stroke: COLORS.rocketRangeLine,
    },
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

  // Слой пересобираем, только когда поменялся набор живых установок или их
  // дальность: в бою это гибель установки, в лобби — постройка и
  // перестановка. В остальные кадры — одна готовая картинка.
  const key =
    `${cell}|${show.join()}|${range}|${rocketsRange}|${spraysRange}|${trapsRange}|` +
    live.map((g) => `${g.cx},${g.cy},${kindOf(g)}`).join(";");
  let cached = coverageLayers.get(ctx.canvas);
  if (!cached || cached.key !== key) {
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

/** Слой зон рисуется вдвое крупнее карты: при приближении края не мылятся. */
const COVER_SCALE = 2;
/** Готовые зоны для каждого холста — у боя, лобби и разведки свои. */
const coverageLayers = new WeakMap<
  HTMLCanvasElement | OffscreenCanvas,
  { key: string; layer: HTMLCanvasElement }
>();


/** Динамика боя: прицел, огонь, дроны, ракеты, взрывы. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  cell: number,
  hover: { x: number; y: number } | null,
  now: number,
  /** Круги действия пушек, огнетушителей и ловушек. В бою их можно убрать. */
  zones = true
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
  if (zones) drawCoverage(ctx, s.guns, cell, gunRange(s), reach, trapsReach, rocketRange(s));
  // Ракета в воздухе — значит направляющая пуста: по ней видно, кто сейчас
  // перезаряжается, а кто готов пустить.
  const launched = new Set<number>();
  for (const r of s.rockets) launched.add(r.from);
  for (const g of s.guns) {
    switch (gunKind(g)) {
      case "spray": {
        // Льёт только с водой, без пены и пока идёт бой. Счётчик струй в
        // движке у пустой или заглушённой установки застывает, а когда бой
        // кончился — у всех: симуляция встала, пока последний очаг ещё
        // заливали. По нему одному струи висели бы и в паузе перед итогом,
        // и в конце повтора.
        const pouring = s.phase === "playing" && g.tank > 0 && g.jammed <= 0 ? g.wet : 0;
        drawSpray(ctx, g.cx, g.cy, cell, g.angle, pouring, g.alive, reach, g.tank / SPRAY.tank);
        break;
      }
      case "rocket":
        drawRocket(ctx, g.cx, g.cy, cell, g.angle, g.alive, !launched.has(g.id));
        break;
      case "trap": {
        let held = 0;
        if (g.alive) {
          for (const d of s.drones) if (d.heldBy === g.id) held++;
        }
        drawTrap(ctx, g.cx, g.cy, cell, g.alive, held, now, trapsReach);
        break;
      }
      default:
        drawTurret(ctx, g.cx, g.cy, cell, g.angle, g.alive);
        break;
    }
  }

  drawBalloons(ctx, s.balloons, cell);

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

  drawFireSmoke(ctx, s.fire.keys(), s.fire.size, cell, now);

  // чёрный дым за подбитыми
  for (const p of s.puffs) {
    const k = p.t / (p.life ?? FX.smokeLife);
    // выхлоп ракеты — белый след, дым подбитого — чёрный
    ctx.fillStyle = `rgba(${p.light ? COLORS.trail : COLORS.smoke}, ${0.5 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(p.x * cell, p.y * cell, p.r * cell * (0.6 + k * 1.6), 0, Math.PI * 2);
    ctx.fill();
  }

  // снаряды зениток — короткие трассеры
  ctx.strokeStyle = COLORS.missile;
  ctx.lineWidth = Math.max(1, cell * 0.25);
  ctx.beginPath();
  for (const m of s.missiles) {
    ctx.moveTo((m.x - m.dx * 0.9) * cell, (m.y - m.dy * 0.9) * cell);
    ctx.lineTo(m.x * cell, m.y * cell);
  }
  ctx.stroke();

  // Ракеты ракетниц. Их мало и живут они долго, так что рисуем как предмет:
  // корпус, красная головка и факел из сопла. Дымный след за ними сыплется
  // в общую кучу клубов и нарисован выше.
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
    ctx.fillStyle = "rgba(255, 168, 56, 0.85)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-len * 0.3, -cell * 0.06);
    ctx.lineTo(-len * (0.5 + f * 0.5), 0);
    ctx.lineTo(-len * 0.3, cell * 0.06);
    ctx.closePath();
    ctx.fillStyle = "#fff3c4";
    ctx.fill();

    ctx.fillStyle = "#dfe7ef";
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
  const jammers = s.drones.filter((d) => !d.hit && !d.heldBy && COLORS.suppress[d.payload]);
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
  const fans = s.drones.filter((d) => !d.hit && d.payload === "blower");
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
    const look = d.hit ? undefined : COLORS.suppress[d.payload];
    if (look && d.fuel > 0) {
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
  ctx.lineWidth = Math.max(1, cell * 0.18);

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
  for (const b of s.booms) drawBoom(ctx, b, cell);
}


/** Сколько секунд живёт клуб дыма над пожаром — от клетки до растворения. */
const SMOKE_LIFE = 3.2;

/**
 * Дым над горящими клетками: клубы поднимаются, расширяются, сносятся
 * ветром и тают. Каждый клуб — функция времени и номера клетки, в бою его
 * нет вовсе: бой у защитника и на сервере обязан совпадать, а отрисовка в
 * него не лезет. Над большим пожаром клубов на клетку меньше, иначе на
 * сотнях горящих клеток дым съел бы кадр.
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
  const t = now / 1000;
  ctx.save();
  ctx.fillStyle = "rgb(78, 74, 70)";
  for (const i of cells) {
    const x = i % GRID;
    const y = (i / GRID) | 0;
    // у каждой клетки свой сдвиг по фазе — иначе весь пожар дышал бы разом
    const shift = ((x * 92821 + y * 68917) % 1000) / 1000;
    for (let j = 0; j < per; j++) {
      const k = (t / SMOKE_LIFE + shift + j / per) % 1;
      const rise = k * 4; // клеток вверх за жизнь клуба
      const drift = k * 1.4 + Math.sin((t + shift * 7) * 1.7 + j) * 0.25; // ветер вправо
      ctx.globalAlpha = 0.55 * Math.sin(k * Math.PI); // проявляется и тает
      ctx.beginPath();
      ctx.arc(
        (x + 0.5 + drift) * cell,
        (y + 0.4 - rise) * cell,
        cell * (0.6 + 2 * k),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Взрыв по фазам: белая вспышка, огненный шар, который растёт и остывает от
 * жёлтого к тёмно-красному, ударная волна, разлёт искр и клуб дыма в конце.
 * Искры раскладываются от места взрыва, а не от случайных чисел боя: бой у
 * защитника и на сервере обязан совпадать, и отрисовка в него не лезет.
 */
function drawBoom(
  ctx: CanvasRenderingContext2D,
  b: { x: number; y: number; t: number; r: number },
  cell: number
) {
  const k = Math.min(1, b.t / FX.boomLife);
  const x = b.x * cell;
  const y = b.y * cell;
  const r = b.r * cell;
  const out = 1 - (1 - k) * (1 - k); // быстро в начале, медленно в конце

  ctx.save();

  // дым: всплывает, когда шар гаснет, и расплывается шире него
  if (k > 0.35) {
    const d = (k - 0.35) / 0.65;
    ctx.globalAlpha = 0.45 * (1 - d);
    ctx.fillStyle = "rgb(40, 36, 32)";
    ctx.beginPath();
    ctx.arc(x, y - r * 0.25 * d, r * (0.45 + 0.45 * d), 0, Math.PI * 2);
    ctx.fill();
  }

  // огненный шар остывает: жёлтый → оранжевый → тёмно-красный
  if (k < 0.7) {
    const f = k / 0.7;
    ctx.globalAlpha = 1 - f;
    ctx.fillStyle = `rgb(255, ${Math.round(210 - 150 * f)}, ${Math.round(80 - 60 * f)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.25 + 0.4 * out), 0, Math.PI * 2);
    ctx.fill();
    // горячее ядро поменьше
    ctx.globalAlpha = Math.max(0, 1 - f * 1.6);
    ctx.fillStyle = "rgb(255, 245, 200)";
    ctx.beginPath();
    ctx.arc(x, y, r * (0.14 + 0.18 * out), 0, Math.PI * 2);
    ctx.fill();
  }

  // вспышка — первые доли секунды, шире шара
  if (k < 0.15) {
    ctx.globalAlpha = 0.6 * (1 - k / 0.15);
    ctx.fillStyle = "rgb(255, 255, 235)";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // ударная волна: тонкое кольцо уходит дальше шара
  if (k < 0.5) {
    const w = k / 0.5;
    ctx.globalAlpha = 0.7 * (1 - w);
    ctx.strokeStyle = "rgb(255, 220, 150)";
    ctx.lineWidth = Math.max(1, cell * 0.2);
    ctx.beginPath();
    ctx.arc(x, y, r * (0.3 + 0.9 * w), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Искры: три-четыре, и летят дальше ударной волны — иначе они терялись
  // внутри шара. У крупного взрыва — взрывчатки — на пару больше. У каждой
  // своё направление и скорость, гаснут к концу.
  if (k < 0.85) {
    const seed = Math.abs(Math.sin(b.x * 12.9898 + b.y * 78.233)) * 43758.5453;
    const sparks = 3 + (Math.floor(seed) % 2) + (b.r >= 4 ? 2 : 0);
    const s = Math.max(1, cell * 0.3);
    ctx.globalAlpha = 1 - k / 0.85;
    ctx.fillStyle = "rgb(255, 200, 110)";
    for (let i = 0; i < sparks; i++) {
      const h = (seed * (i + 1)) % 1;
      const ang = ((i + h) / sparks) * Math.PI * 2;
      const dist = r * (1.3 + 1.0 * h) * out;
      ctx.fillRect(x + Math.cos(ang) * dist - s / 2, y + Math.sin(ang) * dist - s / 2, s, s);
    }
  }

  ctx.restore();
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
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(-tw / 2 - padX, boxY, tw + padX * 2, boxH);
  ctx.fillStyle = "#f5f5f5";
  ctx.fillText(label, 0, boxY + boxH / 2);
  ctx.restore();
}
