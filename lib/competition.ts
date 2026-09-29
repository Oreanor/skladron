/**
 * Состязания: прогрессивные налёты на свой склад вместо свободного «пробного».
 * №1 — учебка; к 7–8 без апгрейдов уже спотыкаешься. Волны и начинки
 * растут вместе с номером: сначала микс в одной волне, потом несколько волн
 * разного состава.
 */

import {
  mulberry32,
  type Pattern,
  type Payload,
  type WavePlan,
} from "./attack";
import { RAID } from "./tuning";

/** Потолок состязания — не выше пробного налёта. */
const COMPETITION_CAP = Math.min(250, RAID.max);
export function competitionDrones(stage: number) {
  const n = Math.max(1, Math.floor(stage));
  return Math.min(COMPETITION_CAP, Math.round(12 * Math.pow(1.35, n - 1)));
}

/** Уровень дронов роя: с третьего номера растёт, потолок 5. */
export function competitionDroneLevel(stage: number) {
  const n = Math.max(1, Math.floor(stage));
  return Math.min(5, 1 + Math.floor(Math.max(0, n - 3) / 2));
}

/** Сколько волн: 1 → 2 → 3 → 4. */
export function competitionWaveCount(stage: number) {
  const n = Math.max(1, Math.floor(stage));
  return Math.min(4, 1 + Math.floor((n - 1) / 2));
}

const EASY: Pattern[] = ["drip", "lines", "random"];
const MID: Pattern[] = ["rings", "spiral", "sweep", "lines"];
const HARD: Pattern[] = ["swarm", "flower", "spiral", "rings", "sweep"];

function pick<T>(list: T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length) % list.length];
}

function patternFor(stage: number, rnd: () => number): Pattern {
  if (stage <= 2) return pick(EASY, rnd);
  if (stage <= 5) return pick([...EASY, ...MID], rnd);
  if (stage <= 7) return pick(MID, rnd);
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

  // №1–2: только пустые.
  if (stage <= 2) return [{ payload: "plain", n }];

  // Пул начинок растёт с номером; у волны сдвигаем акцент.
  const pool: Payload[] =
    stage <= 4
      ? ["plain", "jammer", "blower"]
      : stage <= 6
        ? ["plain", "jammer", "heavy", "foamer", "turbo"]
        : ["plain", "jammer", "heavy", "stealth", "turbo", "demag", "blower"];

  // Сколько типов в этой волне: 2, с №5 часто 3.
  const types = stage <= 4 ? 2 : stage >= 7 || rnd() > 0.35 ? 3 : 2;

  // Стартуем с разных мест пула, чтобы соседние волны не совпадали.
  const start = (waveIndex * 2 + Math.floor(rnd() * pool.length)) % pool.length;
  const chosen: Payload[] = [];
  for (let i = 0; i < types && i < pool.length; i++) {
    const p = pool[(start + i) % pool.length];
    if (!chosen.includes(p)) chosen.push(p);
  }
  // На последних волнах сложных состязаний чаще «острый» акцент.
  if (stage >= 6 && waveIndex === waveCount - 1 && !chosen.includes("stealth") && pool.includes("stealth")) {
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
}

/** План состязания №stage. Сид от номера — один и тот же состав при повторе. */
export function buildCompetition(stage: number, seed = stage * 9973): CompetitionPlan {
  const n = Math.max(1, Math.floor(stage));
  const rnd = mulberry32(seed);
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

  return { stage: n, waves, droneLevel, drones };
}

/** Прогресс состязаний живёт в браузере: серверным профилем не возимся. */
const COMP_KEY = "wb.competitionAt";

export function loadCompetitionAt() {
  if (typeof window === "undefined") return 1;
  try {
    const n = Number(window.localStorage.getItem(COMP_KEY));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  } catch {
    return 1;
  }
}

export function saveCompetitionAt(stage: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMP_KEY, String(Math.max(1, Math.floor(stage))));
  } catch {
    // приватный режим — номер просто не запомнится
  }
}
