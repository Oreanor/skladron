// Бой: чистая логика, без React и без canvas.
// Карта и пушки приходят из склада игрока, дроны — из расписания атаки.

import { levelBonus } from "./economy";
import {
  GRID,
  G_BASE,
  G_FIRE,
  G_GROUND,
  G_SCORCH,
  type Depot,
  type Gun as BaseGun,
  idx,
  isBuilding,
} from "./base";
import type { SpawnTicket } from "./attack";

export { GRID, G_BASE, G_FIRE, G_GROUND, G_SCORCH, idx, isBuilding };
export { G_BURNT } from "./base";

export const GUN_RANGE = 5; // радиус поражения пушки первого уровня, в клетках
/** Прибавка к дальности и скорости ракеты за каждый уровень пушек. */
export const GUN_PER_LEVEL = 0.25;
/** Прибавка к скорости дрона за каждый уровень. */
export const DRONE_PER_LEVEL = 0.25;
/** Прибавка к меткости очереди за уровень пулемёта. */
export const MG_PER_LEVEL = 0.25;
/** Прибавка к ширине струи за уровень брандспойта. */
export const WATER_PER_LEVEL = 0.25;
export const GUN_COOLDOWN = 3; // с
export const FIRE_SPREAD = 5; // с — горящая клетка поджигает соседей
export const DRONE_SPEED = 4.2; // клеток/с
export const MISSILE_SPEED = 17;
export const MISSILE_LIFE = 4;
export const GUN_HIT_CHANCE = 0.15; // шанс случайно врезаться в пушку

// прицел игрока
export const MG_INTERVAL = 0.09; // с между выстрелами
export const MG_RADIUS = 1.8; // клеток — зона захвата дрона прицелом
export const MG_SPREAD = 1.2; // клеток — разброс пуль
export const MG_HIT = 0.35; // шанс попадания одним выстрелом; одного попадания достаточно
// Струя накрывает пятно, а не одну клетку под курсором: вести мышь точно по
// бегущему огню невозможно, а промахов у воды нет — она просто лила мимо.
// Радиус совпадает с кругом водяного прицела, который игрок и так видит.
export const WATER_RADIUS = 1.5; // клеток
export const MAX_HOLES = 2500;
export const HIT_GLIDE = 3; // клеток планирования подбитого дрона
export const FALL_SPEED = 3.4;
export const SMOKE_LIFE = 1.2;
export const SHOT_LIFE = 0.12;

export type Phase = "playing" | "won" | "lost";

export interface Gun {
  id: number;
  cx: number;
  cy: number;
  cd: number;
  alive: boolean;
}

export interface Drone {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  ti: number;
  wob: number;
  hit: boolean;
  hx: number;
  hy: number;
  fuse: number;
  smokeT: number;
}

export interface Missile {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  target: number;
  life: number;
}

export interface Boom {
  x: number;
  y: number;
  t: number;
  r: number;
}

export interface Shot {
  x: number;
  y: number;
  t: number;
  water: boolean;
  seed: number;
}

export interface Puff {
  x: number;
  y: number;
  t: number;
  r: number;
}

export interface Hole {
  x: number;
  y: number;
  seed: number;
}

export interface BattleResult {
  dronesSent: number;
  killedByGuns: number;
  killedByMg: number;
  leaked: number; // долетели до склада
  burned: number; // клеток потеряно за бой
  extinguished: number; // потушено водой
  gunsLost: number;
  dronesLost: number; // сгорело в контейнерах на складе
  depotsLost: number; // сколько контейнеров сгорело вместе с клетками
}

export interface GameState {
  phase: Phase;
  cells: Uint8Array;
  baseCells: number[];
  fire: Map<number, number>;
  guns: Gun[];
  depots: Depot[];
  drones: Drone[];
  missiles: Missile[];
  booms: Boom[];
  shots: Shot[];
  puffs: Puff[];
  holes: Hole[];
  aim: { x: number; y: number } | null;
  firing: boolean;
  mgCd: number;
  plan: SpawnTicket[];
  planAt: number; // индекс следующего вылета
  time: number;
  baseTotal: number;
  baseOk: number;
  result: BattleResult;
  nextId: number;
  /** Целые клетки склада — цели дронов. Список пересобираем, только когда он протух. */
  targets: number[];
  targetsStale: boolean;
  /** Уровень дронов нападающего и уровни защитника. */
  droneLevel: number;
  gunLevel: number;
  mgLevel: number;
  waterLevel: number;
  dirty: boolean;
}

/** Готовит бой: карта склада как есть, пушки как есть, дроны по расписанию. */
/** Дальность пушек с учётом уровня — её же рисует зона покрытия. */
export const gunRange = (s: { gunLevel: number }) =>
  GUN_RANGE * levelBonus(s.gunLevel, GUN_PER_LEVEL);

/** Уровни, с которыми идёт бой. Чего нет — то первого уровня. */
export interface BattleLevels {
  drones?: number;
  guns?: number;
  mg?: number;
  water?: number;
}

export function createBattle(
  cells: Uint8Array,
  guns: BaseGun[],
  depots: Depot[],
  plan: SpawnTicket[],
  levels: BattleLevels = {}
): GameState {
  const map = cells.slice();
  const baseCells: number[] = [];
  for (let i = 0; i < map.length; i++) {
    if (isBuilding(map[i])) baseCells.push(i);
  }
  let nextId = 1;
  const ok = baseCells.filter((i) => map[i] === G_BASE).length;

  return {
    phase: "playing",
    cells: map,
    baseCells,
    fire: new Map(),
    guns: guns.map((g) => ({ id: nextId++, cx: g.cx, cy: g.cy, cd: 0, alive: true })),
    depots: depots.map((d) => ({ ...d })),
    drones: [],
    missiles: [],
    booms: [],
    shots: [],
    puffs: [],
    holes: [],
    aim: null,
    firing: false,
    mgCd: 0,
    plan,
    droneLevel: levels.drones ?? 1,
    gunLevel: levels.guns ?? 1,
    mgLevel: levels.mg ?? 1,
    waterLevel: levels.water ?? 1,
    planAt: 0,
    time: 0,
    baseTotal: baseCells.length,
    baseOk: ok,
    targets: baseCells.filter((i) => map[i] === G_BASE),
    targetsStale: false,
    result: {
      dronesSent: plan.length,
      killedByGuns: 0,
      killedByMg: 0,
      leaked: 0,
      burned: 0,
      extinguished: 0,
      gunsLost: 0,
      dronesLost: 0,
      depotsLost: 0,
    },
    nextId,
    dirty: true,
  };
}

export function gunAt(s: GameState, x: number, y: number) {
  return s.guns.find((g) => g.alive && g.cx === x && g.cy === y);
}

export function setAim(s: GameState, aim: { x: number; y: number } | null) {
  s.aim = aim;
}

export function setFiring(s: GameState, firing: boolean) {
  if (firing && !s.firing) s.mgCd = 0; // первый выстрел сразу по нажатию
  s.firing = firing;
}

/** Тушит клетку: остаётся чёрное, но огонь дальше не идёт. */
export function extinguish(s: GameState, x: number, y: number) {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
  const i = idx(x, y);
  if (s.cells[i] !== G_FIRE) return false;
  s.cells[i] = 3; // G_BURNT
  s.fire.delete(i);
  s.targetsStale = true;
  s.result.extinguished++;
  s.dirty = true;
  return true;
}

function ignite(s: GameState, i: number) {
  if (s.cells[i] !== G_BASE) return;
  s.cells[i] = G_FIRE;
  s.targetsStale = true;
  s.fire.set(i, FIRE_SPREAD);
  s.baseOk--;
  s.result.burned++;
  s.dirty = true;

  // контейнер с дронами на этой клетке сгорает вместе с ней
  const x = i % GRID;
  const y = (i / GRID) | 0;
  const k = s.depots.findIndex((d) => d.cx === x && d.cy === y);
  if (k >= 0) {
    s.result.dronesLost += s.depots[k].n;
    s.result.depotsLost++;
    s.depots.splice(k, 1);
  }

  // и пушка тоже: ставить их на склад — это риск, а не бесплатное решение
  const g = gunAt(s, x, y);
  if (g) {
    g.alive = false;
    s.result.gunsLost++;
  }
}

function aimTick(s: GameState) {
  const a = s.aim;
  if (!a) return;
  const cx = Math.floor(a.x);
  const cy = Math.floor(a.y);
  if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return;
  const water = isBuilding(s.cells[idx(cx, cy)]);

  if (water) {
    s.shots.push({ x: a.x, y: a.y, t: 0, water: true, seed: Math.random() });
    if (s.shots.length > 60) s.shots.shift();
    const reach = WATER_RADIUS * levelBonus(s.waterLevel, WATER_PER_LEVEL);
    const r = Math.ceil(reach);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const ddx = x + 0.5 - a.x;
        const ddy = y + 0.5 - a.y;
        if (ddx * ddx + ddy * ddy <= reach * reach) extinguish(s, x, y);
      }
    }
    return;
  }

  const px = a.x + (Math.random() - 0.5) * MG_SPREAD * 2;
  const py = a.y + (Math.random() - 0.5) * MG_SPREAD * 2;
  s.shots.push({ x: px, y: py, t: 0, water: false, seed: Math.random() });
  if (s.shots.length > 60) s.shots.shift();

  const hx = Math.floor(px);
  const hy = Math.floor(py);
  if (hx >= 0 && hy >= 0 && hx < GRID && hy < GRID && !isBuilding(s.cells[idx(hx, hy)])) {
    s.holes.push({ x: px, y: py, seed: Math.random() });
    if (s.holes.length > MAX_HOLES) s.holes.shift();
  }

  let best: Drone | null = null;
  let bestD = MG_RADIUS * MG_RADIUS;
  for (const d of s.drones) {
    if (d.hit) continue;
    const ddx = d.x - a.x;
    const ddy = d.y - a.y;
    const dd = ddx * ddx + ddy * ddy;
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  if (!best) return;
  // Меткость очереди растёт с уровнем пулемёта, но не до безусловной.
  if (Math.random() > Math.min(0.95, MG_HIT * levelBonus(s.mgLevel, MG_PER_LEVEL))) return;

  const len = Math.hypot(best.tx - best.x, best.ty - best.y) || 1;
  best.hit = true;
  best.hx = (best.tx - best.x) / len;
  best.hy = (best.ty - best.y) / len;
  best.fuse = HIT_GLIDE;
  best.smokeT = 0;
  s.result.killedByMg++;
}

/** Подбитый дрон упал: склад — пожар, земля — выжженное пятно. */
function crash(s: GameState, d: Drone) {
  const cx = Math.max(0, Math.min(GRID - 1, Math.floor(d.x)));
  const cy = Math.max(0, Math.min(GRID - 1, Math.floor(d.y)));
  const i = idx(cx, cy);
  if (s.cells[i] === G_BASE) ignite(s, i);
  else if (s.cells[i] === G_GROUND) {
    s.cells[i] = G_SCORCH;
    s.dirty = true;
  }
  s.booms.push({ x: cx + 0.5, y: cy + 0.5, t: 0, r: 2.5 });
}

/**
 * Цели дронов — целые клетки склада. Раньше их искали случайным тыком по всей
 * карте, а на догорающем складе — фильтром десяти тысяч клеток, и так на
 * каждый дрон каждый кадр. Теперь список живёт в состоянии и пересобирается
 * только после пожара или ремонта.
 */
function targets(s: GameState): number[] {
  if (s.targetsStale) {
    s.targets = s.baseCells.filter((i) => s.cells[i] === G_BASE);
    s.targetsStale = false;
  }
  return s.targets;
}

function randomTarget(s: GameState): number {
  const alive = targets(s);
  if (!alive.length) return -1;
  const i = alive[(Math.random() * alive.length) | 0];
  // список мог протухнуть в этом же кадре — тогда пересобираем и берём заново
  if (s.cells[i] === G_BASE) return i;
  s.targetsStale = true;
  const fresh = targets(s);
  return fresh.length ? fresh[(Math.random() * fresh.length) | 0] : -1;
}

function spawnDrone(s: GameState, t: SpawnTicket) {
  const ti = randomTarget(s);
  if (ti < 0) return;
  const along = Math.max(-5, Math.min(GRID + 5, t.ox));
  let x: number;
  let y: number;
  if (t.edge === 0) {
    x = along;
    y = -3 + t.oy;
  } else if (t.edge === 1) {
    x = along;
    y = GRID + 3 + t.oy;
  } else if (t.edge === 2) {
    x = -3 + t.oy;
    y = along;
  } else {
    x = GRID + 3 + t.oy;
    y = along;
  }
  s.drones.push({
    id: s.nextId++,
    x,
    y,
    tx: (ti % GRID) + 0.5,
    ty: ((ti / GRID) | 0) + 0.5,
    ti,
    wob: Math.random() * Math.PI * 2,
    hit: false,
    hx: 0,
    hy: 0,
    fuse: 0,
    smokeT: 0,
  });
}

export function update(s: GameState, dt: number) {
  if (s.phase !== "playing") return;
  s.time += dt;

  // --- вылеты по расписанию ---
  while (s.planAt < s.plan.length && s.plan[s.planAt].at <= s.time) {
    spawnDrone(s, s.plan[s.planAt]);
    s.planAt++;
  }

  // --- прицел игрока ---
  if (s.firing && s.aim) {
    s.mgCd -= dt;
    let guard = 0;
    while (s.mgCd <= 0 && guard++ < 8) {
      s.mgCd += MG_INTERVAL;
      aimTick(s);
    }
  }

  // --- дроны ---
  for (let i = s.drones.length - 1; i >= 0; i--) {
    const d = s.drones[i];

    if (d.hit) {
      const step = FALL_SPEED * dt;
      d.x += d.hx * step;
      d.y += d.hy * step;
      d.fuse -= step;
      d.smokeT -= dt;
      if (d.smokeT <= 0) {
        d.smokeT = 0.05;
        s.puffs.push({ x: d.x, y: d.y, t: 0, r: 0.5 + Math.random() * 0.5 });
      }
      if (d.x < -4 || d.y < -4 || d.x > GRID + 4 || d.y > GRID + 4) {
        s.drones.splice(i, 1);
        continue;
      }
      if (d.fuse <= 0) {
        crash(s, d);
        s.drones.splice(i, 1);
      }
      continue;
    }

    if (s.cells[d.ti] !== G_BASE) {
      const ti = randomTarget(s);
      if (ti < 0) {
        s.drones.splice(i, 1);
        continue;
      }
      d.ti = ti;
      d.tx = (ti % GRID) + 0.5;
      d.ty = ((ti / GRID) | 0) + 0.5;
    }
    const dx = d.tx - d.x;
    const dy = d.ty - d.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const step = DRONE_SPEED * levelBonus(s.droneLevel, DRONE_PER_LEVEL) * dt;

    if (dist <= step) {
      ignite(s, d.ti);
      s.booms.push({ x: d.tx, y: d.ty, t: 0, r: 2.5 });
      s.drones.splice(i, 1);
      s.result.leaked++;
      continue;
    }

    d.wob += dt * 6;
    const nx = -dy / dist;
    const ny = dx / dist;
    const wob = Math.sin(d.wob) * 2;
    const px = d.x | 0;
    const py = d.y | 0;
    d.x += (dx / dist) * step + nx * wob * dt;
    d.y += (dy / dist) * step + ny * wob * dt;

    const cx = d.x | 0;
    const cy = d.y | 0;
    if (cx !== px || cy !== py) {
      const g = gunAt(s, cx, cy);
      if (g && Math.random() < GUN_HIT_CHANCE) {
        g.alive = false;
        s.result.gunsLost++;
        s.booms.push({ x: cx + 0.5, y: cy + 0.5, t: 0, r: 3 });
        s.drones.splice(i, 1);
        s.dirty = true;
      }
    }
  }

  // --- пушки ---
  for (const g of s.guns) {
    if (!g.alive) continue;
    g.cd -= dt;
    if (g.cd > 0) continue;
    const gx = g.cx + 0.5;
    const gy = g.cy + 0.5;
    let best: Drone | null = null;
    const reach = gunRange(s) + 0.5;
    let bestD = reach * reach;
    for (const d of s.drones) {
      if (d.hit) continue;
      const ddx = d.x - gx;
      const ddy = d.y - gy;
      const dd = ddx * ddx + ddy * ddy;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    if (best) {
      const a = Math.atan2(best.y - gy, best.x - gx);
      s.missiles.push({
        id: s.nextId++,
        x: gx,
        y: gy,
        dx: Math.cos(a),
        dy: Math.sin(a),
        target: best.id,
        life: MISSILE_LIFE,
      });
      g.cd = GUN_COOLDOWN;
    }
  }

  // --- ракеты ---
  // Цель ищем по индексу: раньше каждая ракета перебирала весь рой, и на
  // трёх сотнях дронов это выходило в десятки тысяч сравнений за кадр.
  const byId = s.missiles.length ? new Map<number, Drone>() : null;
  if (byId) for (const d of s.drones) byId.set(d.id, d);
  for (let i = s.missiles.length - 1; i >= 0; i--) {
    const m = s.missiles[i];
    m.life -= dt;
    if (m.life <= 0) {
      s.missiles.splice(i, 1);
      continue;
    }
    // Сбитый пулемётом дрон ещё планирует к земле, но он уже посчитан:
    // ракета его больше не видит, иначе один дрон уходил бы в счёт дважды —
    // и сумма сбитых переваливала за размер роя.
    const found = byId!.get(m.target);
    const t = found && !found.hit ? found : undefined;
    if (t) {
      const a = Math.atan2(t.y - m.y, t.x - m.x);
      const ca = Math.atan2(m.dy, m.dx);
      let da = a - ca;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const turn = Math.max(-8 * dt, Math.min(8 * dt, da));
      m.dx = Math.cos(ca + turn);
      m.dy = Math.sin(ca + turn);
    }
    const missileSpeed = MISSILE_SPEED * levelBonus(s.gunLevel, GUN_PER_LEVEL);
    m.x += m.dx * missileSpeed * dt;
    m.y += m.dy * missileSpeed * dt;
    if (t && (t.x - m.x) * (t.x - m.x) + (t.y - m.y) * (t.y - m.y) < 0.64) {
      s.booms.push({ x: t.x, y: t.y, t: 0, r: 2 });
      const at = s.drones.indexOf(t);
      if (at >= 0) s.drones.splice(at, 1);
      byId!.delete(t.id);
      s.missiles.splice(i, 1);
      s.result.killedByGuns++;
      continue;
    }
    if (m.x < -6 || m.y < -6 || m.x > GRID + 6 || m.y > GRID + 6) {
      s.missiles.splice(i, 1);
    }
  }

  // --- пожар ---
  if (s.fire.size) {
    const toIgnite: number[] = [];
    for (const [i, t] of s.fire) {
      const nt = t - dt;
      if (nt > 0) {
        s.fire.set(i, nt);
        continue;
      }
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const near: number[] = [];
      if (x > 0) near.push(i - 1);
      if (x < GRID - 1) near.push(i + 1);
      if (y > 0) near.push(i - GRID);
      if (y < GRID - 1) near.push(i + GRID);
      const fuel = near.filter((n) => s.cells[n] === G_BASE);
      if (fuel.length === 0) {
        // гореть больше нечему — очаг догорает сам, иначе бой не кончится
        s.cells[i] = 3; // G_BURNT
        s.fire.delete(i);
        s.targetsStale = true;
        s.dirty = true;
        continue;
      }
      s.fire.set(i, FIRE_SPREAD);
      toIgnite.push(...fuel);
    }
    for (const i of toIgnite) ignite(s, i);
  }

  // --- эффекты ---
  for (let i = s.booms.length - 1; i >= 0; i--) {
    s.booms[i].t += dt;
    if (s.booms[i].t > 0.5) s.booms.splice(i, 1);
  }
  for (let i = s.shots.length - 1; i >= 0; i--) {
    s.shots[i].t += dt;
    if (s.shots[i].t > SHOT_LIFE) s.shots.splice(i, 1);
  }
  for (let i = s.puffs.length - 1; i >= 0; i--) {
    s.puffs[i].t += dt;
    if (s.puffs[i].t > SMOKE_LIFE) s.puffs.splice(i, 1);
  }

  // --- конец боя ---
  if (s.baseOk <= 0) {
    s.phase = "lost";
    return;
  }
  const done = s.planAt >= s.plan.length && s.drones.length === 0 && s.fire.size === 0;
  if (done) s.phase = "won";
}

/** Итоговая карта для склада: то, что горело, считается сгоревшим. */
export function settle(s: GameState) {
  const cells = s.cells.slice();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === G_SCORCH) cells[i] = G_GROUND;
  }
  for (const i of s.fire.keys()) cells[i] = 3; // G_BURNT
  return {
    cells,
    guns: s.guns.filter((g) => g.alive).map((g) => ({ cx: g.cx, cy: g.cy })),
    depots: s.depots.map((d) => ({ ...d })),
    result: s.result,
  };
}
