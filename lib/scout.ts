// Разведка. Это не бой: у игрока нет оружия, есть только самолёт, который
// летит вперёд и снимает карту вокруг себя. Мешают ему пушки противника —
// они бьют настоящими снарядами, и сбивает только прямое попадание.

import { CELLS, GRID, type Gun } from "./base";
import { GUN_RANGE } from "./engine";

/** Радиус съёмки в клетках: за проход открывается коридор в двадцать клеток. */
export const SCOUT_RADIUS = 10;
/** Клеток в секунду. Дрон летит 4,2 — самолёт почти вдвое быстрее. */
export const SCOUT_SPEED = 8;
/** Насколько быстро самолёт доворачивает, радиан в секунду. */
export const SCOUT_TURN = 2.2;
/** Сколько разведчиков можно послать за раз. */
export const MAX_SCOUTS = 10;

/** Снаряд быстрый, но не мгновенный: на упреждении и ошибке прицела мажет. */
export const SHELL_SPEED = 30;
/** Разброс прицела в радианах: чем дальше пушка, тем шире промах. */
export const SHELL_SPREAD = 0.13;
/** Перезарядка одной пушки по воздушной цели. */
export const GUN_RELOAD = 1.1;
/** Насколько близко снаряд должен пройти, чтобы это считалось попаданием. */
export const SHELL_HIT = 0.9;

export interface ScoutPlane {
  x: number; // клетки, дробные
  y: number;
  heading: number; // радианы, 0 — вправо
}

export interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface ScoutState {
  cells: Uint8Array; // настоящая карта врага
  guns: Gun[];
  /** Перезарядка по каждой пушке, индексы совпадают с guns. */
  cool: number[];
  /** 1 — клетка снята, 0 — под туманом. */
  seen: Uint8Array;
  /** Клетки, открытые с прошлого кадра: по ним отрисовщик стирает туман. */
  fresh: number[];
  shells: Shell[];
  left: number; // сколько разведчиков ещё в запасе
  plane: ScoutPlane | null;
  steer: -1 | 0 | 1;
  /** Полёт закончился: разведчики кончились и последний сошёл с карты. */
  done: boolean;
  lost: number; // сколько сбили
  time: number;
}

/** Самолёт заходит с случайной стороны и правит в центр карты. */
export function spawnPlane(rnd = Math.random): ScoutPlane {
  const edge = (rnd() * 4) | 0;
  const along = rnd() * GRID;
  const pos =
    edge === 0
      ? { x: along, y: -2 }
      : edge === 1
      ? { x: along, y: GRID + 2 }
      : edge === 2
      ? { x: -2, y: along }
      : { x: GRID + 2, y: along };
  const mid = GRID / 2;
  return { ...pos, heading: Math.atan2(mid - pos.y, mid - pos.x) };
}

export function createScout(cells: Uint8Array, guns: Gun[], planes: number): ScoutState {
  return {
    cells,
    guns,
    cool: guns.map(() => Math.random() * GUN_RELOAD),
    seen: new Uint8Array(CELLS),
    fresh: [],
    shells: [],
    left: planes,
    plane: null,
    steer: 0,
    done: false,
    lost: 0,
    time: 0,
  };
}

/** Открывает круг вокруг самолёта. */
function reveal(s: ScoutState, cx: number, cy: number) {
  const r = SCOUT_RADIUS;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(GRID - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(GRID - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const i = y * GRID + x;
      if (s.seen[i]) continue;
      s.seen[i] = 1;
      s.fresh.push(i);
    }
  }
}

/** Далеко ли самолёт от карты — за этой границей вылет считается законченным. */
const OUT = 6;

/** Расстояние от точки до отрезка: снаряд за кадр пролетает полклетки и мог бы проскочить. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const k = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + dx * k), py - (ay + dy * k));
}

/** Пушка бьёт с упреждением, но с ошибкой — потому часть снарядов уходит мимо. */
function fire(s: ScoutState, g: Gun, p: ScoutPlane) {
  const gx = g.cx + 0.5;
  const gy = g.cy + 0.5;
  const flight = Math.hypot(p.x - gx, p.y - gy) / SHELL_SPEED;
  const aimX = p.x + Math.cos(p.heading) * SCOUT_SPEED * flight;
  const aimY = p.y + Math.sin(p.heading) * SCOUT_SPEED * flight;
  const angle =
    Math.atan2(aimY - gy, aimX - gx) + (Math.random() - 0.5) * 2 * SHELL_SPREAD;
  s.shells.push({
    x: gx,
    y: gy,
    vx: Math.cos(angle) * SHELL_SPEED,
    vy: Math.sin(angle) * SHELL_SPEED,
    life: (GUN_RANGE * 2.5) / SHELL_SPEED,
  });
}

function downPlane(s: ScoutState) {
  s.lost++;
  s.plane = null;
  if (s.left <= 0) s.done = true;
}

export function updateScout(s: ScoutState, dt: number) {
  if (s.done) return;
  s.time += dt;

  const p = s.plane;

  // снаряды живут своей жизнью и после того, как самолёт ушёл
  for (let i = s.shells.length - 1; i >= 0; i--) {
    const sh = s.shells[i];
    const nx = sh.x + sh.vx * dt;
    const ny = sh.y + sh.vy * dt;
    if (p && distToSegment(p.x, p.y, sh.x, sh.y, nx, ny) <= SHELL_HIT) {
      s.shells.splice(i, 1);
      downPlane(s);
      return;
    }
    sh.x = nx;
    sh.y = ny;
    sh.life -= dt;
    if (sh.life <= 0) s.shells.splice(i, 1);
  }

  if (!p) {
    if (s.left <= 0) {
      s.done = true;
      return;
    }
    s.left--;
    s.plane = spawnPlane();
    return;
  }

  p.heading += s.steer * SCOUT_TURN * dt;
  p.x += Math.cos(p.heading) * SCOUT_SPEED * dt;
  p.y += Math.sin(p.heading) * SCOUT_SPEED * dt;

  // снимаем всё, над чем прошли
  if (p.x > -OUT && p.y > -OUT && p.x < GRID + OUT && p.y < GRID + OUT) {
    reveal(s, p.x, p.y);
  }

  // пушки открывают огонь, как только самолёт входит в их зону
  for (let i = 0; i < s.guns.length; i++) {
    s.cool[i] -= dt;
    const g = s.guns[i];
    const d = Math.hypot(g.cx + 0.5 - p.x, g.cy + 0.5 - p.y);
    if (d <= GUN_RANGE && s.cool[i] <= 0) {
      fire(s, g, p);
      s.cool[i] = GUN_RELOAD;
    }
  }

  // ушёл за край — вылет закончен, следующий заходит заново
  if (p.x < -OUT || p.y < -OUT || p.x > GRID + OUT || p.y > GRID + OUT) {
    s.plane = null;
    if (s.left <= 0) s.done = true;
  }
}

/** Самолёт в зоне хотя бы одной пушки — по этому зажигаем предупреждение. */
export function underFire(s: ScoutState, x: number, y: number) {
  for (const g of s.guns) {
    const dx = g.cx + 0.5 - x;
    const dy = g.cy + 0.5 - y;
    if (dx * dx + dy * dy <= GUN_RANGE * GUN_RANGE) return true;
  }
  return false;
}

/** Доля снятой карты — её показываем в сводке. */
export function seenShare(seen: Uint8Array) {
  let n = 0;
  for (let i = 0; i < seen.length; i++) if (seen[i]) n++;
  return n / seen.length;
}
