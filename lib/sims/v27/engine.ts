// Замороженный движок версии 27. Не править — сгенерировано scripts/freeze-sim.cjs.
/* eslint-disable */
// @ts-nocheck
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
import {
  ARMOR,
  BALLOON,
  BLOW,
  SHOOTER,
  DRONE,
  FIRE,
  FX,
  GUN,
  HANDS,
  MISSILE,
  PAYLOAD,
  ROCKET,
  SPRAY,
  SUPPRESS,
  TRAP,
  WAVE,
} from "./tuning";
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
  /**
   * Ракетница: та же зенитка, только достаёт вдвое дальше, пускает неточно
   * и держит в воздухе одну ракету за раз.
   */
  rocket: boolean;
  /**
   * Пусковая установка шаров: не стреляет, а один раз выбрасывает весь
   * запас, когда в её круг входит дрон. После выпуска её нет — spent.
   */
  balloon: boolean;
  spent: boolean;
  /** Сколько ещё секунд крутиться и лить. */
  wet: number;
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
  /**
   * Скорость, клеток в секунду, — сколько дрон сместился за последний шаг.
   * По ней зенитка берёт упреждение: считать её из курса нельзя, строй с
   * закруткой летит не туда, куда смотрит нос.
   */
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  ti: number;
  wob: number;
  hit: boolean;
  /**
   * Сколько ещё снарядов зенитки дрон выдержит, прежде чем его собьёт
   * следующий. У брони — один, у остальных ноль.
   */
  armor: number;
  /** Броню уже пробило: дрон летит дальше, но дымит. */
  dented: boolean;
  /** Стрелок уже пустил свою ракету. */
  fired: boolean;
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

/**
 * Ракета стрелка: летит прямо в клетку склада и поджигает её. Её видят
 * зенитки и сбивают с упреждением, как дрона, а шар на пути её лопает.
 */
export interface FoeRocket {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ti: number;
}

/** Снаряд зенитки: неуправляемый, летит прямо, куда выпустили. */
export interface Missile {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
}

/**
 * Ракета ракетницы. От снаряда зенитки отличается тем, что цель у неё не
 * закреплена: каждый кадр она сверяется, кто из роя теперь ближе, и
 * доворачивает туда. Отсюда и дуги в следе.
 */
export interface Rocket {
  id: number;
  /** Чья: пока её ракета в воздухе, ракетница не пускает вторую. */
  from: number;
  /**
   * За кем пущена — id дрона. Цель одна на весь полёт: потеряла её — не
   * ищет другую, а летит прямо и уходит с поля.
   */
  target: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
  /** Сколько секунд до следующего клуба дыма. */
  smokeT: number;
}

/**
 * Аэростат заграждения. Весь его смысл — занимать место: он ползёт над
 * полем, и всё, что в него влетает, кончается вместе с ним. Своих он не
 * различает, так что и снаряд зенитки лопнет шар, если тот оказался на
 * линии.
 */
export interface Balloon {
  id: number;
  x: number;
  y: number;
  /** Куда ползёт и когда надумает ползти иначе. */
  ang: number;
  want: number;
  next: number;
  /** Сколько ещё ждёт выпуска: пока ждёт, его нет ни на карте, ни в бою. */
  wait: number;
  /** Летит к своей точке в круге установки; долетел — дальше дрейфует. */
  fly: boolean;
  tx: number;
  ty: number;
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
  /**
   * Сколько живёт этот клуб. Пусто — общий FX.smokeLife: так дымят подбитые.
   * След ракеты живёт меньше, иначе он тянулся бы через всю карту.
   */
  life?: number;
  /** Светлый клуб — выхлоп ракеты. Без поля — чёрный дым подбитого. */
  light?: boolean;
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
  /** Сколько ракетниц сгорело: они дороже зениток, и страховка это знает. */
  rocketsLost: number;
  /** Сколько дронов разбилось о шары: ни пушки, ни руки тут ни при чём. */
  killedByBalloons: number;
  /** Сколько ракет стрелков сбили на подлёте. В счёт дронов не идут. */
  foeRocketsDown: number;
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
  rockets: Rocket[];
  /** Ракеты стрелков, летящие в склад. */
  foeRockets: FoeRocket[];
  balloons: Balloon[];
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
  /**
   * Установки по id. Собирается один раз на бой: за бой они не появляются
   * и не исчезают — только помечаются мёртвыми, — а пересобирать четыре
   * сотни записей каждый кадр стоило дороже, чем всё, ради чего их ищут.
   */
  gunsById: Map<number, Gun>;
  /**
   * Те же установки, разложенные по блокам поля. Тоже раз на бой: за бой
   * они не переезжают, а подавителю нужны не все четыре сотни, а те
   * полдюжины, что попали ему под круг.
   */
  gunBlocks: Map<number, Gun[]>;
  /** Своя случайность вместо Math.random: бой должен быть повторим. */
  rnd: () => number;
  /** Уровень дронов нападающего и уровни защитника. */
  droneLevel: number;
  gunLevel: number;
  sprayLevel: number;
  trapLevel: number;
  rocketLevel: number;
  balloonLevel: number;
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

/** Дальность ракетницы с учётом уровня: вдвое против зенитки. */
export const rocketRange = (s: { rocketLevel: number }) =>
  ROCKET.range * levelBonus(s.rocketLevel, ROCKET.perLevel);

/** Радиус круга пусковой установки шаров с учётом уровня. */
export const balloonRange = (s: { balloonLevel: number }) =>
  BALLOON.range * levelBonus(s.balloonLevel, BALLOON.perLevel);

/** Сколько шаров выбрасывает установка этого уровня: каждый уровень — ещё два. */
export const balloonCount = (level: number) =>
  BALLOON.count + BALLOON.countPerLevel * (Math.max(1, level) - 1);

/**
 * Темп установки с учётом уровня: во столько раз быстрее она перезаряжается
 * и водит стволом. Один множитель на оба дела — «прокачанная пушка резвее»
 * читается именно так, а не двумя отдельными цифрами.
 */
export const gunTempo = (s: { gunLevel: number }) =>
  levelBonus(s.gunLevel, GUN.reloadPerLevel);

export const rocketTempo = (s: { rocketLevel: number }) =>
  levelBonus(s.rocketLevel, ROCKET.reloadPerLevel);

/** Уровни, с которыми идёт бой. Чего нет — то первого уровня. */
export interface BattleLevels {
  drones?: number;
  guns?: number;
  sprays?: number;
  traps?: number;
  rockets?: number;
  balloons?: number;
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

  const s: GameState = {
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
      rocket: gunKind(g) === "rocket",
      balloon: gunKind(g) === "balloon",
      spent: false,
      wet: 0,
      jammed: 0,
    })),
    depots: depots.map((d) => ({ ...d })),
    drones: [],
    missiles: [],
    rockets: [],
    foeRockets: [],
    balloons: [],
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
    rocketLevel: levels.rockets ?? 1,
    balloonLevel: levels.balloons ?? 1,
    mgLevel: levels.mg ?? 1,
    waterLevel: levels.water ?? 1,
    planAt: 0,
    time: 0,
    baseTotal: baseCells.length,
    baseOk: ok,
    targets: baseCells.filter((i) => map[i] === G_BASE),
    targetsStale: false,
    gunsById: new Map(),
    gunBlocks: new Map(),
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
      rocketsLost: 0,
      killedByBalloons: 0,
      foeRocketsDown: 0,
      dronesLost: 0,
      depotsLost: 0,
    },
    nextId,
    dirty: true,
  };

  for (const g of s.guns) {
    s.gunsById.set(g.id, g);
    const k = blockKey(g.cx, g.cy);
    const cell = s.gunBlocks.get(k);
    if (cell) cell.push(g);
    else s.gunBlocks.set(k, [g]);
  }
  return s;
}

/**
 * Стрелок дошёл до своей дальности — пускает ракету в свою же цель. Сам он
 * летит дальше: цель к его прилёту уже горит, и он берёт другую, как любой
 * дрон, чья клетка сгорела.
 */
function shoot(s: GameState, d: Drone, droneSpeed: number) {
  const dx = d.tx - d.x;
  const dy = d.ty - d.y;
  const dist = Math.hypot(dx, dy);
  if (dist > SHOOTER.range || dist < 0.5) return;
  d.fired = true;
  const v = droneSpeed * SHOOTER.speed;
  s.foeRockets.push({ id: s.nextId++, x: d.x, y: d.y, vx: (dx / dist) * v, vy: (dy / dist) * v, ti: d.ti });
}

/** Ракеты стрелков: летят прямо, долетели — клетка горит. */
function stepFoeRockets(s: GameState, dt: number) {
  for (let i = s.foeRockets.length - 1; i >= 0; i--) {
    const r = s.foeRockets[i];
    const tx = (r.ti % GRID) + 0.5;
    const ty = ((r.ti / GRID) | 0) + 0.5;
    const left = Math.hypot(tx - r.x, ty - r.y);
    const step = Math.hypot(r.vx, r.vy) * dt;
    if (left <= step) {
      crash(s, { x: tx, y: ty, payload: "plain" });
      s.foeRockets.splice(i, 1);
      continue;
    }
    r.x += r.vx * dt;
    r.y += r.vy * dt;
  }
}

/** Шаг золотого угла: соседние шары расходятся, не складываясь в лучи. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Пусковые установки шаров. Как только в круг установки входит дрон, она
 * выбрасывает весь запас почти разом и пропадает. Точки шаров раскладываем
 * по кругу ровно, но без узора: радиус — по равным долям площади, угол — по
 * золотому сечению, и то и другое с дрожью. Так круг закрыт целиком, а не
 * кольцом по краю и не кучей в середине.
 */
function stepLaunchers(s: GameState) {
  const r = balloonRange(s);
  const r2 = r * r;
  for (const g of s.guns) {
    if (!g.balloon || !g.alive || g.spent) continue;
    const gx = g.cx + 0.5;
    const gy = g.cy + 0.5;
    const near = s.drones.some(
      (d) => !d.hit && (d.x - gx) * (d.x - gx) + (d.y - gy) * (d.y - gy) <= r2
    );
    if (!near) continue;

    g.spent = true;
    g.alive = false;
    const n = balloonCount(s.balloonLevel);
    const turn = s.rnd() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const rr = r * Math.sqrt((k + 0.25 + s.rnd() * 0.5) / n);
      const a = turn + k * GOLDEN + (s.rnd() - 0.5) * 0.5;
      const ang = s.rnd() * Math.PI * 2;
      s.balloons.push({
        id: s.nextId++,
        x: gx,
        y: gy,
        tx: Math.max(0, Math.min(GRID, gx + Math.cos(a) * rr)),
        ty: Math.max(0, Math.min(GRID, gy + Math.sin(a) * rr)),
        fly: true,
        wait: s.rnd() * BALLOON.spread,
        ang,
        want: ang,
        next: BALLOON.rethink * (0.5 + s.rnd()),
      });
    }
    s.dirty = true;
  }
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
  switch (gunKind(g)) {
    case "trap":
      s.result.trapsLost++;
      releaseHeld(s, g.id);
      break;
    case "spray":
      s.result.spraysLost++;
      break;
    case "rocket":
      s.result.rocketsLost++;
      break;
    case "balloon":
      // разовая установка: сгорела до выпуска — шаров не будет, и только
      break;
    default:
      s.result.gunsLost++;
      break;
  }
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

/**
 * Подбитый дрон упал: склад — пожар, земля — выжженное пятно. Взрывчатка
 * рвётся и при падении — склад горит тем же крестом, что и на цели, а земля
 * обугливается одной клеткой; разрыв крупнее.
 */
function crash(s: GameState, d: Pick<Drone, "x" | "y" | "payload">) {
  const cx = Math.max(0, Math.min(GRID - 1, Math.floor(d.x)));
  const cy = Math.max(0, Math.min(GRID - 1, Math.floor(d.y)));
  const ring = PAYLOAD[d.payload].ring;
  for (let y = cy - ring; y <= cy + ring; y++) {
    for (let x = cx - ring; x <= cx + ring; x++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) > ring) continue;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      const i = idx(x, y);
      if (s.cells[i] === G_BASE) ignite(s, i);
      // Земля обугливается только под самим взрывом: крест на земле выглядел
      // неестественно. Склад горит крестом — там это урон, а не след.
      else if (s.cells[i] === G_GROUND && x === cx && y === cy) {
        s.cells[i] = G_SCORCH;
        s.dirty = true;
      }
    }
  }
  s.booms.push({ x: cx + 0.5, y: cy + 0.5, t: 0, r: 2.5 * PAYLOAD[d.payload].blast });
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
 * Что накрывает подавитель. Глушилкам пушек и огнетушителей — ровно
 * столько же, сколько достаёт зенитка того же уровня: при равных уровнях
 * глушилка и пушка стоят друг друга, при перевесе кто-то один оказывается
 * сильнее. Размагничиванию — половина радиуса ловушки того же уровня:
 * ловушка не стреляет, и глушить её с безопасной дистанции было бы
 * даром, так что этому подавителю надо подойти ближе.
 */
export const suppressRange = (s: { droneLevel: number }, payload: Payload = "jammer") =>
  payload === "demag"
    ? TRAP.range * levelBonus(s.droneLevel, TRAP.perLevel) * SUPPRESS.demagShare
    : GUN.range * levelBonus(s.droneLevel, GUN.perLevel);

/**
 * Круг, по которому подавитель ходит над жертвой. Держим его внутри
 * собственного радиуса: вылетев за него, дрон перестал бы глушить то, ради
 * чего прилетел, — а заметно это только по тому, что установка вдруг ожила.
 */
function loiterRing(s: GameState, payload: Payload) {
  const reach = suppressRange(s, payload);
  return {
    orbit: Math.min(SUPPRESS.orbit, reach * SUPPRESS.orbitShare),
    jitter: Math.min(SUPPRESS.orbitJitter, reach * SUPPRESS.orbitJitterShare),
  };
}

/**
 * Сетка блоками по полю: и огнетушителю, и подавителю нужно «что есть
 * рядом», а перебирать ради этого всё подряд — квадрат. Блок в восемь
 * клеток подобран под самые дальние радиусы: их круг накрывает считанные
 * блоки, а внутри блока проверка остаётся точной, так что ответ тот же,
 * что и у полного перебора.
 */
const BLOCK = 8;
const BLOCKS = Math.ceil(GRID / BLOCK);
const blockKey = (x: number, y: number) => ((y / BLOCK) | 0) * BLOCKS + ((x / BLOCK) | 0);


/**
 * Границы блоков, которые задевает круг радиуса r вокруг точки. Отдаём
 * четыре числа, а не список: обход идёт в горячих циклах по сотням раз за
 * кадр, и массив на каждый вызов давал бы мусора больше, чем экономил.
 */
const lo = (v: number, r: number) => Math.max(0, ((v - r) / BLOCK) | 0);
const hi = (v: number, r: number) => Math.min(BLOCKS - 1, ((v + r) / BLOCK) | 0);

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
    switch (edge) {
      case 0:
        x = along;
        y = -3 + off;
        break;
      case 1:
        x = along;
        y = GRID + 3 + off;
        break;
      case 2:
        x = -3 + off;
        y = along;
        break;
      default:
        x = GRID + 3 + off;
        y = along;
        break;
    }
  }

  s.drones.push({
    vx: 0,
    vy: 0,
    id: s.nextId++,
    x,
    y,
    tx: (ti % GRID) + 0.5,
    ty: ((ti / GRID) | 0) + 0.5,
    ti,
    wob: s.rnd() * Math.PI * 2,
    hit: false,
    armor: (t.payload ?? "plain") === "armor" ? ARMOR.extraHits : 0,
    dented: false,
    fired: false,
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

/**
 * Род установки. Ракетница числится по зенитному ведомству: глушилка
 * пушек накрывает и её — обе стреляют по одной и той же радарной картинке.
 */
type GunClass = "gun" | "spray" | "trap" | "balloon";
// У пусковой шаров свой род: её не глушит ни одна начинка.
const gunClass = (g: Gun): GunClass =>
  g.balloon ? "balloon" : g.trap ? "trap" : g.spray ? "spray" : "gun";

/**
 * Кого глушит эта начинка. Раньше здесь был булев ответ «зенитки или
 * огнетушители»; с третьим подавителем ветка кончилась, и ответом стал род.
 */
const HUNTS: Partial<Record<Payload, GunClass>> = {
  jammer: "gun",
  foamer: "spray",
  demag: "trap",
};
function prey(payload: Payload): GunClass | null {
  return HUNTS[payload] ?? null;
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
      if (!g.alive || gunClass(g) !== hunts) continue;
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
  s.booms.push({ x: d.tx, y: d.ty, t: 0, r: 2.5 * PAYLOAD[d.payload].blast });
  // Взрывчатка забирает не одну клетку, а крест вокруг неё: радиус меряем
  // по кратчайшему пути, а не по квадрату, — при единице это цель и четыре
  // прилегающие, ровно пять.
  const ring = PAYLOAD[d.payload].ring;
  if (ring > 0) {
    const cx = d.ti % GRID;
    const cy = (d.ti / GRID) | 0;
    for (let y = cy - ring; y <= cy + ring; y++) {
      for (let x = cx - ring; x <= cx + ring; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) > ring) continue;
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
  const reach = suppressRange(s, d.payload);
  const r2 = reach * reach;
  // По блокам, а не по всему складу: на пяти сотнях подавителей против
  // четырёх сотен установок полный перебор — двести тысяч сравнений за кадр.
  const bx1 = hi(d.x, reach);
  const by1 = hi(d.y, reach);
  for (let by = lo(d.y, reach); by <= by1; by++) {
    for (let bx = lo(d.x, reach); bx <= bx1; bx++) {
      const here = s.gunBlocks.get(by * BLOCKS + bx);
      if (!here) continue;
      for (const g of here) {
        if (!g.alive || gunClass(g) !== hunts) continue;
        const dx = g.cx + 0.5 - d.x;
        const dy = g.cy + 0.5 - d.y;
        if (dx * dx + dy * dy <= r2) g.jammed = SUPPRESS.release;
      }
    }
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
  // Жертвы не стало или кончилось топливо — падает, как и на свободном
  // облёте. Раньше он просто исчезал с карты посреди боя.
  if (!host || !host.alive || d.fuel <= 0) {
    suppressFall(s, d);
    return;
  }

  // Над жертвой — точки в широком кольце; курс к ним доворачивается носом,
  // а не ломается углом при каждой смене цели.
  const speed =
    DRONE.speed * levelBonus(s.droneLevel, DRONE.perLevel) * PAYLOAD[d.payload].speed;
  const hx = host.cx + 0.5;
  const hy = host.cy + 0.5;
  const { orbit, jitter } = loiterRing(s, d.payload);
  const dist = Math.hypot(d.tx - d.x, d.ty - d.y) || 1;
  const fromHost = Math.hypot(d.tx - hx, d.ty - hy);
  if (
    dist <= speed * dt * 2 ||
    fromHost < orbit - jitter - 0.5 ||
    fromHost > orbit + jitter + 0.5
  ) {
    const ang = s.rnd() * Math.PI * 2;
    const r = orbit + (s.rnd() * 2 - 1) * jitter;
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
function captureTraps(s: GameState, dt: number) {
  // Глушение стекает и у магнитов — так же, как у стреляющих установок:
  // подавителя сбили, и через SUPPRESS.release ловушка снова держит.
  for (const g of s.guns) {
    if (g.trap && g.jammed > 0) g.jammed = Math.max(0, g.jammed - dt);
  }
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
      // Размагниченная ловушка не хватает: её собственный радиус на это
      // время как будто исчез.
      if (!g.alive || !g.trap || g.jammed > 0) continue;
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
  // Защищать больше нечего — остаток роя не поднимаем. Иначе бой тянулся бы
  // ещё полминуты, пока расписание не кончится, а на карте бы ничего не
  // происходило: дроны без целой клетки исчезают в тот же кадр. В счёт они
  // идут прорвавшимися — налёт своего добился.
  if (s.baseOk <= 0) {
    s.result.leaked += s.plan.length - s.planAt;
    s.planAt = s.plan.length;
    return;
  }
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

    // Пробитая броня дымит, но дрон летит дальше своим курсом. Клубы
    // ровные, без жребия: жребий боя на картинку не тратим.
    if (d.dented && !d.hit) {
      d.smokeT -= dt;
      if (d.smokeT <= 0) {
        d.smokeT = ARMOR.smokeEvery;
        s.puffs.push({ x: d.x, y: d.y, t: 0, r: ARMOR.smokeSize, life: ARMOR.smokeLife });
      }
    }

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
        host.jammed > 0 ||
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
      // Целого не осталось — падает на пепелище, а не тает в воздухе.
      if (ti < 0) {
        suppressFall(s, d);
        continue;
      }
      d.ti = ti;
      d.tx = (ti % GRID) + 0.5;
      d.ty = ((ti / GRID) | 0) + 0.5;
    }
    const step =
      DRONE.speed * levelBonus(s.droneLevel, DRONE.perLevel) * PAYLOAD[d.payload].speed * dt;
    if (d.payload === "shooter" && !d.fired) shoot(s, d, step / dt);
    const px = d.x | 0;
    const py = d.y | 0;

    if (d.form) {
      // Строй: дрон держит своё место в круге и сжимает радиус. Скорость
      // делится между «внутрь» и «по кругу»: внутрь достаётся √(1−swirl²).
      // Чем круче закрутка, тем меньше остаётся на сближение, и спираль
      // ползла к складу вчетверо дольше прямого захода.
      //
      // Поэтому закрученному ходу скорость поднимаем — ровно на то, что он
      // теряет на дуге, но не выше WAVE.swirlBoost. Растёт и угловая
      // скорость: спираль и закручивается быстрее, и доходит раньше.
      // Угловая при этом и сама растёт к середине: на коротком радиусе та же
      // доля скорости даёт больший угол, и спираль к концу идёт воронкой.
      const rx = d.x - MID;
      const ry = d.y - MID;
      const r = Math.hypot(rx, ry) || 0.001;
      const tr = Math.hypot(d.tx - MID, d.ty - MID);
      if (r > tr + WAVE.peel) {
        const k = d.swirl;
        const inward = Math.sqrt(1 - k * k);
        const fast = step * Math.min(WAVE.swirlBoost, 1 / Math.max(inward, 0.05));
        const nr = r - fast * inward;
        const na = Math.atan2(ry, rx) + (fast * k) / r;
        d.x = MID + Math.cos(na) * nr;
        d.y = MID + Math.sin(na) * nr;
      } else {
        // Поравнялись с целью — строй расходится. Цель берём заново по
        // своему лучу: та, что досталась на вылете, могла уже сгореть.
        d.form = false;
        const ti = rayTarget(s, Math.atan2(ry, rx));
        if (ti < 0) {
          suppressFall(s, d);
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
        s.booms.push({ x: cx + 0.5, y: cy + 0.5, t: 0, r: 3 * PAYLOAD[d.payload].blast });
        s.drones.splice(i, 1);
        // Его никто не сбивал — он дошёл и снёс установку собой. В счёт идёт
        // прорвавшимся, иначе сбитые и прорвавшиеся не сходятся с высланными.
        s.result.leaked++;
        s.dirty = true;
      }
    }
  }

  // Свободные дроны в радиусе ловушки захватываются после движения.
  captureTraps(s, dt);
}

/** Огнетушители: льют сами, пока рядом горит и есть вода. */
function stepSprays(s: GameState, dt: number) {
  // Загорелось в радиусе — установка раскручивается и льёт восемью струями
  // звездой. Струя не гасит с ходу: клетку надо пролить, а луч упирается в
  // первый же огонь на своём пути. Отсюда и потолок: восемь очагов разом, не
  // больше, — широкий фронт огня установку обходит.
  const reach = sprayRange(s);
  const r2 = reach * reach;
  const douse = dt / SPRAY.soak;

  // Очаг ищем простым перебором, хотя это и произведение установок на
  // пожар. Сетку блоков сюда заводили и убрали: замер показал, что она
  // делает хуже. Перебор почти всегда обрывается на первом же очаге —
  // горит рядом с тем, кто тушит, — а раскладка пожара по блокам платится
  // каждый кадр целиком и независимо от того, пригодилась ли.
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
      if (dx * dx + dy * dy <= r2) {
        fireNear = true;
        break;
      }
    }
    if (fireNear) g.wet = SPRAY.hold;
    if (g.wet <= 0) continue;

    g.wet -= dt;
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
/**
 * Ближайший ещё летящий дрон к точке, не дальше reach. Этим поиском живёт
 * вся автоматика склада — и зенитки, и ракетницы, — а значит здесь же
 * отваливается невидимка: её ни одна из них не видит.
 *
 * Сбитый пулемётом дрон ещё планирует к земле, но он уже посчитан — по
 * нему не стреляют, иначе один дрон уходил бы в счёт дважды.
 */
function nearestDrone(s: GameState, x: number, y: number, reach: number) {
  let best: Drone | null = null;
  let bestD = reach * reach;
  for (const d of s.drones) {
    if (d.hit || d.payload === "stealth") continue;
    const dx = d.x - x;
    const dy = d.y - y;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

/** То, во что целится зенитка: где оно и куда летит. */
type Mover = { x: number; y: number; vx: number; vy: number };

/** Ближайшая цель зенитки: дрон или ракета стрелка. */
function nearestTarget(s: GameState, x: number, y: number, reach: number): Mover | null {
  let best: Mover | null = nearestDrone(s, x, y, reach);
  let bestD = best ? (best.x - x) ** 2 + (best.y - y) ** 2 : reach * reach;
  for (const r of s.foeRockets) {
    const dd = (r.x - x) ** 2 + (r.y - y) ** 2;
    if (dd < bestD) {
      bestD = dd;
      best = r;
    }
  }
  return best;
}

/** Доворот башни к цели за такт. Одинаков у зенитки и у ракетницы. */
function turnTurret(g: Gun, rate: number, dt: number) {
  let da = g.aim - g.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const turn = rate * dt;
  g.angle += Math.max(-turn, Math.min(turn, da));
}

function stepGuns(s: GameState, dt: number) {
  for (const g of s.guns) {
    if (!g.alive || g.spray || g.trap || g.rocket || g.balloon) continue;

    // Заглушённая зенитка не стреляет. Башню всё равно доворачиваем — по
    // шевелящемуся стволу видно, что пушка жива, просто её глушат.
    g.jammed = Math.max(0, g.jammed - dt);

    const tempo = gunTempo(s);
    g.cd -= dt;
    const gx = g.cx + 0.5;
    const gy = g.cy + 0.5;

    // Наводимся загодя: за GUN.aimAhead до конца перезарядки ищем цель и
    // доворачиваем ствол на точку упреждения. Подавителя зенитка берёт на
    // общих основаниях; заглушённая — цель не ищет, башня просто шевелится.
    const ready = g.cd <= 0 && g.jammed <= 0;
    let best: Mover | null = null;
    if (g.jammed <= 0 && g.cd <= GUN.aimAhead) {
      best = nearestTarget(s, gx, gy, gunRange(s) + 0.5);
      // Снаряд неуправляемый — целимся туда, где дрон окажется к встрече.
      if (best) g.aim = leadAngle(gx, gy, best, missileSpeed(s));
    }
    turnTurret(g, GUN.turretTurn * tempo, dt);
    if (!ready || !best) continue;

    // Стреляем, только когда ствол довёрнут: башня медленная, и цель,
    // зашедшая сбоку, успевает пройти часть пути, пока пушка поворачивается.
    let off = g.aim - g.angle;
    while (off > Math.PI) off -= Math.PI * 2;
    while (off < -Math.PI) off += Math.PI * 2;
    if (Math.abs(off) > GUN.aimTolerance) continue;

    // снаряд идёт туда, куда смотрит ствол, а не точно в расчётную точку
    s.missiles.push({
      id: s.nextId++,
      x: gx,
      y: gy,
      dx: Math.cos(g.angle),
      dy: Math.sin(g.angle),
      life: MISSILE.life,
    });
    g.cd = GUN.cooldown / tempo;
  }
}

/** Скорость снаряда зенитки с её прокачкой. */
const missileSpeed = (s: GameState) => MISSILE.speed * levelBonus(s.gunLevel, GUN.perLevel);

/**
 * Куда стрелять, чтобы снаряд скорости speed встретил дрона, если тот
 * полетит как летит. Решаем |p + v·t| = speed·t и берём самое раннее t > 0.
 * Догнать нельзя — стреляем, куда он сейчас.
 */
function leadAngle(gx: number, gy: number, d: Mover, speed: number) {
  const px = d.x - gx;
  const py = d.y - gy;
  const a = d.vx * d.vx + d.vy * d.vy - speed * speed;
  const b = 2 * (px * d.vx + py * d.vy);
  const c = px * px + py * py;
  let t = -1;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      const t1 = (-b - root) / (2 * a);
      const t2 = (-b + root) / (2 * a);
      t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    }
  }
  if (!(t > 0)) return Math.atan2(py, px);
  return Math.atan2(py + d.vy * t, px + d.vx * t);
}

/**
 * Снаряды зениток: летят прямо, стареют, уходят за край. Управления нет:
 * сбивают того, в кого попали, а не того, в кого целились.
 */
function stepMissiles(s: GameState, dt: number) {
  for (let i = s.missiles.length - 1; i >= 0; i--) {
    const m = s.missiles[i];
    m.life -= dt;
    if (m.life <= 0) {
      s.missiles.splice(i, 1);
      continue;
    }
    if (!s.drones.length) {
      s.missiles.splice(i, 1);
      continue;
    }
    const speed = missileSpeed(s);
    m.x += m.dx * speed * dt;
    m.y += m.dy * speed * dt;
    // Попал в того, кто оказался на пути. Сбитый пулемётом дрон ещё
    // планирует к земле, но он уже посчитан — снаряд проходит сквозь, иначе
    // один дрон уходил бы в счёт дважды.
    const hit = MISSILE.hitRadius * MISSILE.hitRadius;
    const at = s.drones.findIndex(
      (d) => !d.hit && (d.x - m.x) * (d.x - m.x) + (d.y - m.y) * (d.y - m.y) < hit
    );
    const foe = s.foeRockets.findIndex(
      (r) => (r.x - m.x) * (r.x - m.x) + (r.y - m.y) * (r.y - m.y) < hit
    );
    if (foe >= 0) {
      const r = s.foeRockets[foe];
      s.booms.push({ x: r.x, y: r.y, t: 0, r: 1.2 });
      s.foeRockets.splice(foe, 1);
      s.missiles.splice(i, 1);
      s.result.foeRocketsDown++;
      continue;
    }
    if (at >= 0) {
      const t = s.drones[at];
      s.missiles.splice(i, 1);
      // Броня держит снаряд: искра, дым — и дрон летит дальше.
      if (t.armor > 0) {
        t.armor--;
        t.dented = true;
        t.smokeT = 0;
        s.booms.push({ x: t.x, y: t.y, t: 0, r: 0.6 });
        continue;
      }
      s.booms.push({ x: t.x, y: t.y, t: 0, r: 2 * PAYLOAD[t.payload].blast });
      s.drones.splice(at, 1);
      s.result.killedByGuns++;
      continue;
    }
    if (m.x < -6 || m.y < -6 || m.x > GRID + 6 || m.y > GRID + 6) {
      s.missiles.splice(i, 1);
    }
  }
}

/**
 * Ракетницы и их ракеты. Пуск неточный, и вторую ракету ракетница не
 * выпустит, пока первая в воздухе. Зато ракета быстрее снаряда зенитки и
 * сама доворачивает на свою цель — там, где снаряд зенитки летит прямо и
 * мажет по тому, кто сменил курс.
 */
function stepRockets(s: GameState, dt: number, dronesById: Map<number, Drone>) {
  // Кто уже держит ракету в воздухе. Считаем разом: перебирать ракеты
  // заново для каждой установки незачем, их там единицы.
  const busy = new Set<number>();
  for (const r of s.rockets) busy.add(r.from);

  const tempo = rocketTempo(s);
  for (const g of s.guns) {
    if (!g.alive || !g.rocket) continue;
    g.jammed = Math.max(0, g.jammed - dt);
    turnTurret(g, ROCKET.turretTurn * tempo, dt);

    g.cd -= dt;
    if (g.cd > 0 || g.jammed > 0 || busy.has(g.id)) continue;
    const gx = g.cx + 0.5;
    const gy = g.cy + 0.5;
    const best = nearestDrone(s, gx, gy, rocketRange(s) + 0.5);
    if (!best) continue;

    const a = Math.atan2(best.y - gy, best.x - gx);
    g.aim = a;
    // Уходит мимо: точность ракетнице заменяет самонаведение.
    const off = (s.rnd() * 2 - 1) * ROCKET.spread;
    s.rockets.push({
      id: s.nextId++,
      from: g.id,
      target: best.id,
      x: gx,
      y: gy,
      dx: Math.cos(a + off),
      dy: Math.sin(a + off),
      life: ROCKET.life,
      smokeT: 0,
    });
    busy.add(g.id);
    g.cd = ROCKET.cooldown / tempo;
  }

  const speed = ROCKET.speed * levelBonus(s.rocketLevel, ROCKET.perLevel);
  const hit = ROCKET.hitRadius * ROCKET.hitRadius;
  for (let i = s.rockets.length - 1; i >= 0; i--) {
    const m = s.rockets[i];
    m.life -= dt;
    if (m.life <= 0) {
      s.rockets.splice(i, 1);
      continue;
    }

    // Роя не стало — ракете не за кем гнаться, и держать ею конец боя
    // незачем: догорает на месте.
    if (!s.drones.length) {
      s.rockets.splice(i, 1);
      continue;
    }
    // Доворот только на свою цель. Сбили её, упала или пропала — ракета
    // больше не рулит: летит как летела и уходит с поля, по чужим не бьёт.
    const found = dronesById.get(m.target);
    const t = found && !found.hit ? found : undefined;
    if (t) {
      const a = Math.atan2(t.y - m.y, t.x - m.x);
      const ca = Math.atan2(m.dy, m.dx);
      let da = a - ca;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const turn = Math.max(-ROCKET.turn * dt, Math.min(ROCKET.turn * dt, da));
      m.dx = Math.cos(ca + turn);
      m.dy = Math.sin(ca + turn);
    }

    m.x += m.dx * speed * dt;
    m.y += m.dy * speed * dt;

    // След: клубы сыплются из сопла и тают в общей куче дыма. Шаг подобран
    // так, чтобы за время жизни клуба их набиралось около семи.
    m.smokeT -= dt;
    if (m.smokeT <= 0) {
      m.smokeT = ROCKET.smokeEvery;
      s.puffs.push({
        x: m.x - m.dx * 0.4,
        y: m.y - m.dy * 0.4,
        t: 0,
        r: ROCKET.smokeSize,
        life: ROCKET.smokeLife,
        light: true,
      });
    }

    if (t && (t.x - m.x) * (t.x - m.x) + (t.y - m.y) * (t.y - m.y) < hit) {
      s.booms.push({ x: t.x, y: t.y, t: 0, r: 2 * PAYLOAD[t.payload].blast });
      const at = s.drones.indexOf(t);
      if (at >= 0) s.drones.splice(at, 1);
      s.rockets.splice(i, 1);
      s.result.killedByGuns++;
      continue;
    }
    if (m.x < -6 || m.y < -6 || m.x > GRID + 6 || m.y > GRID + 6) {
      s.rockets.splice(i, 1);
    }
  }
}

/**
 * Шары: ползут, лопаются и роняют всё, что в них влетело.
 *
 * Проверки идут через сетку по клеткам, а не перебором: шаров бывает
 * несколько сотен, дронов — до пятисот, и квадрат из них складывается в
 * четверть миллиона сравнений за кадр.
 */
function stepBalloons(s: GameState, dt: number) {
  if (!s.balloons.length) return;

  for (const b of s.balloons) {
    if (b.wait > 0) {
      b.wait -= dt;
      continue;
    }
    if (b.fly) {
      // К своей точке — быстро, у самой точки плавно гасит ход, а там уже
      // дрейфует, как все.
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.min(dist, Math.min(BALLOON.flySpeed, 0.4 + dist * BALLOON.flyEase) * dt);
      if (dist < 0.05 || step >= dist) {
        b.x = b.tx;
        b.y = b.ty;
        b.fly = false;
      } else {
        b.x += (dx / dist) * step;
        b.y += (dy / dist) * step;
      }
      continue;
    }
    b.next -= dt;
    if (b.next <= 0) {
      b.next = BALLOON.rethink * (0.5 + s.rnd());
      b.want = s.rnd() * Math.PI * 2;
    }
    let da = b.want - b.ang;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const turn = BALLOON.turn * dt;
    b.ang += Math.max(-turn, Math.min(turn, da));
    b.x += Math.cos(b.ang) * BALLOON.speed * dt;
    b.y += Math.sin(b.ang) * BALLOON.speed * dt;
    // У края разворачиваем: улетевший за карту шар просто пропал бы даром.
    if (b.x < 0 || b.x > GRID || b.y < 0 || b.y > GRID) {
      b.x = Math.max(0, Math.min(GRID, b.x));
      b.y = Math.max(0, Math.min(GRID, b.y));
      b.ang += Math.PI;
      b.want = b.ang;
      b.next = BALLOON.rethink;
    }
  }

  // Обдув. Считаем до столкновений: сдутый шар должен успеть уйти с
  // дороги, иначе дрон с вентилятором подрывался бы на нём сам.
  const fans = s.drones.filter(
    (d) => !d.hit && !d.heldBy && d.payload === "blower"
  );
  if (fans.length) {
    const far = BLOW.range * BLOW.range;
    for (const b of s.balloons) {
      for (const d of fans) {
        const dx = b.x - d.x;
        const dy = b.y - d.y;
        const dd = dx * dx + dy * dy;
        if (dd > far) continue;
        const len = Math.sqrt(dd);
        // Совсем в упор направления нет — толкаем по курсу дрона.
        const ux = len > 0.001 ? dx / len : d.hx || 1;
        const uy = len > 0.001 ? dy / len : d.hy;
        const k = BLOW.edge + (1 - BLOW.edge) * (1 - len / BLOW.range);
        b.x += ux * BLOW.speed * k * dt;
        b.y += uy * BLOW.speed * k * dt;
      }
      b.x = Math.max(0, Math.min(GRID, b.x));
      b.y = Math.max(0, Math.min(GRID, b.y));
    }
  }

  // Сетка по клеткам: шар размером с клетку, так что достаточно заглянуть
  // в свою клетку и восемь соседних.
  const at = new Map<number, Balloon[]>();
  for (const b of s.balloons) {
    if (b.wait > 0) continue; // ещё не выпущен
    const key = ((b.y | 0) << 8) | (b.x | 0);
    const cellList = at.get(key);
    if (cellList) cellList.push(b);
    else at.set(key, [b]);
  }
  const popped = new Set<number>();

  /**
   * Первый шар, которого коснулось тело радиуса own. Лопнувшие в этом же
   * кадре не в счёт. Окно берём в две клетки: сумма радиусов больше клетки,
   * и соседей через одного проверять всё равно придётся.
   */
  const hitAt = (x: number, y: number, own: number) => {
    const reach = BALLOON.radius + own;
    const r2 = reach * reach;
    const cx = x | 0;
    const cy = y | 0;
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const list = at.get(((cy + oy) << 8) | (cx + ox));
        if (!list) continue;
        for (const b of list) {
          if (popped.has(b.id)) continue;
          const dx = b.x - x;
          const dy = b.y - y;
          if (dx * dx + dy * dy <= r2) return b;
        }
      }
    }
    return null;
  };

  // Дрон в шаре гибнет вместе с ним. Ни пожара, ни выбоины: склад под
  // этим местом не страдает вовсе — в том и вся прелесть заграждения.
  for (let i = s.drones.length - 1; i >= 0; i--) {
    const d = s.drones[i];
    if (d.hit || d.heldBy) continue;
    const b = hitAt(d.x, d.y, BALLOON.droneRadius);
    if (!b) continue;
    popped.add(b.id);
    s.booms.push({ x: d.x, y: d.y, t: 0, r: 1.2 * PAYLOAD[d.payload].blast });
    s.drones.splice(i, 1);
    s.result.killedByBalloons++;
  }

  // Снаряд зенитки и ракета шара не различают: подвернулся — лопнул, а
  // дрон за ним уцелел. Поэтому сплошное заграждение вредит и хозяину.
  for (let i = s.missiles.length - 1; i >= 0; i--) {
    const m = s.missiles[i];
    const b = hitAt(m.x, m.y, 0);
    if (!b) continue;
    popped.add(b.id);
    s.booms.push({ x: m.x, y: m.y, t: 0, r: 1 });
    s.missiles.splice(i, 1);
  }
  for (let i = s.rockets.length - 1; i >= 0; i--) {
    const m = s.rockets[i];
    const b = hitAt(m.x, m.y, 0);
    if (!b) continue;
    popped.add(b.id);
    s.booms.push({ x: m.x, y: m.y, t: 0, r: 1 });
    s.rockets.splice(i, 1);
  }
  for (let i = s.foeRockets.length - 1; i >= 0; i--) {
    const r = s.foeRockets[i];
    const b = hitAt(r.x, r.y, 0);
    if (!b) continue;
    popped.add(b.id);
    s.booms.push({ x: r.x, y: r.y, t: 0, r: 1 });
    s.foeRockets.splice(i, 1);
    s.result.foeRocketsDown++;
  }

  if (popped.size) {
    s.balloons = s.balloons.filter((b) => !popped.has(b.id));
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

/**
 * Бой кончился, а на поле ещё догорают взрывы и тает дым: пока итог не
 * закрыл поле, пусть доигрывают. Только следы — расчёт боя уже закончен.
 */
export function afterglow(s: GameState, dt: number) {
  if (s.phase !== "playing") stepEffects(s, dt);
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
    const p = s.puffs[i];
    p.t += dt;
    if (p.t > (p.life ?? FX.smokeLife)) s.puffs.splice(i, 1);
  }
}

/**
 * Шаг боя. Фазы идут строго в этом порядке, и порядок значим: подавители
 * глушат установки раньше, чем те стреляют; шары проверяются после того,
 * как выстрел уже в воздухе, — иначе снаряд пролетал бы сквозь них целый
 * кадр; пожар перекидывается уже после того, как рой отработал. Меняешь
 * порядок — меняешь исход боя, и повтор у нападавшего разойдётся с тем,
 * что видел защитник.
 */
export function update(s: GameState, dt: number) {
  if (s.phase !== "playing") return;
  s.time += dt;

  stepSpawns(s);
  stepHands(s, dt);
  // где был каждый дрон до шага — по этому и считаем его скорость
  const before = s.drones.map((d) => [d, d.x, d.y] as const);
  stepDrones(s, dt, s.gunsById);
  for (const [d, x, y] of before) {
    d.vx = (d.x - x) / dt;
    d.vy = (d.y - y) / dt;
  }
  stepSprays(s, dt);
  stepGuns(s, dt);

  // Индекс роя собираем здесь, после того как рой отработал: до этого в нём
  // были бы и те, кого в этом же кадре сбили. Одна карта на такт — раньше
  // её строила себе каждая фаза, которой нужен дрон по номеру.
  const dronesById = new Map<number, Drone>();
  for (const d of s.drones) dronesById.set(d.id, d);
  stepMissiles(s, dt);
  stepRockets(s, dt, dronesById);
  stepFoeRockets(s, dt);
  stepLaunchers(s);
  stepBalloons(s, dt);
  stepFire(s, dt);
  stepEffects(s, dt);

  // --- конец боя ---
  // Кончается он ровно тогда, когда смотреть больше не на что: расписание
  // отработано, в воздухе пусто и нигде не горит. Падение склада бой само
  // по себе не обрывает — раньше обрывало, и защитник получал экран итогов
  // поверх горящего склада и подлетающего роя. Оно лишь решает, чем бой
  // кончился: осталась хоть одна целая клетка — отбились.
  const quiet =
    s.planAt >= s.plan.length &&
    s.drones.length === 0 &&
    s.fire.size === 0 &&
    s.rockets.length === 0 &&
    s.foeRockets.length === 0 &&
    s.missiles.length === 0;
  if (quiet) s.phase = s.baseOk > 0 ? "won" : "lost";
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
        g.balloon
          ? { cx: g.cx, cy: g.cy, kind: "balloon" as const }
          : g.trap
          ? { cx: g.cx, cy: g.cy, kind: "trap" as const }
          : g.spray
            ? { cx: g.cx, cy: g.cy, kind: "spray" as const }
            : g.rocket
              ? { cx: g.cx, cy: g.cy, kind: "rocket" as const }
              : { cx: g.cx, cy: g.cy }
      ),
    depots: s.depots.map((d) => ({ ...d })),
    result: s.result,
  };
}
