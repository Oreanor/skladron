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
export interface Depot {
  cx: number;
  cy: number;
  n: number;
}

export const DRONES_PER_CELL = 10;

export const droneCount = (depots: Depot[]) =>
  depots.reduce((sum, d) => sum + d.n, 0);

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

/** Раскладывает новые контейнеры по первым свободным клеткам. */
export function placeDepots(
  cells: Uint8Array,
  guns: Gun[],
  depots: Depot[],
  count: number
): Depot[] {
  const free = freeCells(cells, guns, depots);
  const added: Depot[] = [];
  for (let k = 0; k < count && k < free.length; k++) {
    added.push({ cx: free[k] % GRID, cy: (free[k] / GRID) | 0, n: DRONES_PER_CELL });
  }
  return added;
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
