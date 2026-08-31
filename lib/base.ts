// Склад: клетки, их состояния, проверки и раскладка прямоугольников.

export const GRID = 100;
export const CELLS = GRID * GRID;

export const G_GROUND = 0;
export const G_BASE = 1;
export const G_FIRE = 2;
export const G_BURNT = 3;
export const G_SCORCH = 4;

export const idx = (x: number, y: number) => y * GRID + x;
export const isBuilding = (v: number) =>
  v === G_BASE || v === G_FIRE || v === G_BURNT;

export interface Gun {
  cx: number;
  cy: number;
}

/** Контейнер с дронами: занимает клетку склада, вмещает DRONES_PER_CELL штук. */
/** Что лежит в контейнере: ударные дроны или разведчики. */
export type DroneKind = "basic" | "scout";

export interface Depot {
  cx: number;
  cy: number;
  n: number;
  /** Отсутствует — значит обычные: так старые сохранения читаются как есть. */
  kind?: DroneKind;
}

export const depotKind = (d: Depot): DroneKind => d.kind ?? "basic";

export const DRONES_PER_CELL = 10;

export const droneCount = (depots: Depot[], kind?: DroneKind) =>
  depots.reduce((sum, d) => (kind && depotKind(d) !== kind ? sum : sum + d.n), 0);

/** Клетки, куда можно поставить контейнер: целые, без пушки и без склада. */
export function freeCells(cells: Uint8Array, guns: Gun[], depots: Depot[]) {
  const taken = new Set<number>();
  for (const g of guns) taken.add(idx(g.cx, g.cy));
  for (const d of depots) taken.add(idx(d.cx, d.cy));
  const out: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === G_BASE && !taken.has(i)) out.push(i);
  }
  return out;
}

/**
 * Сколько целых клеток свободно. То же, что freeCells().length, но без
 * массива на тысячи элементов: в лобби это считается на каждый рендер.
 */
export function countFreeCells(cells: Uint8Array, guns: Gun[], depots: Depot[]) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] === G_BASE) n++;
  for (const g of guns) if (cells[idx(g.cx, g.cy)] === G_BASE) n--;
  for (const d of depots) if (cells[idx(d.cx, d.cy)] === G_BASE) n--;
  return Math.max(0, n);
}

/** Манхэттеново расстояние от каждой клетки до ближайшей клетки из sources. */
function distanceField(sources: number[]) {
  const far = GRID * 2;
  const distance = new Int16Array(CELLS);
  distance.fill(far);
  if (sources.length === 0) return distance;

  const queue = new Int32Array(CELLS);
  let head = 0;
  let tail = 0;
  for (const i of sources) {
    if (i < 0 || i >= CELLS || distance[i] === 0) continue;
    distance[i] = 0;
    queue[tail++] = i;
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % GRID;
    const next = distance[i] + 1;
    const visit = (n: number) => {
      if (distance[n] <= next) return;
      distance[n] = next;
      queue[tail++] = n;
    };
    if (x > 0) visit(i - 1);
    if (x < GRID - 1) visit(i + 1);
    if (i >= GRID) visit(i - GRID);
    if (i < CELLS - GRID) visit(i + GRID);
  }
  return distance;
}

/**
 * Раскладывает новые контейнеры по целым свободным клеткам. Первым делом
 * уходит подальше от пепелища, дальше держится середины склада — по краям
 * контейнер сгорает первым, — и лишь при прочих равных расходится в стороны,
 * чтобы не выстраиваться в один ряд.
 */
export function placeDepots(
  cells: Uint8Array,
  guns: Gun[],
  depots: Depot[],
  count: number
): Depot[] {
  const free = freeCells(cells, guns, depots);
  if (count <= 0 || free.length === 0) return [];

  const burnt: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === G_BURNT) burnt.push(i);
  }
  const safety = distanceField(burnt);
  const occupied = depots.map((d) => idx(d.cx, d.cy));
  const separation = distanceField(occupied);
  let hasAnchor = occupied.length > 0;
  const used = new Set<number>();
  // Середину считаем по всему складу, а не по свободным клеткам: иначе она
  // уползала бы вслед за уже занятыми местами.
  let sumX = 0;
  let sumY = 0;
  let n = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== G_BASE) continue;
    sumX += i % GRID;
    sumY += (i / GRID) | 0;
    n++;
  }
  const centerX = n ? sumX / n : GRID / 2;
  const centerY = n ? sumY / n : GRID / 2;
  const added: Depot[] = [];

  for (let k = 0; k < count && k < free.length; k++) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of free) {
      if (used.has(i)) continue;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const centerDistance = (x - centerX) ** 2 + (y - centerY) ** 2;
      // Ступень безопасности от пепелища важнее всего; дальше тянем к
      // середине, а расстояние между контейнерами работает лишь как
      // разводящая добавка при примерно равной удалённости от центра.
      const score =
        Math.min(safety[i], GRID) * 1000 -
        centerDistance +
        (hasAnchor ? separation[i] * 4 : 0);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0) break;

    used.add(best);
    const bx = best % GRID;
    const by = (best / GRID) | 0;
    added.push({ cx: bx, cy: by, n: DRONES_PER_CELL });

    // После каждого выбора обновляем расстояние до ближайшего уже занятого
    // места; так следующая коробка уходит в другую часть склада.
    for (const i of free) {
      const d = Math.abs((i % GRID) - bx) + Math.abs(((i / GRID) | 0) - by);
      if (!hasAnchor || d < separation[i]) separation[i] = d;
    }
    hasAnchor = true;
  }
  return added;
}

/**
 * Добавляет точное количество дронов: сперва заполняет неполные контейнеры,
 * затем создаёт столько новых контейнеров, сколько действительно нужно.
 * Исходный массив не меняется; null означает, что свободного места не хватило.
 */
export function storeDrones(
  cells: Uint8Array,
  guns: Gun[],
  depots: Depot[],
  amount: number,
  kind: DroneKind = "basic"
): Depot[] | null {
  if (!Number.isInteger(amount) || amount < 1) return null;
  const next = depots.map((depot) => ({ ...depot }));
  let left = amount;

  for (const depot of next) {
    if (left <= 0) break;
    if (depotKind(depot) !== kind) continue; // в один ящик кладём один вид
    const add = Math.min(left, DRONES_PER_CELL - depot.n);
    if (add <= 0) continue;
    depot.n += add;
    left -= add;
  }

  if (left <= 0) return next;
  const cellsNeeded = Math.ceil(left / DRONES_PER_CELL);
  const added = placeDepots(cells, guns, next, cellsNeeded);
  if (added.length < cellsNeeded) return null;
  for (const depot of added) {
    depot.kind = kind;
    depot.n = Math.min(left, DRONES_PER_CELL);
    left -= depot.n;
  }
  return [...next, ...added];
}

/**
 * Всё здание одним куском? Проверяем перед сносом: продать середину и
 * оставить две половинки на разных концах поля нельзя.
 */
export function isWhole(cells: Uint8Array) {
  let start = -1;
  let total = 0;
  for (let i = 0; i < cells.length; i++) {
    if (!isBuilding(cells[i])) continue;
    total++;
    if (start < 0) start = i;
  }
  if (total === 0) return true;

  const seen = new Uint8Array(CELLS);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  let found = 0;
  while (head < tail) {
    const i = queue[head++];
    found++;
    const x = i % GRID;
    const step = (n: number) => {
      if (seen[n] || !isBuilding(cells[n])) return;
      seen[n] = 1;
      queue[tail++] = n;
    };
    if (x > 0) step(i - 1);
    if (x < GRID - 1) step(i + 1);
    if (i >= GRID) step(i - GRID);
    if (i < CELLS - GRID) step(i + GRID);
  }
  return found === total;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function emptyCells() {
  return new Uint8Array(CELLS);
}

/** После боя земля мгновенно зарастает: выжженные отметины не храним. */
export function regrowGround(cells: Uint8Array): Uint8Array {
  let next: Uint8Array | null = null;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== G_SCORCH) continue;
    if (!next) next = cells.slice();
    next[i] = G_GROUND;
  }
  return next ?? cells;
}

export function countCells(cells: Uint8Array, value: number) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] === value) n++;
  return n;
}

/** Прямоугольник, приведённый к целым клеткам и обрезанный по карте. */
export function normRect(r: Rect): Rect {
  const x0 = Math.max(0, Math.min(GRID - 1, Math.floor(Math.min(r.x, r.x + r.w))));
  const y0 = Math.max(0, Math.min(GRID - 1, Math.floor(Math.min(r.y, r.y + r.h))));
  const x1 = Math.max(0, Math.min(GRID, Math.ceil(Math.max(r.x, r.x + r.w))));
  const y1 = Math.max(0, Math.min(GRID, Math.ceil(Math.max(r.y, r.y + r.h))));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function forEachCell(r: Rect, fn: (x: number, y: number, i: number) => void) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) fn(x, y, idx(x, y));
  }
}

/** Сколько клеток прямоугольника ещё не застроено — за них и платим. */
export function newCellsIn(cells: Uint8Array, r: Rect) {
  let n = 0;
  forEachCell(r, (_x, _y, i) => {
    if (!isBuilding(cells[i])) n++;
  });
  return n;
}

/** Есть ли у клетки сосед-здание по стороне (по диагонали не считается). */
export function touchesBuilding(cells: Uint8Array, x: number, y: number) {
  if (x > 0 && isBuilding(cells[idx(x - 1, y)])) return true;
  if (x < GRID - 1 && isBuilding(cells[idx(x + 1, y)])) return true;
  if (y > 0 && isBuilding(cells[idx(x, y - 1)])) return true;
  if (y < GRID - 1 && isBuilding(cells[idx(x, y + 1)])) return true;
  return false;
}

/**
 * Можно ли пристроить прямоугольник: он должен либо перекрывать здание,
 * либо касаться его стороной. Первую фигуру ставим куда угодно.
 */
export function rectConnects(cells: Uint8Array, r: Rect, hasBuilding: boolean) {
  if (!hasBuilding) return true;
  if (r.w <= 0 || r.h <= 0) return false;
  let ok = false;
  forEachCell(r, (x, y, i) => {
    if (ok) return;
    if (isBuilding(cells[i]) || touchesBuilding(cells, x, y)) ok = true;
  });
  return ok;
}

/** Застраивает прямоугольник. Уже застроенные клетки не трогаем. */
export function applyRect(cells: Uint8Array, r: Rect) {
  forEachCell(r, (_x, _y, i) => {
    if (!isBuilding(cells[i])) cells[i] = G_BASE;
  });
}

/**
 * Карта нового игрока: стартовый склад STARTER_SIDE×STARTER_SIDE уже стоит
 * посреди поля. Дальше игрок пристраивает за свои.
 */
export function starterCells(side: number): Uint8Array {
  const cells = emptyCells();
  const x0 = ((GRID - side) / 2) | 0;
  const y0 = ((GRID - side) / 2) | 0;
  for (let y = y0; y < y0 + side; y++) {
    for (let x = x0; x < x0 + side; x++) cells[idx(x, y)] = G_BASE;
  }
  return cells;
}

// --- хранение ---

/**
 * Карта для сервера, сжатая по длинам серий: «значение:сколько подряд»
 * через запятую. Склад — это несколько прямоугольников на пустом поле,
 * поэтому 10 000 клеток укладываются в несколько сотен байт вместо 13 КБ
 * base64, которые уходили на каждую правку.
 */
export function encodeRle(cells: Uint8Array): string {
  const runs: string[] = [];
  let value = cells[0];
  let run = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === value) {
      run++;
      continue;
    }
    runs.push(`${value}:${run}`);
    value = cells[i];
    run = 1;
  }
  runs.push(`${value}:${run}`);
  return runs.join(",");
}

/** Обратная к encodeRle: разворачивает «значение:сколько» в массив клеток. */
export function decodeRle(src: string, size = CELLS): Uint8Array {
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of src.split(",")) {
    const [v, n] = part.split(":").map(Number);
    if (!Number.isFinite(v) || !Number.isFinite(n) || n < 1) break;
    const end = Math.min(size, at + n);
    if (v !== 0) out.fill(v, at, end);
    at = end;
    if (at >= size) break;
  }
  return out;
}

export function encodeCells(cells: Uint8Array): string {
  let s = "";
  for (let i = 0; i < cells.length; i++) s += String.fromCharCode(cells[i]);
  return typeof btoa === "function" ? btoa(s) : Buffer.from(cells).toString("base64");
}

export function decodeCells(text: string): Uint8Array {
  if (typeof atob === "function") {
    const s = atob(text);
    const out = new Uint8Array(CELLS);
    for (let i = 0; i < Math.min(s.length, CELLS); i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const buf = Buffer.from(text, "base64");
  const out = new Uint8Array(CELLS);
  out.set(buf.subarray(0, CELLS));
  return out;
}

/** Сколько сгоревших клеток попало в рамку — по ним и считается ремонт. */
export function burntCellsIn(cells: Uint8Array, r: Rect) {
  let n = 0;
  forEachCell(r, (_x, _y, i) => {
    if (cells[i] === G_BURNT) n++;
  });
  return n;
}

/** Сносит сгоревшие клетки в рамке: остаётся голая земля. */
export function scrapRect(cells: Uint8Array, r: Rect) {
  let n = 0;
  forEachCell(r, (_x, _y, i) => {
    if (cells[i] === G_BURNT) {
      cells[i] = G_GROUND;
      n++;
    }
  });
  return n;
}

/** Чинит все сгоревшие клетки внутри рамки. Возвращает, сколько починил. */
export function repairRect(cells: Uint8Array, r: Rect) {
  let n = 0;
  forEachCell(r, (_x, _y, i) => {
    if (cells[i] === G_BURNT) {
      cells[i] = G_BASE;
      n++;
    }
  });
  return n;
}
