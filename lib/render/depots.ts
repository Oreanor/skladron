import type { GameState } from "../engine";
import { drawDepots } from "./pieces";

const layers = new WeakMap<CanvasRenderingContext2D, {
  state: GameState;
  count: number;
  cell: number;
  transform: DOMMatrix;
  layer: HTMLCanvasElement;
}>();

/** В бою контейнеры неподвижны: меняются только при сгорании (удалении). */
export function drawBattleDepots(ctx: CanvasRenderingContext2D, s: GameState, cell: number) {
  // Для небольшого склада отдельный полноэкранный слой дороже самих ящиков.
  if (s.depots.length < 64 || typeof document === "undefined") {
    layers.delete(ctx);
    drawDepots(ctx, s.depots, cell);
    return;
  }
  const transform = ctx.getTransform();
  const { width, height } = ctx.canvas;
  let cached = layers.get(ctx);
  const prev = cached?.transform;
  if (!cached || cached.state !== s || cached.count !== s.depots.length ||
      cached.cell !== cell || cached.layer.width !== width || cached.layer.height !== height ||
      !prev || prev.a !== transform.a || prev.b !== transform.b ||
      prev.c !== transform.c || prev.d !== transform.d ||
      prev.e !== transform.e || prev.f !== transform.f) {
    const layer = cached?.layer ?? document.createElement("canvas");
    if (layer.width !== width) layer.width = width;
    if (layer.height !== height) layer.height = height;
    const g = layer.getContext("2d");
    if (!g) {
      drawDepots(ctx, s.depots, cell);
      return;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, width, height);
    // Кэш в разрешении окна: не теряет резкости при DPR, зуме и панорамировании.
    g.setTransform(transform);
    drawDepots(g, s.depots, cell);
    cached = { state: s, count: s.depots.length, cell, transform, layer };
    layers.set(ctx, cached);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cached.layer, 0, 0);
  ctx.restore();
}
