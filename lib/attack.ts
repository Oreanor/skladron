// Атака: заказ и превращение его в расписание вылетов.

import { GRID } from "./base";
import { levelBonus } from "./economy";
import type { BattleResult } from "./engine";

export type Pattern =
  | "swarm"
  | "lines"
  | "random"
  | "drip"
  | "rings"
  | "spiral"
  | "flower"
  | "sweep";

/** Сколько атака ждёт живого защитника, прежде чем пройти сама. */
export const RAID_TTL_MS = 30 * 60 * 1000;

/** Потолок одного налёта. Движок тянет и больше, но пятисот за глаза. */
export const MAX_RAID = 500;

// ---------- размер налёта ----------
// Цифры сняты прогоном боя без игрока: пушки палят сами, рой растёт. Одна
// живая пушка успевает снять около трёх дронов за налёт — её держит не
// меткость, а перезарядка в три секунды. Примерно половину роя игрок
// разбирает руками: пулемётом и брандспойтом. Остальное прорывается, и рой
// считаем так, чтобы прорывов было столько, сколько реально успеть затушить.

/** Сколько дронов снимает за налёт одна пушка первого уровня. */
export const DRONES_PER_GUN = 3;
/** Доля роя, которую снимает руками игрок без прокачки. */
export const BARE_HANDS_SHARE = 0.35;
/** Прибавка к этой доле за уровень пулемёта и брандспойта. */
export const MG_SHARE_PER_LEVEL = 0.06;
export const WATER_SHARE_PER_LEVEL = 0.04;
/** Больше этой доли руками не снять, как ни качайся. */
export const MAX_HANDS_SHARE = 0.6;
/** Надбавка за размер склада: по большому есть куда бить. */
export const RAID_PER_CELL = 0.06;

/** Сколько прорывов игрок ещё успевает затушить на складе такого размера. */
function leaksOk(intact: number) {
  return Math.min(40, 10 + intact / 25);
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
  const gunPower = guns * DRONES_PER_GUN * levelBonus(levels.guns ?? 1, 0.25);
  // руки тоже растут: меткость очереди и ширина струи
  const hands = Math.min(
    MAX_HANDS_SHARE,
    BARE_HANDS_SHARE +
      MG_SHARE_PER_LEVEL * ((levels.mg ?? 1) - 1) +
      WATER_SHARE_PER_LEVEL * ((levels.water ?? 1) - 1)
  );
  const survivable = leaksOk(intact) + gunPower + intact * RAID_PER_CELL;
  return Math.max(30, Math.min(MAX_RAID, Math.round((survivable / (1 - hands)) * difficulty)));
}

/** Случайная сложность очередного налёта. */
export function raidDifficulty() {
  return 0.75 + Math.random() * 0.6;
}

export interface AttackOrder {
  id: string;
  from: string; // кто прислал
  createdAt: number;
  /** Когда атака встала первой в очереди и пошли часы. Пока null — ждёт. */
  activatedAt?: number | null;
  drones: number;
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

export interface SpawnTicket {
  at: number; // секунда боя
  edge: number;
  ox: number; // положение вдоль края, в клетках
  oy: number; // отступ за кадр
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

/** За сколько примерно секунд «капель» высыпает весь рой, каким бы он ни был. */
const DRIP_SECONDS = 60;

/** Колец в налёте: меньше пяти не кольца, больше десяти — уже капель. */
const RINGS_MIN = 5;
const RINGS_MAX = 10;
/** Пауза между первым и последним кольцом: к концу они идут всё чаще. */
const RING_GAP_FIRST = 6;
const RING_GAP_LAST = 1.2;
/** За столько секунд спираль делает полный оборот вокруг склада. */
const SPIRAL_TURN = 3;

/** Лепестков у «цветка»: столько ручьёв идёт одновременно. */
const FLOWER_ARMS_MIN = 4;
const FLOWER_ARMS_MAX = 6;
/** На столько круга проворачивается цветок за одну волну. */
const FLOWER_TWIST = 0.045;
/** Примерно столько секунд цветок раскрывается: иначе он неотличим от роя. */
const FLOWER_SECONDS = 30;
/** Сколько раз «метла» проходит туда-обратно и какую долю круга захватывает. */
const SWEEP_PASSES_MIN = 3;
const SWEEP_PASSES_MAX = 6;
const SWEEP_ARC = 0.4;

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

/** Расписание вылетов: детерминировано по seed, чтобы бой был воспроизводим. */
export function buildPlan(order: AttackOrder): SpawnTicket[] {
  const rnd = mulberry32(order.seed);
  const plan: SpawnTicket[] = [];
  const n = Math.max(1, order.drones);

  const push = (at: number, edge: number, spread: number) => {
    plan.push({
      at,
      edge,
      ox: rnd() * (GRID + spread * 2) - spread,
      oy: (rnd() - 0.5) * 8,
    });
  };

  if (order.pattern === "swarm") {
    // всё сразу: пушки просто не успевают перезаряжаться
    for (let i = 0; i < n; i++) push(2 + rnd() * 1.5, order.direction, 10);
  } else if (order.pattern === "lines" || order.pattern === "random") {
    // Чем крупнее рой, тем шире шеренга и короче пауза между ними: три сотни
    // дронов не должны заходить теми же восьмёрками, что и полтора десятка.
    const rowSize = Math.min(40, 8 + Math.floor(rnd() * 5) + Math.floor(n / 12));
    const gap = Math.max(1.4, 4 - n / 60);
    let t = 2;
    let left = n;
    while (left > 0) {
      const size = Math.min(left, rowSize);
      const edge = order.pattern === "lines" ? order.direction : Math.floor(rnd() * 4);
      for (let i = 0; i < size; i++) push(t + i * 0.1, edge, 6);
      left -= size;
      t += gap;
    }
  } else if (order.pattern === "rings" || order.pattern === "spiral") {
    // Кольцо — это рой, заходящий разом со всего периметра: дроны встают по
    // кругу через равные промежутки. Колец несколько, и с каждым пауза короче.
    // Спираль — то же кольцо, только дроны в нём стартуют не разом, а один за
    // другим по кругу, и кольцо к кольцу проворачивается.
    const rings = RINGS_MIN + Math.floor(rnd() * (RINGS_MAX - RINGS_MIN + 1));
    const per = Math.ceil(n / rings);
    const spiral = order.pattern === "spiral";
    let t = 2;
    let left = n;
    for (let i = 0; i < rings && left > 0; i++) {
      const size = Math.min(left, per);
      // кольца не должны ложиться след в след: каждое повёрнуто
      const phase = spiral ? (i * 0.37) % 1 : rnd();
      for (let j = 0; j < size; j++) {
        const u = (((j + 0.5) / size + phase) % 1) * GRID * 4;
        plan.push({
          at: t + (spiral ? (j / size) * SPIRAL_TURN : 0),
          edge: Math.min(3, Math.floor(u / GRID)),
          ox: u % GRID,
          oy: (rnd() - 0.5) * 4,
        });
      }
      left -= size;
      const k = i / Math.max(1, rings - 1);
      t += RING_GAP_FIRST - k * (RING_GAP_FIRST - RING_GAP_LAST);
    }
  } else if (order.pattern === "flower") {
    // Цветок: несколько ручьёв разом, и все вместе проворачиваются вокруг
    // склада. Между лепестками остаются живые коридоры, но они уезжают.
    const arms = FLOWER_ARMS_MIN + Math.floor(rnd() * (FLOWER_ARMS_MAX - FLOWER_ARMS_MIN + 1));
    const waves = Math.ceil(n / arms);
    const step = Math.min(1.2, Math.max(0.15, FLOWER_SECONDS / waves));
    for (let i = 0; i < n; i++) {
      const wave = Math.floor(i / arms);
      const u = (((i % arms) / arms + wave * FLOWER_TWIST) % 1) * GRID * 4;
      plan.push({
        at: 2 + wave * step,
        edge: Math.min(3, Math.floor(u / GRID)),
        ox: u % GRID,
        oy: (rnd() - 0.5) * 4,
      });
    }
  } else if (order.pattern === "sweep") {
    // Метла: плотный ручей ходит по кругу туда-обратно, как дворник по стеклу.
    // Стоять надо там, откуда он только что ушёл.
    const passes = SWEEP_PASSES_MIN + Math.floor(rnd() * (SWEEP_PASSES_MAX - SWEEP_PASSES_MIN + 1));
    const start = rnd();
    const step = Math.max(0.06, 40 / n);
    for (let i = 0; i < n; i++) {
      const k = (i / Math.max(1, n - 1)) * passes;
      // треугольная волна: доходит до края дуги и идёт обратно
      const wave = 2 * Math.abs(k - Math.floor(k + 0.5));
      const u = ((start + (wave - 0.5) * SWEEP_ARC + 1) % 1) * GRID * 4;
      plan.push({
        at: 2 + i * step,
        edge: Math.min(3, Math.floor(u / GRID)),
        ox: u % GRID,
        oy: (rnd() - 0.5) * 3,
      });
    }
  } else {
    // Капель: интервал сжимается к концу вдвенадцатеро, но весь налёт
    // укладывается примерно в DRIP_SECONDS независимо от размера роя.
    const first = Math.min(3, (2 * DRIP_SECONDS) / (n * (1 + 1 / 12)));
    const last = Math.max(0.05, first / 12);
    let t = 2;
    for (let i = 0; i < n; i++) {
      push(t, Math.floor(rnd() * 4), 4);
      const k = i / Math.max(1, n - 1);
      t += first - k * (first - last);
    }
  }

  return plan.sort((a, b) => a.at - b.at);
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
