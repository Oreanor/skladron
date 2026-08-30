"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GRID } from "@/lib/base";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  applyView,
  drawStatic,
  type Scene,
  type View,
} from "@/lib/render";

export const CELL = 7; // px на клетку в логических координатах
export const SIZE = GRID * CELL;

export interface Pt {
  x: number; // клетки, дробные
  y: number;
}

export interface MapCanvasProps {
  scene: Scene;
  /** Меняется — статичный слой перерисовывается. */
  sceneVersion: number;
  /** Рисуется поверх статики каждый кадр, в координатах карты. */
  overlay?: (ctx: CanvasRenderingContext2D, now: number, view: View) => void;
  onDown?: (p: Pt, button: number) => void;
  onMove?: (p: Pt) => void;
  onUp?: (p: Pt) => void;
  /** ПКМ без перетаскивания — правая кнопка иначе занята панорамированием. */
  onRightClick?: (p: Pt) => void;
  onLeave?: () => void;
  cursor?: string;
  className?: string;
}

export default function MapCanvas({
  scene,
  sceneVersion,
  overlay,
  onDown,
  onMove,
  onUp,
  onRightClick,
  onLeave,
  cursor = "crosshair",
  className = "",
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ zoom: 1, panX: 0, panY: 0 });
  const viewDirty = useRef(true);
  const sceneRef = useRef(scene);
  const versionRef = useRef(-1);
  // версия сцены живёт в ref, чтобы цикл отрисовки не пересоздавался
  const sceneVersionRef = useRef(sceneVersion);
  const overlayRef = useRef(overlay);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const panMoved = useRef(false);
  const [zoom, setZoom] = useState(1);

  sceneRef.current = scene;
  overlayRef.current = overlay;
  sceneVersionRef.current = sceneVersion;

  const clampPan = (v: View) => {
    const span = SIZE - SIZE / v.zoom;
    v.panX = Math.max(0, Math.min(span, v.panX));
    v.panY = Math.max(0, Math.min(span, v.panY));
  };

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    const v = viewRef.current;
    const wx = v.panX + sx / v.zoom;
    const wy = v.panY + sy / v.zoom;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
    if (next === v.zoom) return;
    v.zoom = next;
    v.panX = wx - sx / v.zoom;
    v.panY = wy - sy / v.zoom;
    clampPan(v);
    viewDirty.current = true;
    setZoom(next);
  }, []);

  // колесо и щипок на трекпаде. Слушатель вешаем вручную: React-обработчик
  // пассивный и не даст отменить зум страницы.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * SIZE;
      const sy = ((e.clientY - r.top) / r.height) * SIZE;
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), sx, sy);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layer = document.createElement("canvas");
    layer.width = SIZE * dpr;
    layer.height = SIZE * dpr;
    const lctx = layer.getContext("2d");
    if (!lctx) return;

    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const view = viewRef.current;

      if (viewDirty.current || versionRef.current !== sceneVersionRef.current) {
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, SIZE * dpr, SIZE * dpr);
        applyView(lctx, dpr, view);
        drawStatic(lctx, sceneRef.current, CELL, view.zoom);
        viewDirty.current = false;
        versionRef.current = sceneVersionRef.current;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, SIZE * dpr, SIZE * dpr);
      ctx.drawImage(layer, 0, 0);
      applyView(ctx, dpr, view);
      overlayRef.current?.(ctx, now, view);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toPt = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = viewRef.current;
    const sx = ((e.clientX - r.left) / r.width) * SIZE;
    const sy = ((e.clientY - r.top) / r.height) * SIZE;
    return { x: (v.panX + sx / v.zoom) / CELL, y: (v.panY + sy / v.zoom) / CELL };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // указатель уже отпущен
    }
    if (pointers.current.size >= 2) {
      pinch.current = null;
      onLeave?.(); // второй палец — это жест камеры, а не игра
      return;
    }
    if (e.button === 2) {
      pan.current = { x: e.clientX, y: e.clientY };
      panMoved.current = false;
      return;
    }
    onDown?.(toPt(e), e.button);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pts = pointers.current;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const prev = pinch.current;
      if (prev) {
        const r = e.currentTarget.getBoundingClientRect();
        const v = viewRef.current;
        v.panX -= ((cx - prev.cx) / r.width) * (SIZE / v.zoom);
        v.panY -= ((cy - prev.cy) / r.height) * (SIZE / v.zoom);
        clampPan(v);
        viewDirty.current = true;
        if (prev.dist > 0) {
          zoomAt(
            dist / prev.dist,
            ((cx - r.left) / r.width) * SIZE,
            ((cy - r.top) / r.height) * SIZE
          );
        }
      }
      pinch.current = { dist, cx, cy };
      return;
    }

    if (pan.current) {
      const r = e.currentTarget.getBoundingClientRect();
      const v = viewRef.current;
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) panMoved.current = true;
      v.panX -= (dx / r.width) * (SIZE / v.zoom);
      v.panY -= (dy / r.height) * (SIZE / v.zoom);
      clampPan(v);
      viewDirty.current = true;
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }

    onMove?.(toPt(e));
  };

  const handleUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasPan = pan.current !== null;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    pan.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // захвата не было
    }
    if (wasPan) {
      if (!panMoved.current) onRightClick?.(toPt(e));
    } else {
      onUp?.(toPt(e));
    }
  };

  const resetView = () => {
    viewRef.current = { zoom: 1, panX: 0, panY: 0 };
    viewDirty.current = true;
    setZoom(1);
  };

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={() => {
          pan.current = null;
          onLeave?.();
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor }}
        className="aspect-square w-full touch-none select-none rounded-md border border-neutral-700 bg-neutral-900 shadow-lg [image-rendering:pixelated]"
      />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-1 font-mono text-xs text-neutral-200">
        {zoom.toFixed(1)}×
      </div>
      {zoom > 1 && (
        <button
          onClick={resetView}
          className="absolute right-2 top-2 rounded bg-black/50 px-2 py-1 text-xs text-neutral-200 hover:bg-black/70"
        >
          Вся карта
        </button>
      )}
    </div>
  );
}
