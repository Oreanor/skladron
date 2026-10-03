/**
 * Миссии — одиночная кампания: сто боёв на своём складе с растущей
 * сложностью. Счёт — сколько процентов склада уцелело, всё сберёг — 100.
 * Лучший счёт по каждому номеру хранится, пройденные можно переигрывать.
 *
 * Номер открывается, когда на предыдущем склад уцелел хоть сколько-то.
 * Состав номера и зерно боя постоянны: переигрывая, выходишь против того же
 * роя, и счёт сравним с прошлым.
 *
 * Каждая миссия — 8–10 волн. Первые идут по очереди, мелкие и простые;
 * к концу волны крупнеют, приходят кучнее и накладываются друг на друга.
 * С номером растёт всё сразу: размер, плотность, набор начинок и рисунков.
 */

import { mulberry32, MAX_FLIGHT, type Pattern, type Payload, type WavePlan } from "./attack";
import { MAX_LEVEL } from "./economy";

/** Сколько всего номеров. */
export const COMPETITION_STAGES = 100;

/** Сколько дронов в миссии на первом и на последнем номере. */
const DRONES_FIRST = 120;
const DRONES_LAST = 1000;

function clampStage(stage: number) {
  return Math.min(COMPETITION_STAGES, Math.max(1, Math.floor(stage)));
}

/** Доля пути по кампании: 0 на первом номере, 1 на последнем. */
const progress = (n: number) => (n - 1) / (COMPETITION_STAGES - 1);

/**
 * Весь рой миссии: ровно от DRONES_FIRST до DRONES_LAST. Та же формула стоит
 * в queue_competition — сервер сверяет по ней размер.
 */
export function competitionDrones(stage: number) {
  const n = clampStage(stage);
  return DRONES_FIRST + Math.floor(((n - 1) * (DRONES_LAST - DRONES_FIRST)) / (COMPETITION_STAGES - 1));
}

/**
 * Уровень дронов роя: +1 каждые одиннадцать номеров, с 1 на первом до 10 на
 * сотом. Растёт до конца кампании: с уровнем растёт и радиус подавления,
 * и застрянь он на пятом — прокачанные выше пушки глушить было бы нечем.
 * Та же формула стоит в queue_competition.
 */
export function competitionDroneLevel(stage: number) {
  // с нулевого (в базе — первого) до десятого к 90-й миссии, дальше потолок
  return Math.min(MAX_LEVEL, 1 + Math.floor(((clampStage(stage) - 1) * 10) / 89));
}

/** Зерно боя номера: одно на все попытки, чтобы счёт был сравним. */
export function competitionSeed(stage: number) {
  return clampStage(stage) * 9973;
}

/**
 * Счёт попытки — сколько процентов склада уцелело: всё сберёг — 100.
 * Сервер считает так же в resolve_attack.
 */
export function competitionScore(intactBefore: number, intactAfter: number) {
  if (intactBefore <= 0) return { pct: 0, score: 0 };
  const pct = Math.floor((Math.max(0, intactAfter) * 100) / intactBefore);
  return { pct, score: pct };
}

/** Лучшая попытка номера. */
export interface CompetitionBest {
  score: number;
  pct: number;
  /** Площадь склада на момент попытки, клеток. */
  area: number;
  /** Id боя этой попытки — по нему открывается повтор. Без входа его нет. */
  id?: string;
}

function pick<T>(list: readonly T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length) % list.length];
}

/** Рисунки от простых к тяжёлым: ранние волны берут из начала списка. */
const PATTERNS: readonly Pattern[] = ["drip", "lines", "random", "sweep", "rings", "spiral", "flower", "swarm"];

/**
 * Начинки по мере того, как кампания их открывает: с какого номера каждая
 * может попасть в волну. Пустые и турбо — с первой миссии.
 */
const PAYLOAD_FROM: readonly [Payload, number][] = [
  ["plain", 1],
  ["turbo", 1],
  ["heavy", 6],
  ["blower", 10],
  ["jammer", 16],
  ["foamer", 22],
  ["shooter", 20],
  ["armor", 26],
  ["stealth", 32],
  ["demag", 40],
];

/** Начинки, что сами жгут склад: основа любой волны. */
const STRIKERS: readonly Payload[] = ["plain", "turbo", "heavy", "shooter", "armor", "stealth", "blower"];

/** Сколько волн: 8–10, от зерна номера. */
const waveCountOf = (rnd: () => number) => 8 + Math.floor(rnd() * 3);

/**
 * Раскладка роя по волнам: поздние крупнее ранних. Крутизна растёт с
 * номером — на первых миссиях волны почти ровные, к концу последняя
 * вчетверо больше первой. Сумма — ровно total.
 */
function waveSizes(total: number, waves: number, p: number, rnd: () => number): number[] {
  const ramp = 0.12 + 0.25 * p;
  const weights = Array.from({ length: waves }, (_, i) => (1 + i * ramp) * (0.9 + rnd() * 0.2));
  const sum = weights.reduce((a, b) => a + b, 0);
  const sizes = weights.map((w) => Math.max(1, Math.floor((total * w) / sum)));
  // остаток — в последние волны, перебор — с последних же
  let left = total - sizes.reduce((a, b) => a + b, 0);
  for (let i = waves - 1; left !== 0; i = (i - 1 + waves) % waves) {
    if (left > 0) {
      sizes[i]++;
      left--;
    } else if (sizes[i] > 1) {
      sizes[i]--;
      left++;
    }
  }
  return sizes;
}

/**
 * Когда стартует каждая волна. Начало миссии — по очереди, с паузами в
 * несколько секунд; к концу паузы сжимаются до секунды-двух, и волны
 * налезают друг на друга. Чем дальше номер, тем всё плотнее.
 */
function waveDelays(waves: number, p: number, rnd: () => number): number[] {
  const gapStart = 7 - 2.5 * p;
  const gapEnd = Math.max(0.6, 2.4 - 1.6 * p);
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < waves; i++) {
    out.push(Math.round(at * 10) / 10);
    const f = waves > 1 ? i / (waves - 1) : 0;
    at += (gapStart + (gapEnd - gapStart) * f) * (0.8 + rnd() * 0.4);
  }
  return out;
}

/** Начинки в волне: 1–3 вида из открытых к этому номеру, поздние волны пестрее. */
function waveGroups(
  stage: number,
  size: number,
  f: number,
  rnd: () => number
): WavePlan["groups"] {
  const open = PAYLOAD_FROM.filter(([, from]) => stage >= from).map(([p]) => p);
  const most = Math.min(open.length, 1 + Math.round(f * 2)); // 1 → 3 вида к концу миссии
  const kinds = Math.max(1, Math.min(most, 1 + Math.floor(rnd() * most)));
  // Основа волны — то, что жжёт склад. Подавители сами ничего не поджигают:
  // волна из одних подавителей пролетала бы впустую, так что они — примесь.
  const chosen: Payload[] = [pick(open.filter((p) => STRIKERS.includes(p)), rnd)];
  while (chosen.length < kinds) {
    const p = pick(open, rnd);
    if (!chosen.includes(p)) chosen.push(p);
  }
  // доли: первая начинка — основа волны, остальные — примесь
  const weights = chosen.map((_, i) => (i === 0 ? 1.4 : 0.5 + rnd() * 0.6));
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.floor((size * w) / sum));
  let left = size - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i++, left--) counts[i % counts.length]++;
  return chosen.map((payload, i) => ({ payload, n: counts[i] })).filter((g) => g.n > 0);
}

export interface CompetitionPlan {
  stage: number;
  waves: WavePlan[];
  droneLevel: number;
  drones: number;
  seed: number;
}

/** План миссии №stage. Сид от номера — один и тот же состав при повторе. */
export function buildCompetition(stage: number): CompetitionPlan {
  const n = clampStage(stage);
  const p = progress(n);
  const rnd = mulberry32(n * 9973);
  const drones = competitionDrones(n);
  const count = waveCountOf(rnd);
  const sizes = waveSizes(drones, count, p, rnd);
  const delays = waveDelays(count, p, rnd);

  const waves: WavePlan[] = sizes.map((size, i) => {
    const f = count > 1 ? i / (count - 1) : 0;
    // Рисунок: в первых миссиях ранние волны — из простых, поздние — из
    // тяжёлых, а к 25-й открыты все, и дальше рисунки выпадают поровну. Иначе
    // последние в списке (цветок, рой) за всю кампанию встречались единицами.
    const hard = Math.min(1, f * 0.5 + p * 4);
    const reach = Math.max(2, Math.round(2 + hard * (PATTERNS.length - 2)));
    const pattern = pick(PATTERNS.slice(0, reach), rnd);
    const wave: WavePlan = {
      pattern,
      direction: Math.floor(rnd() * 4),
      delay: delays[i],
      groups: waveGroups(n, size, f, rnd),
    };
    // капель в поздних волнах — звеньями: перегружает одно направление
    if (pattern === "drip" && f > 0.4) {
      wave.flight = Math.min(MAX_FLIGHT, 1 + Math.floor(rnd() * (1 + Math.round(p * 3))));
    }
    return wave;
  });

  return { stage: n, waves, droneLevel: competitionDroneLevel(n), drones, seed: competitionSeed(n) };
}

/**
 * Сервер зовёт нападающего миссии по имени твоего же склада. В очереди и в
 * бою ему место под номером: подписываем на месте.
 */
export function titleCompetitions(
  list: { from: string; competitionStage?: number }[],
  t: (key: "competition.title", vars: { n: number }) => string
) {
  for (const a of list) {
    if (a.competitionStage) a.from = t("competition.title", { n: a.competitionStage });
  }
}
