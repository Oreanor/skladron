// Атака: заказ и превращение его в расписание вылетов.

import { GRID } from "./base";
import { levelBonus } from "./economy";
import type { BattleResult } from "./engine";
import { DRONE, GUN, PAYLOAD, RAID, WAVE } from "./tuning";

/**
 * Что дрон несёт. Простой долетает и взрывается; тяжёлый берёт двойную
 * взрывчатку и поджигает кольцо вокруг цели, но тащится медленнее; подавители
 * не взрываются вовсе — кружат над обороной и глушат её, пока не кончится
 * топливо. Цифры у всех в PAYLOAD.
 */
export type Payload = "plain" | "heavy" | "jammer" | "foamer";
export const PAYLOADS: Payload[] = ["plain", "heavy", "jammer", "foamer"];

/** Группа внутри волны: сколько дронов и с какой начинкой. */
export interface DroneGroup {
  payload: Payload;
  n: number;
}

/** Одна волна налёта: своя форма, своя сторона захода и свой состав. */
export interface WavePlan {
  pattern: Pattern;
  /** Сторона: 0 верх, 1 низ, 2 слева, 3 справа. Важна только рою и шеренгам. */
  direction: number;
  groups: DroneGroup[];
}

export const waveSize = (w: WavePlan) =>
  w.groups.reduce((n, g) => n + Math.max(0, g.n), 0);

export const raidTotal = (waves: WavePlan[]) =>
  waves.reduce((n, w) => n + waveSize(w), 0);

/**
 * Надбавка за начинку, в кредитах. Со склада снимаются обычные дроны, а
 * доплата за начинку списывается деньгами в момент вылета — поэтому цена
 * зависит от того, во что дрон обходится при нынешнем уровне.
 */
export const payloadCost = (unit: number, waves: WavePlan[]) =>
  waves.reduce(
    (sum, w) =>
      sum +
      w.groups.reduce(
        (s, g) => s + Math.floor(unit * PAYLOAD[g.payload].cost) * Math.max(0, g.n),
        0
      ),
    0
  );

export type Pattern =
  | "swarm"
  | "lines"
  | "random"
  | "drip"
  | "rings"
  | "spiral"
  | "flower"
  | "sweep";

/** Сколько прорывов игрок ещё успевает затушить на складе такого размера. */
function leaksOk(intact: number) {
  return Math.min(RAID.leaksCap, RAID.leaksBase + intact * RAID.leaksPerCell);
}

/** Уровни обороны, от которых зависит, сколько рой встретит сопротивления. */
export interface DefenceLevels {
  guns?: number;
  mg?: number;
  water?: number;
}

/**
 * Размер налёта под конкретную оборону: сколько пушек, какой они прокачки,
 * какой площади склад и насколько игрок хорош руками. Множитель сложности
 * гуляет от 0,75 до 1,35 — бывает и полегче, и позлее, но неподъёмного
 * не приходит.
 */
export function raidSize(
  guns: number,
  intact: number,
  difficulty = 1,
  levels: DefenceLevels = {}
) {
  // прокачанная пушка успевает больше: и достаёт дальше, и снаряд быстрее
  const gunPower = guns * RAID.dronesPerGun * levelBonus(levels.guns ?? 1, GUN.perLevel);
  // руки тоже растут: меткость очереди и ширина струи
  const hands = Math.min(
    RAID.maxHandsShare,
    RAID.bareHandsShare +
      RAID.mgSharePerLevel * ((levels.mg ?? 1) - 1) +
      RAID.waterSharePerLevel * ((levels.water ?? 1) - 1)
  );
  const survivable = leaksOk(intact) + gunPower + intact * RAID.perCell;
  return Math.max(
    RAID.min,
    Math.min(RAID.max, Math.round((survivable / (1 - hands)) * difficulty))
  );
}

/** Случайная сложность очередного налёта. */
export function raidDifficulty() {
  return RAID.difficultyMin + Math.random() * RAID.difficultySpan;
}

export interface AttackOrder {
  id: string;
  from: string; // кто прислал
  createdAt: number;
  /** Когда атака встала первой в очереди и пошли часы. Пока null — ждёт. */
  activatedAt?: number | null;
  /** Всего дронов в налёте — сумма по всем волнам. */
  drones: number;
  /**
   * Волны по порядку. Старые налёты писались одной формой на весь рой, у них
   * этого поля нет — их читает orderWaves как одну волну простых дронов.
   */
  waves?: WavePlan[];
  /** Форма и сторона первой волны. Оставлены ради старых записей и подписей. */
  pattern: Pattern;
  direction: number; // 0 верх, 1 низ, 2 слева, 3 справа — для lines
  seed: number;
  /** Уровень дронов нападающего на момент вылета. */
  droneLevel?: number;
  /** Почта нападавшего: по ней он попадает в список соперников. */
  fromEmail?: string;
  remote?: boolean; // настоящий налёт из серверной очереди, а не локальный бот
}

/** Строка журнала: что и когда мы посылали и есть ли к этому повтор. */
export interface RaidLog {
  id: string;
  /** Кем ты был в этом бою. */
  side: "attack" | "defence";
  /** Вторая сторона: чей склад жгли или кто жёг твой. */
  foe: string;
  /** Когда отгремел бой, а у неотыгранных — когда рой вылетел. */
  at: number;
  /** Налёт ещё в пути: защитник до него не дошёл. */
  pending: boolean;
  drones: number;
  burned: number;
  loot: number;
  destroyed: boolean;
  hasReplay: boolean;
}

/** Итог исходящего налёта, который приходит только после боя защитника. */
export interface AttackReport {
  id: string;
  target: string;
  resolvedAt: number;
  result: BattleResult;
  loot: number;
  destroyed: boolean;
  /** Всё нужное, чтобы отыграть бой заново глазами нападавшего. */
  replay?: {
    order: AttackOrder;
    cells: string;
    guns: { cx: number; cy: number }[];
    depots: { cx: number; cy: number; n: number; kind?: string }[];
    levels: { guns?: number; mg?: number; water?: number };
    trace: string;
  };
}

/**
 * Один вылет. Заход бывает двух родов, и это главное, что различает режимы
 * налёта: либо дрон входит в кадр от края (edge/ox/oy) и сразу идёт на свою
 * клетку, либо встаёт в строй вокруг склада (ang/rad/swirl) и сжимается к
 * нему, держа круг. Строевые дроны на подлёте читаются кольцом или воронкой —
 * в этом весь смысл, ради него движок и знает про строй.
 */
export interface SpawnTicket {
  at: number; // секунда боя
  /** Заход от края кадра. Сторона: 0 верх, 1 низ, 2 слева, 3 справа. */
  edge?: number;
  ox?: number; // положение вдоль края, в клетках
  oy?: number; // отступ за кадр
  /** Заход строем: дрон сжимается к складу по радиусу, а не летит на цель. */
  form?: boolean;
  /** Место в строю — угол вокруг середины поля, радианы. */
  ang?: number;
  /** С какого радиуса начинает сжиматься, в клетках от середины поля. */
  rad?: number;
  /**
   * Какая доля скорости уходит в закрутку вокруг склада, от 0 до 1; знак
   * задаёт сторону вращения. Ноль — строй идёт строго внутрь; много —
   * дрон ввинчивается по спирали.
   */
  swirl?: number;
  /** Что дрон несёт. Без начинки — обычный. */
  payload?: Payload;
}

export const PATTERNS: Pattern[] = [
  "swarm",
  "lines",
  "random",
  "drip",
  "rings",
  "spiral",
  "flower",
  "sweep",
];

const TAU = Math.PI * 2;

/** Стороны в том же порядке, что и direction: 0 верх, 1 низ, 2 слева, 3 справа. */
export const EDGES = [0, 1, 2, 3] as const;

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Волны заказа. Старые налёты писались одной формой на весь рой — читаем их
 * как одну волну простых дронов, иначе повторы тех боёв перестали бы играться.
 */
export function orderWaves(order: AttackOrder): WavePlan[] {
  if (order.waves?.length) return order.waves;
  return [
    {
      pattern: order.pattern,
      direction: order.direction,
      groups: [{ payload: "plain", n: order.drones }],
    },
  ];
}

/**
 * Раскладывает начинки по вылетам волны. Группы идут не подряд, а вперемешку
 * в своей пропорции: сложи их подряд — и на кольце подавители сбились бы в
 * одну дугу вместо того, чтобы заходить вместе со всеми.
 *
 * Делёж по наибольшему остатку: каждой группе каждый шаг капает её доля, и
 * дрона отдаёт та, у которой накопилось больше.
 */
function assignPayloads(tickets: SpawnTicket[], groups: DroneGroup[]) {
  const live = groups.filter((g) => g.n > 0);
  if (live.length <= 1) {
    const only = live[0]?.payload ?? "plain";
    for (const t of tickets) t.payload = only;
    return;
  }
  const total = live.reduce((sum, g) => sum + g.n, 0);
  const left = live.map((g) => g.n);
  const credit = live.map(() => 0);
  for (const ticket of tickets) {
    let best = -1;
    for (let k = 0; k < live.length; k++) {
      if (!left[k]) continue;
      credit[k] += live[k].n / total;
      if (best < 0 || credit[k] > credit[best]) best = k;
    }
    if (best < 0) {
      ticket.payload = "plain";
      continue;
    }
    credit[best] -= 1;
    left[best]--;
    ticket.payload = live[best].payload;
  }
}

/**
 * Поднимает всю волну в воздух одновременно, не стирая её рисунок.
 *
 * Раньше кольца, ряды и точки спирали появлялись с задержкой. Теперь эта
 * задержка превращается в стартовую глубину: более поздняя часть рисунка
 * сразу находится дальше по той же траектории. Поэтому timestamp у всей
 * порции один, но шеренги, кольца и «капель» не схлопываются в одну точку.
 * Возвращает прежнее время последнего вылета — по нему по-прежнему отделяем
 * следующую волну, чтобы две самостоятельные порции не слипались.
 */
function launchTogether(tickets: SpawnTicket[], start: number, droneLevel: number) {
  let last = start;
  for (const ticket of tickets) {
    last = Math.max(last, ticket.at);
    const delay = Math.max(0, ticket.at - start);
    if (delay > 0) {
      const payload = ticket.payload ?? "plain";
      const depth =
        delay *
        DRONE.speed *
        levelBonus(droneLevel, DRONE.perLevel) *
        PAYLOAD[payload].speed;
      if (ticket.form) {
        ticket.rad = (ticket.rad ?? WAVE.formRadius) + depth;
      } else {
        const edge = ticket.edge ?? 0;
        const outward = edge === 0 || edge === 2 ? -1 : 1;
        ticket.oy = (ticket.oy ?? 0) + outward * depth;
      }
    }
    ticket.at = start;
  }
  return last;
}

/**
 * Расписание вылетов: детерминировано по seed, чтобы бой был воспроизводим.
 * Все дроны одной волны стартуют в один момент. Следующая волна — отдельная
 * порция дронов, которая стартует после общей паузы.
 */
export function buildPlan(order: AttackOrder): SpawnTicket[] {
  const rnd = mulberry32(order.seed);
  const plan: SpawnTicket[] = [];
  // тип пишем явно: WAVE.start литеральный из-за as const
  let at: number = WAVE.start;
  for (const wave of orderWaves(order)) {
    const size = waveSize(wave);
    if (size <= 0) continue;
    const tickets = waveTickets(wave.pattern, wave.direction, size, rnd, at);
    if (!tickets.length) continue;
    assignPayloads(tickets, wave.groups);
    // Паттерн задаёт строй и траектории, но не дробит одну волну на скрытые
    // подволнушки. Даже у колец, спирали и «капели» вся порция уже в воздухе.
    const last = launchTogether(tickets, at, order.droneLevel ?? 1);
    plan.push(...tickets);
    at = last + WAVE.betweenWaves;
  }
  return plan.sort((a, b) => a.at - b.at);
}

/** Вылеты одной волны: только форма, без начинок и без чужих волн. */
function waveTickets(
  pattern: Pattern,
  direction: number,
  n: number,
  rnd: () => number,
  start: number
): SpawnTicket[] {
  const plan: SpawnTicket[] = [];

  const push = (at: number, edge: number, spread: number) => {
    plan.push({
      at,
      edge,
      ox: rnd() * (GRID + spread * 2) - spread,
      oy: (rnd() - 0.5) * WAVE.edgeDepth,
    });
  };

  if (pattern === "swarm") {
    // всё сразу: пушки просто не успевают перезаряжаться
    for (let i = 0; i < n; i++) {
      push(start + rnd() * WAVE.swarm.jitter, direction, WAVE.swarm.spread);
    }
  } else if (pattern === "lines" || pattern === "random") {
    // Чем крупнее рой, тем шире шеренга и короче пауза между ними: три сотни
    // дронов не должны заходить теми же восьмёрками, что и полтора десятка.
    const rowSize = Math.min(
      WAVE.lines.rowMax,
      WAVE.lines.rowBase + Math.floor(rnd() * WAVE.lines.rowSpread) + Math.floor(n * WAVE.lines.rowPerDrone)
    );
    const gap = Math.max(WAVE.lines.gapMin, WAVE.lines.gap - n * WAVE.lines.gapPerDrone);
    let t = start;
    let left = n;
    while (left > 0) {
      const size = Math.min(left, rowSize);
      const edge = pattern === "lines" ? direction : Math.floor(rnd() * 4);
      // Шеренга — это шеренга: дроны встают ровно по фронту и входят разом.
      // Раньше место вдоль края разыгрывалось случайно, и «линии» на подлёте
      // ничем не отличались от роя.
      for (let i = 0; i < size; i++) {
        plan.push({
          at: t,
          edge,
          ox: ((i + 0.5) / size) * GRID,
          oy: (rnd() - 0.5) * WAVE.lines.depth,
        });
      }
      left -= size;
      t += gap;
    }
  } else if (pattern === "rings") {
    // Кольцо: рой встаёт по кругу на шестнадцати лучах и сжимается к складу
    // разом, не ломая строя, — на подлёте это именно смыкающееся кольцо, а не
    // рой, прилетевший со всех сторон. Колец несколько, каждое следующее
    // приходит быстрее; соседние повёрнуты на поллуча и крутятся врозь,
    // чтобы не ложиться след в след.
    const rings = WAVE.rings.min + Math.floor(rnd() * (WAVE.rings.max - WAVE.rings.min + 1));
    const per = Math.ceil(n / rings);
    let t = start;
    let left = n;
    for (let i = 0; i < rings && left > 0; i++) {
      const size = Math.min(left, per);
      const phase = (i % 2) * 0.5;
      const spin = i % 2 ? 1 : -1;
      for (let j = 0; j < size; j++) {
        const slot = j % WAVE.ringSlots;
        const row = (j / WAVE.ringSlots) | 0;
        plan.push({
          at: t,
          form: true,
          ang: ((slot + phase) / WAVE.ringSlots) * TAU,
          rad: WAVE.formRadius + row * WAVE.ringRow,
          swirl: spin * WAVE.rings.swirl,
        });
      }
      left -= size;
      const k = i / Math.max(1, rings - 1);
      t += WAVE.rings.gapFirst - k * (WAVE.rings.gapFirst - WAVE.rings.gapLast);
    }
  } else if (pattern === "spiral") {
    // Спираль: несколько рукавов бьют непрерывно, точка вылета едет по кругу,
    // и сам подлёт закручен — рой ввинчивается в склад воронкой. Чем ближе к
    // середине, тем быстрее оборот: на короткий радиус та же доля скорости
    // даёт больший угол.
    const arms =
      WAVE.spiral.armsMin + Math.floor(rnd() * (WAVE.spiral.armsMax - WAVE.spiral.armsMin + 1));
    const waves = Math.ceil(n / arms);
    const gap = Math.min(0.5, Math.max(0.05, WAVE.spiral.seconds / waves));
    const spin = rnd() < 0.5 ? 1 : -1;
    const from = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const wave = (i / arms) | 0;
      const arm = i % arms;
      plan.push({
        at: start + wave * gap,
        form: true,
        ang: from + spin * wave * WAVE.spiral.emit + (arm / arms) * TAU,
        rad: WAVE.formRadius,
        swirl: spin * WAVE.spiral.swirl,
      });
    }
  } else if (pattern === "flower") {
    // Цветок: несколько ручьёв разом, все вместе проворачиваются вокруг
    // склада, а соседние лепестки закручены в разные стороны — ручьи
    // расходятся и сходятся, и живые коридоры между ними всё время едут.
    const arms =
      WAVE.flower.armsMin + Math.floor(rnd() * (WAVE.flower.armsMax - WAVE.flower.armsMin + 1));
    const waves = Math.ceil(n / arms);
    const gap = Math.min(1.2, Math.max(0.15, WAVE.flower.seconds / waves));
    for (let i = 0; i < n; i++) {
      const wave = (i / arms) | 0;
      const arm = i % arms;
      plan.push({
        at: start + wave * gap,
        form: true,
        ang: ((arm / arms) + wave * WAVE.flower.twist) * TAU,
        rad: WAVE.formRadius,
        swirl: (arm % 2 ? 1 : -1) * WAVE.flower.swirl,
      });
    }
  } else if (pattern === "sweep") {
    // Метла: плотный ручей ходит по дуге туда-обратно, как дворник по стеклу,
    // и заходит закрученным. Стоять надо там, откуда он только что ушёл.
    const passes =
      WAVE.sweep.passesMin + Math.floor(rnd() * (WAVE.sweep.passesMax - WAVE.sweep.passesMin + 1));
    const from = rnd() * TAU;
    const spin = rnd() < 0.5 ? 1 : -1;
    const gap = Math.max(WAVE.sweep.gapMin, WAVE.sweep.seconds / n);
    for (let i = 0; i < n; i++) {
      const k = (i / Math.max(1, n - 1)) * passes;
      // треугольная волна: доходит до края дуги и идёт обратно
      const wave = 2 * Math.abs(k - Math.floor(k + 0.5));
      plan.push({
        at: start + i * gap,
        form: true,
        ang: from + (wave - 0.5) * WAVE.sweep.arc * TAU,
        rad: WAVE.formRadius,
        swirl: spin * WAVE.sweep.swirl,
      });
    }
  } else {
    // Капель: интервал сжимается к концу вдвенадцатеро, но весь налёт
    // укладывается примерно в WAVE.drip.seconds независимо от размера роя.
    const first = Math.min(
      WAVE.drip.firstMax,
      (2 * WAVE.drip.seconds) / (n * (1 + 1 / WAVE.drip.squeeze))
    );
    const last = Math.max(WAVE.drip.lastMin, first / WAVE.drip.squeeze);
    let t = start;
    for (let i = 0; i < n; i++) {
      push(t, Math.floor(rnd() * 4), WAVE.edgeSpread);
      const k = i / Math.max(1, n - 1);
      t += first - k * (first - last);
    }
  }

  return plan;
}

let counter = 0;
export function makeOrder(
  from: string,
  drones: number,
  pattern: Pattern,
  direction = 0
): AttackOrder {
  return {
    id: `${Date.now().toString(36)}-${counter++}`,
    from,
    createdAt: Date.now(),
    drones,
    pattern,
    direction,
    seed: (Math.random() * 1e9) | 0,
  };
}
