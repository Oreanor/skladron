// Враги и отправка атак. Пока всё локально: склад врага генерится, а исход
// налёта считается тем же движком вхолостую — на этапе 3 вместо этого будет
// живой игрок, отыгрывающий бой у себя.

import {
  type Depot,
  type DroneKind,
  depotKind,
  GRID,
  G_BASE,
  type Gun,
  type Rect,
  applyRect,
  decodeCells,
  emptyCells,
  encodeCells,
  normRect,
} from "./base";
import { ATTACK_LEAK_REWARD } from "./economy";
import {
  MAX_RAID,
  type AttackOrder,
  type Pattern,
  buildPlan,
  makeOrder,
  mulberry32,
  raidDifficulty,
  raidSize,
} from "./attack";
import { type BattleResult, createBattle, extinguish, update } from "./engine";

export const MAX_ATTACK_DRONES = MAX_RAID;
export const DEFENDER_HOSE = 1.6; // клеток в секунду тушит враг-бот

/** Что удалось снять разведкой: карта врага и маска того, что мы видели. */
export interface ScoutSnapshot {
  /** Маска снятого, RLE по клеткам: 1 — видели, 0 — туман. */
  seen: string;
  /** Карта врага на момент съёмки, RLE. */
  cells: string;
  guns: Gun[];
  at: number;
}

export interface Enemy {
  id: string;
  name: string;
  email: string;
  cells: string; // склад врага, base64
  guns: Gun[];
  depots: Depot[];
  burnedByMe: number; // счёт вражды
  burnedByThem: number;
  lastRaidAt: number; // когда он присылал последнюю атаку
  /** Последняя разведка. Держится, пока не слетаешь заново. */
  scout?: ScoutSnapshot;
}

/** Склад врага: несколько сросшихся прямоугольников вокруг центра. */
function genBase(rnd: () => number) {
  const cells = emptyCells();
  const sizes: Array<[number, number]> = [
    [10, 16],
    [16, 10],
    [8, 6],
    [6, 8],
    [12, 7],
    [7, 12],
  ];
  const pick = () => sizes[(rnd() * sizes.length) | 0];
  const rects: Rect[] = [];
  const [w0, h0] = pick();
  rects.push({ x: ((GRID - w0) / 2) | 0, y: ((GRID - h0) / 2) | 0, w: w0, h: h0 });

  const count = 4 + ((rnd() * 3) | 0);
  while (rects.length < count) {
    const base = rects[(rnd() * rects.length) | 0];
    const [w, h] = pick();
    const side = (rnd() * 4) | 0;
    const over = 1 + ((rnd() * 2) | 0);
    let x: number;
    let y: number;
    if (side === 0) {
      x = base.x + base.w - over;
      y = base.y + ((rnd() * base.h) | 0) - (h >> 1);
    } else if (side === 1) {
      x = base.x - w + over;
      y = base.y + ((rnd() * base.h) | 0) - (h >> 1);
    } else if (side === 2) {
      x = base.x + ((rnd() * base.w) | 0) - (w >> 1);
      y = base.y + base.h - over;
    } else {
      x = base.x + ((rnd() * base.w) | 0) - (h >> 1);
      y = base.y - h + over;
    }
    rects.push({
      x: Math.max(12, Math.min(GRID - 12 - w, x)),
      y: Math.max(12, Math.min(GRID - 12 - h, y)),
      w,
      h,
    });
  }
  for (const r of rects) applyRect(cells, normRect(r));
  return cells;
}

/** Пока склад не назван, зовём врага по адресу — но не выдуманным именем. */
export const nameFromEmail = (email: string) => email.split("@")[0] || email;

export function makeEnemy(
  email: string,
  name = nameFromEmail(email),
  seed = (Math.random() * 1e9) | 0
): Enemy {
  const rnd = mulberry32(seed);
  const cells = genBase(rnd);

  // пушки враг ставит вразброс по своему складу
  const spots: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === G_BASE) spots.push(i);
  const guns: Gun[] = [];
  const gunCount = 6 + ((rnd() * 8) | 0);
  for (let k = 0; k < gunCount && spots.length; k++) {
    const i = spots[(rnd() * spots.length) | 0];
    const gx = i % GRID;
    const gy = (i / GRID) | 0;
    if (guns.some((g) => g.cx === gx && g.cy === gy)) continue;
    guns.push({ cx: gx, cy: gy });
  }

  return {
    id: `${Date.now().toString(36)}-${(rnd() * 1e6) | 0}`,
    name,
    email,
    cells: encodeCells(cells),
    guns,
    depots: [],
    burnedByMe: 0,
    burnedByThem: 0,
    lastRaidAt: 0,
  };
}

/** Снимает дронов с контейнеров, начиная с последних. Возвращает, сколько взял. */
export function takeDrones(depots: Depot[], count: number, kind?: DroneKind) {
  let left = count;
  for (let i = depots.length - 1; i >= 0 && left > 0; i--) {
    if (kind && depotKind(depots[i]) !== kind) continue;
    const take = Math.min(depots[i].n, left);
    depots[i].n -= take;
    left -= take;
    if (depots[i].n === 0) depots.splice(i, 1);
  }
  return count - left;
}

export interface RaidOutcome {
  result: BattleResult;
  loot: number;
  destroyed: boolean; // склад врага выгорел полностью
  order: AttackOrder;
}

/**
 * Считает налёт на врага вхолостую: работают его пушки и пожарный расчёт,
 * но пулемёта у бота нет — это привилегия живого игрока. Урон остаётся
 * на складе врага до следующего раза.
 */
export function raid(
  enemy: Enemy,
  drones: number,
  pattern: Pattern,
  direction: number,
  myName: string
): RaidOutcome {
  const order = makeOrder(myName, drones, pattern, direction);
  const cells = decodeCells(enemy.cells);
  const s = createBattle(cells, enemy.guns, enemy.depots, buildPlan(order));

  let t = 0;
  let hose = 0;
  while (t < 900 && s.phase === "playing") {
    update(s, 1 / 60);
    t += 1 / 60;

    // враг тушит: медленнее живого игрока с брандспойтом, но не сидит сложа руки
    hose += 1 / 60;
    while (hose >= 1 / DEFENDER_HOSE && s.fire.size > 0) {
      hose -= 1 / DEFENDER_HOSE;
      const i = s.fire.keys().next().value as number;
      extinguish(s, i % GRID, (i / GRID) | 0);
    }
  }

  // то, что горело к концу, дотлевает
  for (const i of s.fire.keys()) s.cells[i] = 3;
  enemy.cells = encodeCells(s.cells);
  enemy.guns = s.guns.filter((g) => g.alive).map((g) => ({ cx: g.cx, cy: g.cy }));
  enemy.depots = s.depots;
  enemy.burnedByMe += s.result.burned;

  return {
    result: s.result,
    loot: s.result.leaked * ATTACK_LEAK_REWARD,
    destroyed: s.baseOk <= 0,
    order,
  };
}

/** Ответный налёт врага: чем больше ты ему сжёг, тем злее ответ. */
export function counterRaid(
  enemy: Enemy,
  defence: { guns: number; intact: number },
  now = Date.now()
): AttackOrder | null {
  if (now - enemy.lastRaidAt < 30_000) return null; // не чаще раза в полминуты
  enemy.lastRaidAt = now;
  const patterns: Pattern[] = ["swarm", "lines", "random", "drip"];
  // за сожжённое у него мстят злее, но потолок всё тот же
  const spite = 1 + Math.min(0.5, enemy.burnedByMe / 800);
  const size = raidSize(defence.guns, defence.intact, raidDifficulty() * spite);
  return makeOrder(
    enemy.name,
    size,
    patterns[(Math.random() * patterns.length) | 0],
    (Math.random() * 4) | 0
  );
}
