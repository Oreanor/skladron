// Атака: заказ и превращение его в расписание вылетов.

import { GRID } from "./base";
import { levelBonus } from "./economy";
import type { BattleResult } from "./engine";
import type { Avatar } from "./avatar";
import { DRONE, GUN, PAYLOAD, RAID, SIMULATION_VERSION, WAVE } from "./tuning";

/**
 * Что дрон несёт. Простой долетает и взрывается; тяжёлый берёт двойную
 * взрывчатку и поджигает кольцо вокруг цели, но тащится медленнее; турбо
 * летит быстрее; броня держит лишний снаряд зенитки; подавители не взрываются вовсе — кружат над обороной и
 * глушат её, пока не кончится топливо. Цифры у всех в PAYLOAD.
 */
export type Payload =
  | "plain"
  | "heavy"
  | "jammer"
  | "foamer"
  | "demag"
  | "stealth"
  | "blower"
  | "turbo"
  | "armor";
export const PAYLOADS: Payload[] = [
  "plain",
  "heavy",
  "jammer",
  "foamer",
  "demag",
  "stealth",
  "blower",
  "turbo",
  "armor",
];

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
  /**
   * Задержка от начала боя, секунды. Две волны с нулём стартуют вместе;
   * разные значения — подряд или с паузой.
   */
  delay: number;
  /**
   * Только у капели: сколько дронов в звене, 1…4. Звено заходит с одной
   * стороны почти разом и плотно — перегружает одно направление. Без поля —
   * по одному, как капель и была.
   */
  flight?: number;
}

/** Самое большое звено капели. */
export const MAX_FLIGHT = 4;

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
  /** Волны по порядку. */
  waves: WavePlan[];
  /** Форма и сторона первой волны — для подписей в списке налётов. */
  pattern: Pattern;
  /**
   * Для swarm и lines — сторона: 0 верх, 1 низ, 2 слева, 3 справа. Для
   * спирали — чётная по часовой, нечётная против. Для кольца — 0 по
   * часовой, 1 против, 2 и 3 без вращения.
   */
  direction: number;
  seed: number;
  /** Уровень дронов нападающего на момент вылета. */
  droneLevel: number;
  /** Версия правил симуляции: повтор чужой версии нельзя молча считать нынешним. */
  simulationVersion: number;
  /** Лицо нападавшего: показываем в окне перед боем. */
  avatar?: Avatar;
  /** Почта нападавшего: по ней он попадает в список соперников. */
  fromEmail?: string;
  /** Короткая записка нападающего при отправке — показывается перед отбиванием. */
  opener?: string | null;
  remote?: boolean; // настоящий налёт из серверной очереди, а не локальный бот
  /** Номер состязания: налёт на самого себя. */
  competitionStage?: number;
}

/** Строка журнала: что и когда мы посылали и есть ли к этому повтор. */
export interface RaidLog {
  id: string;
  /** Кем ты был в этом бою. */
  side: "attack" | "defence";
  /** Вторая сторона: чей склад жгли или кто жёг твой. */
  foe: string;
  /** Её почта: по ней из журнала открывается карточка врага. */
  foeEmail: string;
  /** Когда отгремел бой, а у неотыгранных — когда рой вылетел. */
  at: number;
  /** Налёт ещё в пути: защитник до него не дошёл. */
  pending: boolean;
  drones: number;
  burned: number;
  /** Какая доля склада сгорела, %. Нет у боёв, от которых не осталось слепка. */
  burnedPct?: number;
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
    levels: SnapLevels;
    trace: string;
  };
}

/** Одна реплика в разговоре с соперником. */
export interface Message {
  id: string;
  /** Написал я, а не он: по этому реплика встаёт справа. */
  mine: boolean;
  body: string;
  at: number;
  /** Прочитано ли им — у своих реплик; у чужих всегда прочитано. */
  seen: boolean;
}

/**
 * Уровни защитника, снятые на момент налёта. Тот же набор, что в профиле,
 * но каждый необязателен: снимок мог быть сделан до того, как класс завели.
 */
export interface SnapLevels {
  guns?: number;
  rockets?: number;
  sprays?: number;
  traps?: number;
  balloons?: number;
  mg?: number;
  water?: number;
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

/** Сублинейная огибающая длительности: рост n почти не растягивает налёт. */
const raidDuration = (n: number, base = WAVE.duration.base, perSqrt = WAVE.duration.perSqrt, cap = WAVE.duration.cap) =>
  Math.min(cap, base + perSqrt * Math.sqrt(Math.max(1, n)));

/** Параллелизм: база + n/step, с разбросом и потолком. */
const scaleCount = (
  n: number,
  min: number,
  per: number,
  cap: number,
  spread: number,
  rnd: () => number
) => {
  const raw = min + Math.floor(n * per) + Math.floor(rnd() * (spread + 1));
  return Math.max(min, Math.min(cap, raw));
};

/**
 * Расписание вылетов: детерминировано по seed, чтобы бой был воспроизводим.
 * Каждая волна стартует в WAVE.start + свой delay: одинаковый delay — вместе,
 * разный — подряд или с паузой. Внутри волны паттерн всё равно поднимается
 * разом (launchTogether).
 */
export function buildPlan(order: AttackOrder): SpawnTicket[] {
  if (order.simulationVersion !== SIMULATION_VERSION) {
    throw new Error(`unsupported simulation version: ${order.simulationVersion}`);
  }
  const rnd = mulberry32(order.seed);
  const plan: SpawnTicket[] = [];
  for (const wave of order.waves) {
    const size = waveSize(wave);
    if (size <= 0) continue;
    const at = WAVE.start + Math.max(0, wave.delay);
    const tickets = waveTickets(wave.pattern, wave.direction, size, rnd, at, wave.flight);
    if (!tickets.length) continue;
    assignPayloads(tickets, wave.groups);
    launchTogether(tickets, at, order.droneLevel);
    plan.push(...tickets);
  }
  return plan.sort((a, b) => a.at - b.at);
}

/** Вылеты одной волны: только форма, без начинок и без чужих волн. */
function waveTickets(
  pattern: Pattern,
  direction: number,
  n: number,
  rnd: () => number,
  start: number,
  /** Только капель: дронов в звене. */
  flight = 1
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

  switch (pattern) {
    case "swarm": {
      // Крупный рой жмётся: меньше размазни по времени и по краю. Длительность
      // входа не растёт с n — наоборот, уплотняется.
      const jitter = Math.max(
        WAVE.swarm.jitterMin,
        WAVE.swarm.jitter - n * WAVE.swarm.jitterPerDrone
      );
      const spread = Math.max(
        WAVE.swarm.spreadMin,
        WAVE.swarm.spread - n * WAVE.swarm.spreadPerDrone
      );
      for (let i = 0; i < n; i++) {
        push(start + rnd() * jitter, direction, spread);
      }
      break;
    }
    case "lines":
    case "random": {
      // Чем крупнее рой, тем шире шеренга и короче пауза: три сотни дронов не
      // должны заходить теми же восьмёрками, что и полтора десятка.
      const rowSize = Math.min(
        WAVE.lines.rowMax,
        WAVE.lines.rowBase +
          Math.floor(rnd() * WAVE.lines.rowSpread) +
          Math.floor(n * WAVE.lines.rowPerDrone)
      );
      const rows = Math.max(1, Math.ceil(n / rowSize));
      const duration = raidDuration(n);
      const gap = Math.max(
        WAVE.lines.gapMin,
        Math.min(WAVE.lines.gap - n * WAVE.lines.gapPerDrone, duration / Math.max(1, rows - 1))
      );
      let t = start;
      let left = n;
      while (left > 0) {
        const size = Math.min(left, rowSize);
        const edge = pattern === "lines" ? direction : Math.floor(rnd() * 4);
        // Шеренга — это шеренга: дроны встают ровно по фронту и входят разом.
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
      break;
    }
    case "rings": {
      // Всегда одно кольцо: дроны равномерно по полному кругу. Раньше лишние
      // шли вторым рядом в соседние слоты — получалась шеренга с одной стороны;
      // а несколько концентрических слоёв дробили маленький рой на сектора.
      // Вращение выбирает нападающий: 0 — по часовой, 1 — против, 2 и 3 —
      // кольцо сжимается строго внутрь (ось y на карте смотрит вниз).
      const phase = rnd() < 0.5 ? 0.5 / Math.max(1, n) : 0;
      const spin = direction === 0 ? 1 : direction === 1 ? -1 : 0;
      for (let j = 0; j < n; j++) {
        plan.push({
          at: start,
          form: true,
          ang: ((j + phase) / n) * TAU,
          rad: WAVE.formRadius,
          swirl: spin * WAVE.rings.swirl,
        });
      }
      break;
    }
    case "spiral": {
      // Рукава растут с роем и каждый наматывает turns оборотов — как у
      // галактики. Сдвиг точки вылета равномерно раскладывает эти обороты по
      // слоям; закрутка полёта против знака сдвига, чтобы рой шёл по изгибу ветви.
      // Направление выбирает нападающий: чётная сторона — рой вращается по
      // часовой, нечётная — против (ось y на карте смотрит вниз).
      const arms = scaleCount(
        n,
        WAVE.spiral.armsMin,
        1 / WAVE.spiral.perArm,
        WAVE.spiral.armsCap,
        WAVE.spiral.armsSpread,
        rnd
      );
      const layers = Math.ceil(n / arms);
      const duration = raidDuration(n);
      const gap = Math.min(
        WAVE.spiral.gapMax,
        Math.max(WAVE.spiral.gapMin, duration / Math.max(1, layers - 1))
      );
      const emit = layers > 1 ? (WAVE.spiral.turns * TAU) / (layers - 1) : 0;
      const spin = direction % 2 === 0 ? -1 : 1;
      const from = rnd() * TAU;
      for (let i = 0; i < n; i++) {
        const wave = (i / arms) | 0;
        const arm = i % arms;
        plan.push({
          at: start + wave * gap,
          form: true,
          ang: from + spin * wave * emit + (arm / arms) * TAU,
          rad: WAVE.formRadius,
          swirl: -spin * WAVE.spiral.swirl,
        });
      }
      break;
    }
    case "flower": {
      // Лепестки тоже наращиваем с роем — иначе крупные цветы отличаются от
      // мелких только длиннее «стебля», а не густотой.
      const arms = scaleCount(
        n,
        WAVE.flower.armsMin,
        1 / WAVE.flower.perArm,
        WAVE.flower.armsCap,
        WAVE.flower.armsSpread,
        rnd
      );
      const layers = Math.ceil(n / arms);
      const duration = raidDuration(n);
      const gap = Math.min(
        WAVE.flower.gapMax,
        Math.max(WAVE.flower.gapMin, duration / Math.max(1, layers - 1))
      );
      for (let i = 0; i < n; i++) {
        const wave = (i / arms) | 0;
        const arm = i % arms;
        plan.push({
          at: start + wave * gap,
          form: true,
          ang: (arm / arms + wave * WAVE.flower.twist) * TAU,
          rad: WAVE.formRadius,
          swirl: (arm % 2 ? 1 : -1) * WAVE.flower.swirl,
        });
      }
      break;
    }
    case "sweep": {
      // Ширина ручья и число проходов растут с n; шаг по дуге — из сублинейной
      // длительности. Один тонкий ручеёк на двести дронов больше не выходит.
      const passes = scaleCount(
        n,
        WAVE.sweep.passesMin,
        1 / WAVE.sweep.perPass,
        WAVE.sweep.passesCap,
        WAVE.sweep.passesSpread,
        rnd
      );
      const width = scaleCount(
        n,
        WAVE.sweep.widthMin,
        WAVE.sweep.perWidth,
        WAVE.sweep.widthCap,
        0,
        rnd
      );
      const from = rnd() * TAU;
      const spin = rnd() < 0.5 ? 1 : -1;
      const slots = Math.ceil(n / width);
      const duration = raidDuration(n);
      const gap = Math.max(WAVE.sweep.gapMin, duration / Math.max(1, slots - 1));
      let placed = 0;
      for (let s = 0; s < slots && placed < n; s++) {
        const k = (s / Math.max(1, slots - 1)) * passes;
        const wave = 2 * Math.abs(k - Math.floor(k + 0.5));
        const baseAng = from + (wave - 0.5) * WAVE.sweep.arc * TAU;
        const batch = Math.min(width, n - placed);
        for (let w = 0; w < batch; w++) {
          const offset = (w - (batch - 1) / 2) * WAVE.sweep.widthSpan * TAU;
          plan.push({
            at: start + s * gap,
            form: true,
            ang: baseAng + offset,
            rad: WAVE.formRadius,
            swirl: spin * WAVE.sweep.swirl,
          });
          placed++;
        }
      }
      break;
    }
    case "drip":
    default: {
      // Капель → водопад: длительность сублинейна. При малом рое редкие капли
      // сгущаются к концу; при большом средний шаг уже мелкий — старт почти
      // такой же плотный, как финиш, и это сразу водопад, а не «потом польёт».
      const seconds = Math.min(
        WAVE.drip.secondsCap,
        WAVE.drip.secondsBase + WAVE.drip.secondsPerSqrt * Math.sqrt(Math.max(1, n))
      );
      const steps = Math.max(1, n - 1);
      const avg = seconds / steps;
      const fade = Math.max(
        0,
        Math.min(1, (avg - WAVE.drip.firstMin) / (WAVE.drip.firstMax - WAVE.drip.firstMin))
      );
      let first = Math.min(
        WAVE.drip.firstMax,
        Math.max(avg, avg * (1 + (WAVE.drip.squeeze - 1) * fade * 0.5))
      );
      let last = 2 * avg - first;
      if (last < WAVE.drip.lastMin) {
        last = WAVE.drip.lastMin;
        first = Math.min(WAVE.drip.firstMax, 2 * avg - last);
      }
      first = Math.max(WAVE.drip.firstMin, first);
      const size = Math.max(1, Math.min(MAX_FLIGHT, Math.floor(flight)));
      let t = start;
      if (size === 1) {
        // По одному — тем же путём и теми же случайными числами, что и
        // раньше: иначе разошлись бы повторы уже сыгранных налётов.
        for (let i = 0; i < n; i++) {
          push(t, Math.floor(rnd() * 4), WAVE.edgeSpread);
          const k = i / Math.max(1, n - 1);
          t += first - k * (first - last);
        }
        break;
      }
      // Звеньями: капель та же, но каждая капля — несколько дронов с одной
      // стороны, плечом к плечу и почти разом. Капель реже — дронов столько же.
      const drops = Math.ceil(n / size);
      for (let d = 0, left = n; d < drops; d++) {
        const edge = Math.floor(rnd() * 4);
        const ox = rnd() * (GRID + WAVE.edgeSpread * 2) - WAVE.edgeSpread;
        const here = Math.min(size, left);
        for (let m = 0; m < here; m++) {
          plan.push({
            at: t + m * WAVE.drip.flightGap,
            edge,
            ox: ox + (m - (here - 1) / 2) * WAVE.drip.flightSpacing,
            oy: (rnd() - 0.5) * WAVE.edgeDepth,
          });
        }
        left -= here;
        const k = d / Math.max(1, drops - 1);
        t += (first - k * (first - last)) * size;
      }
      break;
    }
  }

  return plan;
}

let counter = 0;
/** Свой налёт без сервера: волны и уровень дронов — как у настоящего. */
export function makeOrder(
  from: string,
  waves: WavePlan[],
  droneLevel = 1,
  seed = (Math.random() * 1e9) | 0
): AttackOrder {
  return {
    id: `${Date.now().toString(36)}-${counter++}`,
    from,
    createdAt: Date.now(),
    drones: raidTotal(waves),
    waves,
    pattern: waves[0].pattern,
    direction: waves[0].direction,
    seed,
    droneLevel,
    simulationVersion: SIMULATION_VERSION,
  };
}
