"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GRID } from "@/lib/base";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  applyView,
  drawStatic,
  spritesVersion,
  type Scene,
  type View,
} from "@/lib/render";
import { Button } from "./ui";
import { useT } from "@/lib/i18n";
import ZonesToggle from "./ZonesToggle";

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
  /**
   * Карта, на которой ничего само не движется (лобби). Тогда кадр рисуется
   * не всегда, а только когда что-то поменялось: вид, сцена, React-рендер
   * или рука игрока на карте. В бою и на разведке этого ставить нельзя.
   */
  idle?: boolean;
  /**
   * Стартовать со всей картой в окне, без обрезки по короткой стороне. В
   * бою и на разведке надо видеть весь квадрат; в лобби — заполнить окно.
   */
  fit?: boolean;
  className?: string;
  /** Накладки поверх карты: например всплывающее сообщение. */
  children?: ReactNode;
  /**
   * Галочка «Зоны действия» в левом нижнем углу. Карта сама кругов не
   * рисует — их рисует overlay владельца, — а только держит переключатель
   * на одном и том же месте на всех картах.
   */
  zones?: { on: boolean; onChange: (on: boolean) => void };
}

/** Масштаб, при котором окно заполнено картой без пустых полей. */
const coverScale = (w: number, h: number) => Math.max(w, h) / SIZE;
/** Масштаб, при котором вся карта целиком влезает в окно. */
const fitScale = (w: number, h: number) => Math.min(w, h) / SIZE;
/** Пределы зума. Нижний — не выше «вся карта», чтобы к ней можно было вернуться. */
const zoomLimits = (w: number, h: number) => {
  const cover = coverScale(w, h);
  return { min: Math.min(cover * MIN_ZOOM, fitScale(w, h)), max: cover * MAX_ZOOM };
};

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
  idle = false,
  fit = false,
  className = "",
  children,
  zones,
}: MapCanvasProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // zoom здесь — экранных пикселей на игровой пиксель. На квадратном окне 700×700
  // это ровно 1, на вытянутом телефоне — больше, поэтому все пределы считаются
  // от cover (стартовый «вся карта»), а не от единицы.
  const viewRef = useRef<View>({ zoom: 1, panX: 0, panY: 0 });
  const viewDirty = useRef(true);
  const sceneRef = useRef(scene);
  const versionRef = useRef(-1);
  // версия сцены живёт в ref, чтобы цикл отрисовки не пересоздавался
  const sceneVersionRef = useRef(sceneVersion);
  const overlayRef = useRef(overlay);
  const idleRef = useRef(idle);
  /** До какого момента рисуем каждый кадр: рука на карте — значит рисуем. */
  const wakeUntil = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const panMoved = useRef(false);
  // размер окна карты в CSS-пикселях: карта занимает всё, что даёт родитель
  const [box, setBox] = useState({ w: 0, h: 0 });
  const boxSize = useRef(box);
  /** Стартовый масштаб — от него считается подпись «×» и кнопка сброса. */
  const baseZoom = useRef(1);
  const [zoom, setZoom] = useState(1);

  sceneRef.current = scene;
  overlayRef.current = overlay;
  idleRef.current = idle;
  sceneVersionRef.current = sceneVersion;
  boxSize.current = box;

  /**
   * Рука на карте — рисуем каждый кадр ещё секунду с небольшим: столько
   * живёт всплывающая цена после клика.
   */
  const wake = useCallback(() => {
    wakeUntil.current = performance.now() + 1300;
  }, []);

  const clampPan = useCallback((v: View) => {
    const { w, h } = boxSize.current;
    // мир уже окна — прижимаем к краям; шире — центрируем пустые поля
    const spanX = SIZE - w / v.zoom;
    const spanY = SIZE - h / v.zoom;
    v.panX = spanX < 0 ? spanX / 2 : Math.max(0, Math.min(spanX, v.panX));
    v.panY = spanY < 0 ? spanY / 2 : Math.max(0, Math.min(spanY, v.panY));
  }, []);

  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      const v = viewRef.current;
      const { w, h } = boxSize.current;
      if (!w || !h) return;
      const wx = v.panX + sx / v.zoom;
      const wy = v.panY + sy / v.zoom;
      // Пределы от cover — того же базового масштаба, от которого UI
      // считает «1×» / «вся карта». Раньше clamp шёл от fit, и на
      // неквадратном окне максимум получался ~4×(min/max) ≈ 3.1×.
      const { min, max } = zoomLimits(w, h);
      const next = Math.max(min, Math.min(max, v.zoom * factor));
      if (next === v.zoom) return;
      v.zoom = next;
      v.panX = wx - sx / v.zoom;
      v.panY = wy - sy / v.zoom;
      clampPan(v);
      viewDirty.current = true;
      setZoom(next);
    },
    [clampPan]
  );

  // размер окна карты. Мир квадратный, окно — какое дали: на телефоне
  // стартуем «в размер экрана», лишнюю высоту прокручиваем пальцем.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(0, el.clientWidth);
      const h = Math.max(0, el.clientHeight);
      if (!w || !h) return;
      const prev = boxSize.current;
      if (prev.w === w && prev.h === h) return;
      boxSize.current = { w, h };
      const v = viewRef.current;
      const base = fit ? fitScale(w, h) : coverScale(w, h);
      const { min, max } = zoomLimits(w, h);
      if (!prev.w || !prev.h) {
        baseZoom.current = base;
        v.zoom = base;
        v.panX = (SIZE - w / v.zoom) / 2;
        v.panY = (SIZE - h / v.zoom) / 2;
      } else if (prev.w !== w) {
        // поворот или ресайз окна: держим ту же кратность приближения
        const rel = v.zoom / baseZoom.current;
        baseZoom.current = base;
        v.zoom = Math.max(min, Math.min(max, base * rel));
      }
      // сменилась только высота (выехала панель) — вид не трогаем,
      // иначе карта прыгала бы от каждой всплывающей полосы
      clampPan(v);
      viewDirty.current = true;
      setZoom(v.zoom);
      setBox({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampPan, fit]);

  // колесо и щипок на трекпаде. Слушатель вешаем вручную: React-обработчик
  // пассивный и не даст отменить зум страницы.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /**
     * Колесо всегда зумит — привычка мыши. Щипок по тачпаду приходит как
     * wheel с ctrlKey и тоже зумит (чуть резче). Карту тащат средней/правой
     * кнопкой или двумя пальцами; кнопки +/− рядом с масштабом — запасной
     * путь, когда колеса нет.
     */
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wake();
      const r = canvas.getBoundingClientRect();
      zoomAt(
        Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)),
        e.clientX - r.left,
        e.clientY - r.top
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt, wake]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const { w, h } = box;
    if (!canvas || !w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layer = document.createElement("canvas");
    layer.width = w * dpr;
    layer.height = h * dpr;
    const lctx = layer.getContext("2d");
    if (!lctx) return;

    versionRef.current = -1;
    viewDirty.current = true;

    let raf = 0;
    let drawn: MapCanvasProps["overlay"] = undefined;
    // догрузилась картинка установки — слой с установками пора перерисовать
    let sprites = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const view = viewRef.current;
      const staticStale =
        viewDirty.current ||
        versionRef.current !== sceneVersionRef.current ||
        sprites !== spritesVersion();
      sprites = spritesVersion();
      // Свежее замыкание overlay значит, что React перерисовал родителя, —
      // это и есть сигнал, что накладке есть что показать нового.
      const overlayStale = drawn !== overlayRef.current;
      drawn = overlayRef.current;
      if (idleRef.current && !staticStale && !overlayStale && now > wakeUntil.current) {
        return;
      }

      if (staticStale) {
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, w * dpr, h * dpr);
        applyView(lctx, dpr, view);
        // Рисуем только то, что видно: на приближении это десятки клеток
        // вместо десяти тысяч.
        drawStatic(lctx, sceneRef.current, CELL, view.zoom, {
          x0: Math.floor(view.panX / CELL),
          y0: Math.floor(view.panY / CELL),
          x1: Math.ceil((view.panX + w / view.zoom) / CELL),
          y1: Math.ceil((view.panY + h / view.zoom) / CELL),
        });
        viewDirty.current = false;
        versionRef.current = sceneVersionRef.current;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w * dpr, h * dpr);
      ctx.drawImage(layer, 0, 0);
      applyView(ctx, dpr, view);
      overlayRef.current?.(ctx, now, view);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [box]);

  const toPt = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (v.panX + (e.clientX - r.left) / v.zoom) / CELL,
      y: (v.panY + (e.clientY - r.top) / v.zoom) / CELL,
    };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    wake();
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
    // Тащат средней кнопкой или правой: средняя — привычка любого редактора,
    // правая осталась ради тех, у кого средней нет.
    if (e.button === 1 || e.button === 2) {
      pan.current = { x: e.clientX, y: e.clientY };
      panMoved.current = false;
      return;
    }
    onDown?.(toPt(e), e.button);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    wake();
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
        v.panX -= (cx - prev.cx) / v.zoom;
        v.panY -= (cy - prev.cy) / v.zoom;
        clampPan(v);
        viewDirty.current = true;
        if (prev.dist > 0) {
          zoomAt(dist / prev.dist, cx - r.left, cy - r.top);
        }
      }
      pinch.current = { dist, cx, cy };
      return;
    }

    if (pan.current) {
      const v = viewRef.current;
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) panMoved.current = true;
      v.panX -= dx / v.zoom;
      v.panY -= dy / v.zoom;
      clampPan(v);
      viewDirty.current = true;
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }

    onMove?.(toPt(e));
  };

  const handleUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    wake();
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
    const { w, h } = boxSize.current;
    const v = viewRef.current;
    v.zoom = baseZoom.current;
    v.panX = (SIZE - w / v.zoom) / 2;
    v.panY = (SIZE - h / v.zoom) / 2;
    clampPan(v);
    viewDirty.current = true;
    setZoom(v.zoom);
  };

  const shown = zoom / (baseZoom.current || 1);

  return (
    <div
      ref={boxRef}
      className={`relative overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-lg ${className}`}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={() => {
          wake();
          pan.current = null;
          onLeave?.();
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor, width: box.w || undefined, height: box.h || undefined }}
        className="block touch-none select-none [image-rendering:pixelated]"
      />
      {/* Зум кнопками — запасной путь без колеса; колесо само по себе зумит. */}
      <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/50 px-1 py-0.5 font-mono text-xs text-white">
        <button
          type="button"
          aria-label={t("map.zoomOut")}
          title={t("map.zoomOut")}
          onClick={() => zoomAt(1 / 1.4, box.w / 2, box.h / 2)}
          className="flex h-5 w-5 items-center justify-center rounded transition hover:bg-white/20"
        >
          −
        </button>
        <span className="min-w-8 text-center">{shown.toFixed(1)}×</span>
        <button
          type="button"
          aria-label={t("map.zoomIn")}
          title={t("map.zoomIn")}
          onClick={() => zoomAt(1.4, box.w / 2, box.h / 2)}
          className="flex h-5 w-5 items-center justify-center rounded transition hover:bg-white/20"
        >
          +
        </button>
      </div>
      {shown > 1.01 && (
        <Button
          size="sm"
          onClick={resetView}
          className="absolute right-2 top-2 border-transparent bg-black/50 font-normal text-white hover:bg-black/70"
        >
          {t("map.wholeMap")}
        </Button>
      )}
      {zones && (
        <ZonesToggle
          on={zones.on}
          onChange={zones.onChange}
          className="absolute bottom-2 left-2 z-10 rounded bg-black/50 px-2 py-1 text-white"
        />
      )}
      {children}
    </div>
  );
}
