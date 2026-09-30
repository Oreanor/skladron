/**
 * Состязания: сто налётов на свой склад с растущей сложностью. Счёт — сколько
 * процентов склада уцелело, всё сберёг — 100.
 * Лучший счёт по каждому номеру хранится, пройденные можно переигрывать.
 *
 * Номер открывается, когда на предыдущем склад уцелел хоть сколько-то.
 * Состав номера и зерно боя постоянны: переигрывая, выходишь против того же
 * роя, и счёт сравним с прошлым.
 */

import {
  mulberry32,
  type Pattern,
  type Payload,
  type WavePlan,
} from "./attack";

/** Сколько всего номеров. */
export const COMPETITION_STAGES = 100;

function clampStage(stage: number) {
  return Math.min(COMPETITION_STAGES, Math.max(1, Math.floor(stage)));
}

/**
 * Размер роя: от 12 на первом номере, около пяти дронов за номер — к сотому
 * под 490, у самого потолка налёта. Та же формула стоит в queue_competition:
 * сервер сверяет по ней размер.
 */
export function competitionDrones(stage: number) {
  const n = clampStage(stage);
  return 12 + Math.floor(((n - 1) * 476) / (COMPETITION_STAGES - 1));
}

/** Уровень дронов роя: +1 каждые десять номеров, с 1 до 5 (с №41). */
export function competitionDroneLevel(stage: number) {
  return Math.min(5, 1 + Math.floor((clampStage(stage) - 1) / 10));
}

/** Сколько волн: +1 каждые тринадцать номеров, с 1 до 4 (с №40). */
export function competitionWaveCount(stage: number) {
  return Math.min(4, 1 + Math.floor((clampStage(stage) - 1) / 13));
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

const EASY: Pattern[] = ["drip", "lines", "random"];
const MID: Pattern[] = ["rings", "spiral", "sweep", "lines"];
const HARD: Pattern[] = ["swarm", "flower", "spiral", "rings", "sweep"];

function pick<T>(list: T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length) % list.length];
}

function patternFor(stage: number, rnd: () => number): Pattern {
  if (stage <= 5) return pick(EASY, rnd);
  if (stage <= 15) return pick([...EASY, ...MID], rnd);
  if (stage <= 25) return pick(MID, rnd);
  return pick(HARD, rnd);
}

/**
 * Состав одной волны: на низких номерах одна начинка, дальше 2–3 типа.
 * На высоких номерах у соседних волн набор другой — не один и тот же микс.
 */
function groupsFor(
  stage: number,
  n: number,
  waveIndex: number,
  waveCount: number,
  rnd: () => number
): WavePlan["groups"] {
  if (n <= 0) return [{ payload: "plain", n: 0 }];

  // Первые пять: только пустые.
  if (stage <= 5) return [{ payload: "plain", n }];

  // Пул начинок растёт с номером; у волны сдвигаем акцент.
  const pool: Payload[] =
    stage <= 13
      ? ["plain", "jammer", "blower"]
      : stage <= 23
        ? ["plain", "jammer", "heavy", "foamer", "turbo"]
        : ["plain", "jammer", "heavy", "stealth", "turbo", "demag", "blower"];

  // Сколько типов в этой волне: 2, дальше часто 3.
  const types = stage <= 13 ? 2 : stage >= 25 || rnd() > 0.35 ? 3 : 2;

  // Стартуем с разных мест пула, чтобы соседние волны не совпадали.
  const start = (waveIndex * 2 + Math.floor(rnd() * pool.length)) % pool.length;
  const chosen: Payload[] = [];
  for (let i = 0; i < types && i < pool.length; i++) {
    const p = pool[(start + i) % pool.length];
    if (!chosen.includes(p)) chosen.push(p);
  }
  // На последних волнах сложных номеров чаще «острый» акцент.
  if (stage >= 23 && waveIndex === waveCount - 1 && !chosen.includes("stealth") && pool.includes("stealth")) {
    chosen[chosen.length - 1] = rnd() > 0.5 ? "stealth" : "heavy";
  }

  // Доли: первая чуть больше, остальное поровну с дрожью.
  const weights = chosen.map((_, i) => (i === 0 ? 1.2 : 0.7 + rnd() * 0.5));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.floor((n * w) / sumW));
  let left = n - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i++, left--) counts[i % counts.length]++;

  return chosen
    .map((payload, i) => ({ payload, n: counts[i] }))
    .filter((g) => g.n > 0);
}

/** Разбить общий рой на волны: поздние чуть жирнее. */
function splitCounts(total: number, waves: number, rnd: () => number): number[] {
  if (waves <= 1) return [total];
  const weights = Array.from({ length: waves }, (_, i) => 1 + i * 0.35 + rnd() * 0.2);
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.max(1, Math.floor((total * w) / sum)));
  let left = total - counts.reduce((a, b) => a + b, 0);
  // Лишнее — в хвост; недобор — с конца.
  if (left > 0) counts[counts.length - 1] += left;
  while (left < 0) {
    for (let i = counts.length - 1; i >= 0 && left < 0; i--) {
      if (counts[i] > 1) {
        counts[i]--;
        left++;
      }
    }
  }
  return counts;
}

export interface CompetitionPlan {
  stage: number;
  waves: WavePlan[];
  droneLevel: number;
  drones: number;
  seed: number;
}

/** План состязания №stage. Сид от номера — один и тот же состав при повторе. */
export function buildCompetition(stage: number): CompetitionPlan {
  const n = clampStage(stage);
  const rnd = mulberry32(n * 9973);
  const drones = competitionDrones(n);
  const droneLevel = competitionDroneLevel(n);
  const waveCount = competitionWaveCount(n);
  const parts = splitCounts(drones, waveCount, rnd);

  const waves: WavePlan[] = parts.map((count, i) => ({
    pattern: patternFor(n, rnd),
    direction: Math.floor(rnd() * 4),
    delay: i === 0 ? 0 : i * 2,
    groups: groupsFor(n, count, i, waveCount, rnd),
  }));

  return { stage: n, waves, droneLevel, drones, seed: competitionSeed(n) };
}

/**
 * Сервер зовёт нападающего состязания по имени твоего же склада. В очереди
 * и в бою ему место под номером: подписываем на месте.
 */
export function titleCompetitions(
  list: { from: string; competitionStage?: number }[],
  t: (key: "competition.title", vars: { n: number }) => string
) {
  for (const a of list) {
    if (a.competitionStage) a.from = t("competition.title", { n: a.competitionStage });
  }
}
