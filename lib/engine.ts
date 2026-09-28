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
import { mulberry32, type Payload, type SpawnTicket } from "./attack";
import { DRONE, FIRE, FX, GUN, HANDS, MISSILE, PAYLOAD, SPRAY, SUPPRESS, TRAP, WAVE } from "./tuning";
import { gunKind } from "./base";

export { GRID, G_BASE, G_FIRE, G_GROUND, G_SCORCH, idx, isBuilding };
export { G_BURNT } from "./base";

export type Phase = "playing" | "won" | "lost";

export interface Gun {
  id: number;
  cx: number;
  cy: number;
  cd: number;
  alive: boolean;
  /** Куда сейчас смотрит ствол и куда доворачивает. */
  angle: number;
  aim: number;
  /** Огнетушитель вместо зенитки: он не стреляет, а поливает. */
  spray: boolean;
  /** Ловушка: держит дронов магнитом, не стреляет и не тушит. */
  trap: boolean;
  /** Сколько ещё секунд крутиться и лить. */
  wet: number;
  /** Сколько секунд воды осталось в баке. */
  tank: number;
  /**
   * Сколько ещё секунд установка заглушена. Пока больше нуля — не стреляет и
   * не льёт. Ставится каждый кадр, пока рядом висит подавитель, и сама
   * стекает, когда его сбили: глушилка отпускает не мгновенно.
   */
  jammed: number;
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
  /**
   * Идёт строем: сжимается к складу по радиусу, держа своё место в круге, и
   * только поравнявшись с целью расходится на неё. Пока строй цел, дрон не
   * качается — иначе кольцо размазывается и перестаёт читаться кольцом.
   */
  form: boolean;
  /** Доля скорости, уходящая в закрутку вокруг склада; знак — сторона. */
  swirl: number;
  /** Что несёт. От этого зависят и скорость, и то, чем кончится полёт. */
  payload: Payload;
  /**
   * Подавитель на круге: id пушки (>0), вокруг которой он ходит; −1 — свободный
   * облёт склада без жертвы; 0 — не на круге. fuel — секунды топлива на круге.
   */
  over: number;
  fuel: number;
  /**
   * Id ловушки, которая держит дрона (>0), или 0 — свободен. Пока держит,
   * дрон не летит на цель и не взрывается, но его всё ещё можно сбить.
   */
  heldBy: number;
  /** Секунда боя, на которой дрон вырвется из магнита. */
  heldUntil: number;
  /** И секунда, раньше которой его не схватят снова. */
  grabAt: number;
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
  /** Сколько огнетушителей сгорело: страховка платит за них по своей цене. */
  spraysLost: number;
  /** Сколько ловушек сгорело: страховка платит по цене ловушки. */
  trapsLost: number;
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
  /** Своя случайность вместо Math.random: бой должен быть повторим. */
  rnd: () => number;
  /** Уровень дронов нападающего и уровни защитника. */
  droneLevel: number;
  gunLevel: number;
  sprayLevel: number;
  trapLevel: number;
  mgLevel: number;
  waterLevel: number;
  dirty: boolean;
}

/** Готовит бой: карта склада как есть, пушки как есть, дроны по расписанию. */
/** Дальность пушек с учётом уровня — её же рисует зона покрытия. */
export const gunRange = (s: { gunLevel: number }) =>
  GUN.range * levelBonus(s.gunLevel, GUN.perLevel);

/** Дальность струи с учётом уровня — по ней же рисуется красный круг. */
export const sprayRange = (s: { sprayLevel: number }) =>
  SPRAY.range * levelBonus(s.sprayLevel, SPRAY.perLevel);

/** Радиус захвата ловушки с учётом уровня. */
export const trapRange = (s: { trapLevel: number }) =>
  TRAP.range * levelBonus(s.trapLevel, TRAP.perLevel);

/** Уровни, с которыми идёт бой. Чего нет — то первого уровня. */
export interface BattleLevels {
  drones?: number;
  guns?: number;
  sprays?: number;
  traps?: number;
  mg?: number;
  water?: number;
  /**
   * Зерно случайности. С ним бой воспроизводим: те же шаги и те же действия
   * дают тот же исход — иначе повтор у нападавшего разошёлся бы с боем.
   */
  seed?: number;
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
    guns: guns.map((g) => ({
      id: nextId++,
      cx: g.cx,
      cy: g.cy,
      cd: 0,
      alive: true,
      // изначально стволы смотрят наружу от середины карты
      angle: Math.atan2(g.cy + 0.5 - GRID / 2, g.cx + 0.5 - GRID / 2),
      aim: Math.atan2(g.cy + 0.5 - GRID / 2, g.cx + 0.5 - GRID / 2),
      spray: gunKind(g) === "spray",
      trap: gunKind(g) === "trap",
      wet: 0,
      tank: SPRAY.tank,
      jammed: 0,
    })),
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
    sprayLevel: levels.sprays ?? 1,
    trapLevel: levels.traps ?? 1,
    mgLevel: levels.mg ?? 1,
    waterLevel: levels.water ?? 1,
    planAt: 0,
    time: 0,
    baseTotal: baseCells.length,
    baseOk: ok,
    targets: baseCells.filter((i) => map[i] === G_BASE),
    targetsStale: false,
    rnd: mulberry32(levels.seed ?? ((Math.random() * 1e9) | 0)),
    result: {
      dronesSent: plan.length,
      killedByGuns: 0,
      killedByMg: 0,
      leaked: 0,
      burned: 0,
      extinguished: 0,
      gunsLost: 0,
      spraysLost: 0,
      trapsLost: 0,
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
  s.fire.set(i, FIRE.spread);
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
  if (g) killGun(s, g);
}

/** Сбрасывает захват у всех дронов, которых держала эта ловушка. */
/** Магнит погиб — всех, кого он держал, отпускаем с той же передышкой. */
function releaseHeld(s: GameState, trapId: number) {
  for (const d of s.drones) {
    if (d.heldBy !== trapId) continue;
    d.heldBy = 0;
    d.grabAt = s.time + TRAP.regrab;
  }
}

/** Убивает установку и учитывает потери по виду. */
function killGun(s: GameState, g: Gun) {
  if (!g.alive) return;
  g.alive = false;
  if (g.trap) {
    s.result.trapsLost++;
    releaseHeld(s, g.id);
  } else if (g.spray) s.result.spraysLost++;
  else s.result.gunsLost++;
}

/** Ближайший дрон к точке прицела и близко ли он настолько, что это захват. */
function lockOn(s: GameState, x: number, y: number) {
  let best: Drone | null = null;
  let bestD = HANDS.mg.radius * HANDS.mg.radius;
  for (const d of s.drones) {
    if (d.hit) continue;
    const dx = d.x - x;
    const dy = d.y - y;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return { best, locked: best !== null && bestD <= HANDS.mg.lock * HANDS.mg.lock };
}

/**
 * Чем игрок работает по этой точке. Дрон под прицелом важнее пожара: пока он
 * в перекрестье, бьёт очередь — хоть над складом. Нет дрона — над складом
 * брандспойт, над землёй пулемёт.
 */
export function aimMode(s: GameState, x: number, y: number): "mg" | "water" {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return "mg";
  if (lockOn(s, x, y).locked) return "mg";
  return isBuilding(s.cells[idx(cx, cy)]) ? "water" : "mg";
}

function aimTick(s: GameState) {
  const a = s.aim;
  if (!a) return;
  const cx = Math.floor(a.x);
  const cy = Math.floor(a.y);
  if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return;
  const { best, locked } = lockOn(s, a.x, a.y);
  const water = !locked && isBuilding(s.cells[idx(cx, cy)]);

  if (water) {
    s.shots.push({ x: a.x, y: a.y, t: 0, water: true, seed: s.rnd() });
    if (s.shots.length > FX.maxShots) s.shots.shift();
    const reach = HANDS.water.radius * levelBonus(s.waterLevel, HANDS.water.perLevel);
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

  const px = a.x + (s.rnd() - 0.5) * HANDS.mg.spread * 2;
  const py = a.y + (s.rnd() - 0.5) * HANDS.mg.spread * 2;
  s.shots.push({ x: px, y: py, t: 0, water: false, seed: s.rnd() });
  if (s.shots.length > FX.maxShots) s.shots.shift();

  const hx = Math.floor(px);
  const hy = Math.floor(py);
  if (hx >= 0 && hy >= 0 && hx < GRID && hy < GRID && !isBuilding(s.cells[idx(hx, hy)])) {
    s.holes.push({ x: px, y: py, seed: s.rnd() });
    if (s.holes.length > FX.maxHoles) s.holes.shift();
  }

  if (!best) return;
  // Меткость очереди растёт с уровнем пулемёта, но не до безусловной.
  if (s.rnd() > Math.min(HANDS.mg.maxHit, HANDS.mg.hit * levelBonus(s.mgLevel, HANDS.mg.perLevel)))
    return;

  const len = Math.hypot(best.tx - best.x, best.ty - best.y) || 1;
  best.hit = true;
  best.heldBy = 0;
  best.hx = (best.tx - best.x) / len;
  best.hy = (best.ty - best.y) / len;
  best.fuse = DRONE.glide;
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

/**
 * Что накрывает подавитель. Ровно столько же, сколько достаёт зенитка того
 * же уровня: при равных уровнях глушилка и пушка стоят друг друга, при
 * перевесе в уровнях кто-то один оказывается сильнее.
 */
export const suppressRange = (s: { droneLevel: number }) =>
  GUN.range * levelBonus(s.droneLevel, GUN.perLevel);

/** Середина поля: вокруг неё строится всякий строй. */
export const MID = GRID / 2;

function randomTarget(s: GameState): number {
  const alive = targets(s);
  if (!alive.length) return -1;
  const i = alive[(s.rnd() * alive.length) | 0];
  // список мог протухнуть в этом же кадре — тогда пересобираем и берём заново
  if (s.cells[i] === G_BASE) return i;
  s.targetsStale = true;
  const fresh = targets(s);
  return fresh.length ? fresh[(s.rnd() * fresh.length) | 0] : -1;
}

/**
 * Цель по своему лучу: строй расходится, и каждый берёт клетку, что ближе
 * к его направлению от середины. Со случайной целью кольцо на последних
 * метрах скрещивается само с собой и перестаёт быть кольцом.
 */
function rayTarget(s: GameState, ang: number): number {
  const alive = targets(s);
  if (!alive.length) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < WAVE.raySamples; k++) {
    const i = alive[(s.rnd() * alive.length) | 0];
    if (s.cells[i] !== G_BASE) continue;
    const a = Math.atan2(((i / GRID) | 0) + 0.5 - MID, (i % GRID) + 0.5 - MID);
    let da = Math.abs(a - ang) % (Math.PI * 2);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da < bestD) {
      bestD = da;
      best = i;
    }
  }
  // все пробы угодили в клетки, которые успели сгореть, — берём что есть
  return best >= 0 ? best : randomTarget(s);
}

function spawnDrone(s: GameState, t: SpawnTicket) {
  const form = t.form === true;
  const ang = t.ang ?? 0;
  // Строевой дрон целится по своему лучу, остальные — куда попало.
  const ti = form ? rayTarget(s, ang) : randomTarget(s);
  if (ti < 0) {
    // Целых клеток не осталось: складу уже нечем гореть. Дрон всё равно
    // доходит — записываем его прорвавшимся, иначе сбитые и прорвавшиеся
    // перестают сходиться с высланными, а на это опирается сервер.
    s.result.leaked++;
    return;
  }

  let x: number;
  let y: number;
  if (form) {
    // встаём на свою точку окружности: дальше дрон пойдёт строго по радиусу
    const rad = t.rad ?? MID;
    x = MID + Math.cos(ang) * rad;
    y = MID + Math.sin(ang) * rad;
  } else {
    const along = Math.max(-5, Math.min(GRID + 5, t.ox ?? 0));
    const off = t.oy ?? 0;
    const edge = t.edge ?? 0;
    if (edge === 0) {
      x = along;
      y = -3 + off;
    } else if (edge === 1) {
      x = along;
      y = GRID + 3 + off;
    } else if (edge === 2) {
      x = -3 + off;
      y = along;
    } else {
      x = GRID + 3 + off;
      y = along;
    }
  }

  s.drones.push({
    id: s.nextId++,
    x,
    y,
    tx: (ti % GRID) + 0.5,
    ty: ((ti / GRID) | 0) + 0.5,
    ti,
    wob: s.rnd() * Math.PI * 2,
    hit: false,
    hx: 0,
    hy: 0,
    fuse: 0,
    smokeT: 0,
    form,
    swirl: Math.max(-0.985, Math.min(0.985, t.swirl ?? 0)),
    payload: t.payload ?? "plain",
    over: 0,
    fuel: SUPPRESS.loiter,
    heldBy: 0,
    heldUntil: 0,
    grabAt: 0,
  });
}

/** Кого глушит эта начинка: зенитки или огнетушители. Иначе никого. */
function prey(payload: Payload): boolean | null {
  if (payload === "jammer") return false; // ложь — это зенитка, spray === false
  if (payload === "foamer") return true;
  return null;
}

/**
 * Дрон дошёл до цели. Простой взрывается, тяжёлый поджигает ещё и кольцо
 * вокруг, а подавитель не взрывается вовсе: он выбирает жертву и садится на
 * круг над ней. Нет жертвы — всё равно уходит на круг (over = −1) и кружит
 * над складом, пока не кончится топливо. Возвращает true, если дрон кончился.
 */
function arrive(s: GameState, d: Drone): boolean {
  const hunts = prey(d.payload);
  if (hunts !== null) {
    // Ищем ближайшую живую установку своего рода. Нет таких — глушить
    // некого, но подавитель не исчезает: уходит на свободный облёт склада.
    let best: Gun | null = null;
    let bestD = Infinity;
    for (const g of s.guns) {
      if (!g.alive || g.trap || g.spray !== hunts) continue;
      const dx = g.cx + 0.5 - d.x;
      const dy = g.cy + 0.5 - d.y;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) {
        bestD = dd;
        best = g;
      }
    }
    if (!best) {
      d.over = -1;
      return false;
    }
    d.over = best.id;
    // Сразу цель в кольце вокруг жертвы — иначе первый кадр тянет к центру пушки.
    const ang = s.rnd() * Math.PI * 2;
    const r = SUPPRESS.orbit + (s.rnd() * 2 - 1) * SUPPRESS.orbitJitter;
    d.tx = best.cx + 0.5 + Math.cos(ang) * r;
    d.ty = best.cy + 0.5 + Math.sin(ang) * r;
    // Нос уже смотрит куда летели: с этой ориентации и начнём доворачивать.
    const len = Math.hypot(d.tx - d.x, d.ty - d.y) || 1;
    d.hx = (d.tx - d.x) / len;
    d.hy = (d.ty - d.y) / len;
    d.wob = Math.atan2(d.hy, d.hx);
    return false;
  }

  ignite(s, d.ti);
  s.booms.push({ x: d.tx, y: d.ty, t: 0, r: 2.5 });
  // Двойная взрывчатка забирает не одну клетку, а кольцо вокруг неё.
  const ring = PAYLOAD[d.payload].ring;
  if (ring > 0) {
    const cx = d.ti % GRID;
    const cy = (d.ti / GRID) | 0;
    for (let y = cy - ring; y <= cy + ring; y++) {
      for (let x = cx - ring; x <= cx + ring; x++) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        ignite(s, idx(x, y));
      }
    }
  }
  return true;
}

/**
 * Глушит всё своего рода в своём радиусе. Работает с первой секунды полёта,
 * а не только когда дрон уже сел на круг, — в этом вся суть уровней: радиус
 * подавления считается формулой дальности зенитки, поэтому при равных
 * уровнях подавитель затыкает ровно те пушки, которые могли бы его достать,
 * при высшем уровне накрывает их раньше, чем они дотянутся, а при низшем
 * его расстреливают на подлёте. Отдельного «его нельзя сбить» в коде нет:
 * защищает его радиус, и только он.
 */
function suppressTick(s: GameState, d: Drone) {
  const hunts = prey(d.payload);
  if (hunts === null) return;
  const reach = suppressRange(s);
  for (const g of s.guns) {
    if (!g.alive || g.trap || g.spray !== hunts) continue;
    const dx = g.cx + 0.5 - d.x;
    const dy = g.cy + 0.5 - d.y;
    if (dx * dx + dy * dy <= reach * reach) g.jammed = SUPPRESS.release;
  }
}

/**
 * Подавитель без жертвы: топливо кончилось — падает как подбитый (hit →
 * crash), чтобы поджечь клетку под собой, а не исчезнуть молча.
 */
function suppressFall(s: GameState, d: Drone) {
  const ti = randomTarget(s);
  if (ti >= 0) {
    d.ti = ti;
    d.tx = (ti % GRID) + 0.5;
    d.ty = ((ti / GRID) | 0) + 0.5;
  }
  const len = Math.hypot(d.tx - d.x, d.ty - d.y) || 0.01;
  d.hit = true;
  d.heldBy = 0;
  d.hx = (d.tx - d.x) / len;
  d.hy = (d.ty - d.y) / len;
  d.fuse = Math.min(DRONE.glide, len);
  d.smokeT = 0;
  d.over = 0;
  s.result.leaked++;
}

/**
 * Подавитель на круге: над жертвой летает хаотично по широкой зоне вокруг
 * установки, без жертвы — случайно над складом. Кончилось топливо на
 * свободном облёте — падает и жжёт; над жертвой или жертва сгорела — уходит
 * с карты (прорвавшийся).
 */
function loiterTick(
  s: GameState,
  d: Drone,
  dt: number,
  gunsById: Map<number, Gun>
) {
  d.fuel -= dt;

  // Свободный облёт: жертвы не было с посадки. Кружит над живыми клетками
  // склада, пока есть топливо, потом падает.
  if (d.over < 0) {
    if (d.fuel <= 0) {
      suppressFall(s, d);
      return;
    }
    const speed =
      DRONE.speed * levelBonus(s.droneLevel, DRONE.perLevel) * PAYLOAD[d.payload].speed;
    const dist = Math.hypot(d.tx - d.x, d.ty - d.y) || 1;
    if (dist <= speed * dt * 2) {
      const ti = randomTarget(s);
      if (ti >= 0) {
        d.ti = ti;
        d.tx = (ti % GRID) + 0.5;
        d.ty = ((ti / GRID) | 0) + 0.5;
      }
    }
    steerLoiter(d, speed, dt);
    return;
  }

  const host = gunsById.get(d.over);
  if (!host || !host.alive || d.fuel <= 0) {
    const at = s.drones.indexOf(d);
    if (at >= 0) s.drones.splice(at, 1);
    s.result.leaked++;
    return;
  }

  // Над жертвой — точки в широком кольце; курс к ним доворачивается носом,
  // а не ломается углом при каждой смене цели.
  const speed =
    DRONE.speed * levelBonus(s.droneLevel, DRONE.perLevel) * PAYLOAD[d.payload].speed;
  const hx = host.cx + 0.5;
  const hy = host.cy + 0.5;
  const dist = Math.hypot(d.tx - d.x, d.ty - d.y) || 1;
  const fromHost = Math.hypot(d.tx - hx, d.ty - hy);
  if (
    dist <= speed * dt * 2 ||
    fromHost < SUPPRESS.orbit - SUPPRESS.orbitJitter - 0.5 ||
    fromHost > SUPPRESS.orbit + SUPPRESS.orbitJitter + 0.5
  ) {
    const ang = s.rnd() * Math.PI * 2;
    const r = SUPPRESS.orbit + (s.rnd() * 2 - 1) * SUPPRESS.orbitJitter;
    d.tx = hx + Math.cos(ang) * r;
    d.ty = hy + Math.sin(ang) * r;
  }
  steerLoiter(d, speed, dt);
}

/** Доворот курса к точке: hx/hy — нос, скорость полная, рысканье мягкое. */
function steerLoiter(d: Drone, speed: number, dt: number) {
  const dx = d.tx - d.x;
  const dy = d.ty - d.y;
  const want = Math.atan2(dy, dx);
  let heading = d.hx === 0 && d.hy === 0 ? want : Math.atan2(d.hy, d.hx);
  let da = want - heading;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const max = SUPPRESS.turn * dt;
  heading += Math.max(-max, Math.min(max, da));
  d.hx = Math.cos(heading);
  d.hy = Math.sin(heading);
  const step = speed * dt;
  d.wob += dt * DRONE.wobbleRate;
  const wob = Math.sin(d.wob) * DRONE.wobbleAmp * 0.7 * dt;
  d.x += d.hx * step - d.hy * wob;
  d.y += d.hy * step + d.hx * wob;
}

/**
 * Водит захваченного дрона по малой орбите вокруг ловушки.
 *
 * Дрон именно кружит, а не висит: точка притяжения едет по кругу вместе с
 * wob. Раньше угол считался только от id и потому был постоянным — дрон
 * подтягивался к своей точке и замирал в ней намертво, и удержание со
 * стороны читалось зависшей игрой. Сдвиг по id остаётся, но теперь он
 * разводит дронов по фазе, чтобы они не летели один в другом.
 */
function pullHeld(s: GameState, d: Drone, host: Gun, dt: number) {
  const hx = host.cx + 0.5;
  const hy = host.cy + 0.5;
  d.wob += dt * TRAP.spin;
  const ang = d.id * 2.399963229728653 + d.wob; // сдвиг ≈ на золотой угол
  const ox = hx + Math.cos(ang) * TRAP.orbit;
  const oy = hy + Math.sin(ang) * TRAP.orbit;
  const k = 1 - Math.exp(-TRAP.pull * 10 * dt);
  d.x += (ox - d.x) * k;
  d.y += (oy - d.y) * k;
}

/** Свободные дроны в радиусе живой ловушки с местом — захватываются. */
function captureTraps(s: GameState) {
  const reach = trapRange(s);
  const r2 = reach * reach;
  const held = new Map<number, number>();
  for (const d of s.drones) {
    if (d.heldBy > 0) held.set(d.heldBy, (held.get(d.heldBy) ?? 0) + 1);
  }
  for (const d of s.drones) {
    if (d.heldBy > 0 || d.hit || d.over || s.time < d.grabAt) continue;
    let best: Gun | null = null;
    let bestD = r2;
    for (const g of s.guns) {
      if (!g.alive || !g.trap) continue;
      if ((held.get(g.id) ?? 0) >= TRAP.capacity) continue;
      const dx = g.cx + 0.5 - d.x;
      const dy = g.cy + 0.5 - d.y;
      const dd = dx * dx + dy * dy;
      if (dd <= bestD) {
        bestD = dd;
        best = g;
      }
    }
    if (!best) continue;
    d.heldBy = best.id;
    d.heldUntil = s.time + TRAP.hold;
    d.form = false;
    held.set(best.id, (held.get(best.id) ?? 0) + 1);
  }
}

/** Вылеты по расписанию. */
function stepSpawns(s: GameState) {
  while (s.planAt < s.plan.length && s.plan[s.planAt].at <= s.time) {
    spawnDrone(s, s.plan[s.planAt]);
    s.planAt++;
  }
}

/** Руки игрока: очередь и струя по тому, куда наведён прицел. */
function stepHands(s: GameState, dt: number) {
  if (s.firing && s.aim) {
    s.mgCd -= dt;
    let guard = 0;
    while (s.mgCd <= 0 && guard++ < 8) {
      s.mgCd += HANDS.mg.interval;
      aimTick(s);
    }
  }
}

/** Рой: строй, магниты, подавление, подлёт и прилёт. */
function stepDrones(s: GameState, dt: number, gunsById: Map<number, Gun>) {
  for (let i = s.drones.length - 1; i >= 0; i--) {
    const d = s.drones[i];

    if (d.hit) {
      const step = DRONE.fallSpeed * dt;
      d.x += d.hx * step;
      d.y += d.hy * step;
      d.fuse -= step;
      d.smokeT -= dt;
      if (d.smokeT <= 0) {
        d.smokeT = DRONE.smokeEvery;
        s.puffs.push({ x: d.x, y: d.y, t: 0, r: 0.5 + s.rnd() * 0.5 });
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

    // Ловушка держит дрона на орбите: не летит, не взрывается и не глушит —
    // полезная нагрузка заморожена, пока магнит держит.
    if (d.heldBy > 0) {
      const host = gunsById.get(d.heldBy);
      const reach = trapRange(s);
      // Вырваться можно двумя путями: выйдет срок или не станет магнита.
      // Срок обязателен — на орбите радиуса TRAP.orbit дрон из круга
      // ловушки не выходит никогда, и без срока он висел бы там до конца
      // боя, а бой не кончался бы вовсе.
      if (
        s.time >= d.heldUntil ||
        !host ||
        !host.alive ||
        !host.trap ||
        (host.cx + 0.5 - d.x) ** 2 + (host.cy + 0.5 - d.y) ** 2 >
          reach * reach
      ) {
        d.heldBy = 0;
        d.grabAt = s.time + TRAP.regrab;
      } else {
        pullHeld(s, d, host, dt);
        continue;
      }
    }

    // Глушит он с первой секунды полёта, а не только на круге: пушки
    // стреляют ниже по этому же кадру и заглушёнными его уже не достанут.
    suppressTick(s, d);

    // Дойдя до склада, подавитель садится на круг над своей жертвой и висит,
    // пока есть топливо. Проверяем до всего прочего: на круге ему не нужны
    // ни цель, ни строй, а сгоревшая цель не должна унести его мимо
    // статистики.
    if (d.over) {
      loiterTick(s, d, dt, gunsById);
      continue;
    }

    if (s.cells[d.ti] !== G_BASE) {
      const ti = randomTarget(s);
      if (ti < 0) {
        s.drones.splice(i, 1);
        s.result.leaked++;
        continue;
      }
      d.ti = ti;
      d.tx = (ti % GRID) + 0.5;
      d.ty = ((ti / GRID) | 0) + 0.5;
    }
    const step =
      DRONE.speed * levelBonus(s.droneLevel, DRONE.perLevel) * PAYLOAD[d.payload].speed * dt;
    const px = d.x | 0;
    const py = d.y | 0;

    if (d.form) {
      // Строй: дрон держит своё место в круге и сжимает радиус. Скорость
      // делим между «внутрь» и «по кругу», сумма остаётся прежней, — иначе
      // закрученный заход выходил бы быстрее прямого и ломал бы баланс.
      // Угловая скорость при этом растёт к середине сама: на коротком
      // радиусе та же доля скорости даёт больший угол, и спираль к концу
      // раскручивается воронкой.
      const rx = d.x - MID;
      const ry = d.y - MID;
      const r = Math.hypot(rx, ry) || 0.001;
      const tr = Math.hypot(d.tx - MID, d.ty - MID);
      if (r > tr + WAVE.peel) {
        const k = d.swirl;
        const nr = r - step * Math.sqrt(1 - k * k);
        const na = Math.atan2(ry, rx) + (step * k) / r;
        d.x = MID + Math.cos(na) * nr;
        d.y = MID + Math.sin(na) * nr;
      } else {
        // Поравнялись с целью — строй расходится. Цель берём заново по
        // своему лучу: та, что досталась на вылете, могла уже сгореть.
        d.form = false;
        const ti = rayTarget(s, Math.atan2(ry, rx));
        if (ti < 0) {
          s.drones.splice(i, 1);
          continue;
        }
        d.ti = ti;
        d.tx = (ti % GRID) + 0.5;
        d.ty = ((ti / GRID) | 0) + 0.5;
      }
    }

    if (!d.form) {
      const dx = d.tx - d.x;
      const dy = d.ty - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      if (dist <= step) {
        if (arrive(s, d)) {
          s.drones.splice(i, 1);
          s.result.leaked++;
        }
        continue;
      }

      d.wob += dt * DRONE.wobbleRate;
      const nx = -dy / dist;
      const ny = dx / dist;
      const wob = Math.sin(d.wob) * DRONE.wobbleAmp;
      d.x += (dx / dist) * step + nx * wob * dt;
      d.y += (dy / dist) * step + ny * wob * dt;
    }

    const cx = d.x | 0;
    const cy = d.y | 0;
    if (cx !== px || cy !== py) {
      const g = gunAt(s, cx, cy);
      // Подавитель не таранит: у него нет боеголовки, и уносить установку
      // собой ему нечем. Раньше он сбивал пушки случайными касаниями и сам
      // при этом пропадал — выглядело как необъяснимые потери.
      if (g && prey(d.payload) === null && s.rnd() < DRONE.gunCollision) {
        killGun(s, g);
        s.booms.push({ x: cx + 0.5, y: cy + 0.5, t: 0, r: 3 });
        s.drones.splice(i, 1);
        // Его никто не сбивал — он дошёл и снёс установку собой. В счёт идёт
        // прорвавшимся, иначе сбитые и прорвавшиеся не сходятся с высланными.
        s.result.leaked++;
        s.dirty = true;
      }
    }
  }

  // Свободные дроны в радиусе ловушки захватываются после движения.
  captureTraps(s);
}

/** Огнетушители: льют сами, пока рядом горит и есть вода. */
function stepSprays(s: GameState, dt: number) {
  // Загорелось в радиусе — установка раскручивается и льёт восемью струями
  // звездой. Струя не гасит с ходу: клетку надо пролить, а луч упирается в
  // первый же огонь на своём пути. Отсюда и потолок: восемь очагов разом, не
  // больше, — широкий фронт огня установку обходит.
  const reach = sprayRange(s);
  const douse = dt / SPRAY.soak;
  for (const g of s.guns) {
    if (!g.alive || !g.spray) continue;
    // заглушённая пеной установка не льёт, но бак у неё не течёт
    g.jammed = Math.max(0, g.jammed - dt);
    if (g.jammed > 0) continue;
    const gx = g.cx + 0.5;
    const gy = g.cy + 0.5;

    let fireNear = false;
    for (const i of s.fire.keys()) {
      const dx = (i % GRID) + 0.5 - gx;
      const dy = ((i / GRID) | 0) + 0.5 - gy;
      if (dx * dx + dy * dy <= reach * reach) {
        fireNear = true;
        break;
      }
    }
    if (fireNear && g.tank > 0) g.wet = SPRAY.hold;
    if (g.wet <= 0 || g.tank <= 0) continue;

    g.wet -= dt;
    g.tank -= dt;
    g.angle += SPRAY.spin * dt;
    for (let j = 0; j < SPRAY.jets; j++) {
      const a = g.angle + (j * Math.PI * 2) / SPRAY.jets;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      for (let r = 0.5; r <= reach; r += 0.5) {
        const x = Math.floor(gx + dx * r);
        const y = Math.floor(gy + dy * r);
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) break;
        if (s.cells[idx(x, y)] !== G_FIRE) continue;
        // вода льётся в первый очаг на луче и дальше не идёт
        if (s.rnd() < douse) extinguish(s, x, y);
        break;
      }
    }
  }
}

/** Зенитки: доворачивают башню и пускают ракеты. */
function stepGuns(s: GameState, dt: number) {
  for (const g of s.guns) {
    if (!g.alive || g.spray || g.trap) continue;

    // Заглушённая зенитка не стреляет. Башню всё равно доворачиваем — по
    // шевелящемуся стволу видно, что пушка жива, просто её глушат.
    g.jammed = Math.max(0, g.jammed - dt);

    // Башня доворачивает к последней цели — по ней видно, куда пушка смотрит.
    let da = g.aim - g.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const turn = GUN.turretTurn * dt;
    g.angle += Math.max(-turn, Math.min(turn, da));

    g.cd -= dt;
    if (g.cd > 0 || g.jammed > 0) continue;
    const gx = g.cx + 0.5;
    const gy = g.cy + 0.5;
    let best: Drone | null = null;
    const reach = gunRange(s) + 0.5;
    let bestD = reach * reach;
    for (const d of s.drones) {
      // Подавителя зенитка берёт на общих основаниях. Не даёт ей выстрелить
      // не запрет, а его собственный радиус: заглушённая пушка до проверки
      // цели уже не доходит.
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
      g.aim = a;
      s.missiles.push({
        id: s.nextId++,
        x: gx,
        y: gy,
        dx: Math.cos(a),
        dy: Math.sin(a),
        target: best.id,
        life: MISSILE.life,
      });
      g.cd = GUN.cooldown;
    }
  }
}

/** Ракеты: догоняют цель, стареют, уходят за край. */
function stepMissiles(s: GameState, dt: number) {
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
      const turn = Math.max(-MISSILE.turn * dt, Math.min(MISSILE.turn * dt, da));
      m.dx = Math.cos(ca + turn);
      m.dy = Math.sin(ca + turn);
    }
    const missileSpeed = MISSILE.speed * levelBonus(s.gunLevel, GUN.perLevel);
    m.x += m.dx * missileSpeed * dt;
    m.y += m.dy * missileSpeed * dt;
    const hit = MISSILE.hitRadius * MISSILE.hitRadius;
    if (t && (t.x - m.x) * (t.x - m.x) + (t.y - m.y) * (t.y - m.y) < hit) {
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
}

/** Пожар: перекидывается на соседей, а без топлива догорает. */
function stepFire(s: GameState, dt: number) {
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
      s.fire.set(i, FIRE.spread);
      toIgnite.push(...fuel);
    }
    for (const i of toIgnite) ignite(s, i);
  }
}

/** Следы боя: взрывы, выстрелы, дым. На расчёт не влияют. */
function stepEffects(s: GameState, dt: number) {
  for (let i = s.booms.length - 1; i >= 0; i--) {
    s.booms[i].t += dt;
    if (s.booms[i].t > FX.boomLife) s.booms.splice(i, 1);
  }
  for (let i = s.shots.length - 1; i >= 0; i--) {
    s.shots[i].t += dt;
    if (s.shots[i].t > FX.shotLife) s.shots.splice(i, 1);
  }
  for (let i = s.puffs.length - 1; i >= 0; i--) {
    s.puffs[i].t += dt;
    if (s.puffs[i].t > FX.smokeLife) s.puffs.splice(i, 1);
  }
}

/**
 * Шаг боя. Фазы идут строго в этом порядке, и порядок значим: подавители
 * глушат установки раньше, чем те стреляют, а пожар перекидывается уже
 * после того, как рой отработал. Меняешь порядок — меняешь исход боя, и
 * повтор у нападавшего разойдётся с тем, что видел защитник.
 */
export function update(s: GameState, dt: number) {
  if (s.phase !== "playing") return;
  s.time += dt;

  // Карта установок по id — один раз на тик: захваченных и кружащих
  // подавителей иначе каждая фаза гоняла бы через guns.find.
  const gunsById = new Map<number, Gun>();
  for (const g of s.guns) gunsById.set(g.id, g);

  stepSpawns(s);
  stepHands(s, dt);
  stepDrones(s, dt, gunsById);
  stepSprays(s, dt);
  stepGuns(s, dt);
  stepMissiles(s, dt);
  stepFire(s, dt);
  stepEffects(s, dt);

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
  // Бой кончился, а кто-то ещё в воздухе — так бывает, когда склад пал
  // раньше, чем долетел весь рой, и когда остатки висят на магнитах. Никто
  // их не сбивал, так что записываем прорвавшимися: иначе сбитые и
  // прорвавшиеся не сойдутся с высланными, а на этом равенстве стоит и
  // отчёт нападающему, и проверка сервера.
  for (const d of s.drones) {
    if (!d.hit) s.result.leaked++;
  }

  const cells = s.cells.slice();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === G_SCORCH) cells[i] = G_GROUND;
  }
  for (const i of s.fire.keys()) cells[i] = 3; // G_BURNT
  return {
    cells,
    guns: s.guns
      .filter((g) => g.alive)
      .map((g) =>
        g.trap
          ? { cx: g.cx, cy: g.cy, kind: "trap" as const }
          : g.spray
            ? { cx: g.cx, cy: g.cy, kind: "spray" as const }
            : { cx: g.cx, cy: g.cy }
      ),
    depots: s.depots.map((d) => ({ ...d })),
    result: s.result,
  };
}
