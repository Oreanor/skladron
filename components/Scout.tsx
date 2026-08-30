"use client";

// Экран разведки. Карта врага под туманом; самолёт заходит с края и снимает
// круг вокруг себя. Оружия у игрока нет — только руль и чужие пушки, в зону
// которых лучше не влетать.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CELLS, GRID, type Gun } from "@/lib/base";
import { GUN_RANGE } from "@/lib/engine";
import { COLORS, drawCoverage } from "@/lib/render";
import {
  SCOUT_RADIUS,
  createScout,
  seenShare,
  underFire,
  updateScout,
  type ScoutState,
} from "@/lib/scout";
import { useT } from "@/lib/i18n";
import MapCanvas, { CELL, SIZE } from "./MapCanvas";
import { Button, Chip, ChipBar, Row } from "./ui";

export interface ScoutOutcome {
  seen: Uint8Array;
  cells: Uint8Array;
  guns: Gun[];
  lost: number;
}

interface Props {
  name: string;
  cells: Uint8Array;
  guns: Gun[];
  planes: number;
  /** Уже снятое раньше: новый вылет дополняет старую карту, а не стирает её. */
  known?: Uint8Array | null;
  onFinish: (o: ScoutOutcome) => void;
}

/** За сколько секунд клетка проявляется из тумана. */
const FADE = 0.35;

interface Hud {
  left: number;
  lost: number;
  share: number;
  danger: boolean;
  flying: boolean;
}

export default function Scout({ name, cells, guns, planes, known, onFinish }: Props) {
  const t = useT();
  const stateRef = useRef<ScoutState | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [done, setDone] = useState<ScoutOutcome | null>(null);
  const finished = useRef(false);

  if (!stateRef.current) {
    const s = createScout(cells, guns, planes);
    // старую съёмку переносим сразу: она уже наша и туман по ней снят
    if (known && known.length === CELLS) {
      s.seen.set(known);
      for (let i = 0; i < CELLS; i++) if (known[i]) s.fresh.push(i);
    }
    stateRef.current = s;
  }
  const s = stateRef.current;

  // Карта врага целиком лежит в статичном слое, а сверху — холст тумана,
  // из которого мы вырезаем снятые клетки. Так не приходится перерисовывать
  // десять тысяч клеток каждый кадр.
  const fog = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = SIZE;
    c.height = SIZE;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#0b0d0b";
      g.fillRect(0, 0, SIZE, SIZE);
    }
    return c;
  }, []);

  const scene = useMemo(() => ({ cells: s.cells, guns: [] }), [s]);

  /**
   * Клетки не выскакивают из тумана разом, а проявляются. Копим их пачками по
   * кадрам: у каждой своя доля прозрачности, и каждый кадр стираем ровно
   * столько, чтобы дойти до новой доли — destination-out перемножается,
   * поэтому шаг считаем от уже стёртого.
   */
  const fading = useRef<{ cells: number[]; k: number; born: number }[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") s.steer = -1;
      else if (e.key === "ArrowRight") s.steer = 1;
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && s.steer === -1) s.steer = 0;
      if (e.key === "ArrowRight" && s.steer === 1) s.steer = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [s]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __scout: unknown }).__scout = s;
    }
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      updateScout(s, dt);

      // туман снимаем плавно: пачка клеток проявляется за FADE секунд
      const g = fog?.getContext("2d");
      if (g) {
        if (s.fresh.length) {
          fading.current.push({ cells: s.fresh.slice(), k: 0, born: now });
          s.fresh.length = 0;
        }
        if (fading.current.length) {
          g.save();
          g.globalCompositeOperation = "destination-out";
          for (const batch of fading.current) {
            const x = Math.min(1, (now - batch.born) / (FADE * 1000));
            const next = 1 - (1 - x) * (1 - x); // помягче в конце
            const step = next >= 1 ? 1 : 1 - (1 - next) / (1 - batch.k);
            batch.k = next;
            if (step <= 0) continue;
            g.globalAlpha = step;
            for (const i of batch.cells) {
              g.fillRect((i % GRID) * CELL, ((i / GRID) | 0) * CELL, CELL, CELL);
            }
          }
          g.restore();
          fading.current = fading.current.filter((b) => b.k < 1);
        }
      }

      if (now - hudAt > 100) {
        hudAt = now;
        const p = s.plane;
        setHud({
          left: s.left,
          lost: s.lost,
          share: seenShare(s.seen),
          danger: !!p && underFire(s, p.x, p.y),
          flying: !!p,
        });
      }

      if (s.done && !finished.current) {
        finished.current = true;
        setDone({ seen: s.seen, cells: s.cells, guns: s.guns, lost: s.lost });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s, fog]);

  const overlay = (ctx: CanvasRenderingContext2D) => {
    // пушки показываем только там, где туман уже снят
    const known: Gun[] = s.guns.filter((g) => s.seen[g.cy * GRID + g.cx]);
    if (known.length) {
      drawCoverage(ctx, known, CELL);
      for (const g of known) {
        ctx.fillStyle = COLORS.gun;
        ctx.fillRect(g.cx * CELL, g.cy * CELL, CELL, CELL);
        ctx.fillStyle = COLORS.gunTop;
        ctx.fillRect(g.cx * CELL + CELL * 0.25, g.cy * CELL + CELL * 0.25, CELL * 0.5, CELL * 0.5);
      }
    }

    if (fog) ctx.drawImage(fog, 0, 0, SIZE, SIZE);

    ctx.strokeStyle = COLORS.missile;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const sh of s.shells) {
      const k = 0.05; // хвост длиной в один кадр полёта
      ctx.moveTo((sh.x - sh.vx * k) * CELL, (sh.y - sh.vy * k) * CELL);
      ctx.lineTo(sh.x * CELL, sh.y * CELL);
    }
    ctx.stroke();

    const p = s.plane;
    if (!p) return;

    // круг съёмки — видно, что именно самолёт сейчас снимает
    ctx.strokeStyle = "rgba(140, 215, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x * CELL, p.y * CELL, SCOUT_RADIUS * CELL, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(p.x * CELL, p.y * CELL);
    ctx.rotate(p.heading);
    ctx.fillStyle = "#8ecae6";
    ctx.beginPath();
    ctx.moveTo(CELL * 1.6, 0);
    ctx.lineTo(-CELL * 0.9, -CELL * 0.9);
    ctx.lineTo(-CELL * 0.4, 0);
    ctx.lineTo(-CELL * 0.9, CELL * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();


  };

  const steerButton = (dir: -1 | 1, icon: React.ReactNode) => (
    <button
      aria-label={dir < 0 ? t("scout.left") : t("scout.right")}
      onPointerDown={() => (s.steer = dir)}
      onPointerUp={() => (s.steer = 0)}
      onPointerLeave={() => (s.steer = 0)}
      className="flex h-14 flex-1 cursor-pointer items-center justify-center rounded-md border border-neutral-700 bg-neutral-900/70 text-neutral-200 active:bg-neutral-800"
    >
      {icon}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative flex min-h-0 flex-1 flex-col gap-2">
        <MapCanvas
          className="min-h-0 flex-1"
          scene={scene}
          sceneVersion={0}
          overlay={overlay}
          cursor="default"
        >
          {done && (
            <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/80 p-4 sm:p-6">
              <div className="w-full max-w-sm">
                <div className="mb-1 text-2xl font-bold tracking-wide text-neutral-100">
                  {t("scout.reportTitle", { name })}
                </div>
                <p className="mb-4 text-sm text-neutral-400">{t("scout.reportHint")}</p>
                <dl className="mb-5 space-y-1 font-mono text-sm">
                  <Row
                    label={t("scout.mapped")}
                    value={`${Math.round(seenShare(done.seen) * 100)}%`}
                  />
                  <Row label={t("scout.gunsFound")} value={String(visibleGuns(done))} />
                  <Row label={t("scout.lost")} value={String(done.lost)} />
                </dl>
                <Button variant="neutral" block onClick={() => onFinish(done)}>
                  {t("scout.keep")}
                </Button>
              </div>
            </div>
          )}
        </MapCanvas>

        <ChipBar className="lg:hidden">
          <Chip label={t("scout.planesLeft")} value={String(hud?.left ?? 0)} />
          <Chip
            label={t("scout.mapped")}
            value={`${Math.round((hud?.share ?? 0) * 100)}%`}
            tone="text-emerald-300"
          />
          <Chip
            label={t("scout.lost")}
            value={String(hud?.lost ?? 0)}
            tone={hud?.lost ? "text-red-300" : undefined}
          />
          {hud?.danger && <Chip label={t("scout.underFire")} value="!" tone="text-red-300" />}
        </ChipBar>

        {/* на телефоне стрелок нет — руль кнопками под картой */}
        <div className="flex shrink-0 gap-2 lg:hidden">
          {steerButton(-1, <ChevronLeft className="h-6 w-6" />)}
          {steerButton(1, <ChevronRight className="h-6 w-6" />)}
        </div>
      </div>

      <div className="hidden items-center gap-4 rounded-md border border-neutral-700 bg-neutral-900/60 px-4 py-3 lg:flex">
        <span className="font-semibold text-neutral-100">{t("scout.over", { name })}</span>
        <div className="flex flex-1 gap-6 font-mono text-sm">
          <Chip label={t("scout.planesLeft")} value={String(hud?.left ?? 0)} />
          <Chip
            label={t("scout.mapped")}
            value={`${Math.round((hud?.share ?? 0) * 100)}%`}
            tone="text-emerald-300"
          />
          <Chip
            label={t("scout.lost")}
            value={String(hud?.lost ?? 0)}
            tone={hud?.lost ? "text-red-300" : undefined}
          />
        </div>
        <span className={`text-sm ${hud?.danger ? "text-red-400" : "text-neutral-500"}`}>
          {hud?.danger ? t("scout.underFire") : t("scout.steerHint")}
        </span>
      </div>
    </div>
  );
}

/** Сколько пушек попало в снятую часть карты. */
function visibleGuns(o: ScoutOutcome) {
  return o.guns.filter((g) => o.seen[g.cy * GRID + g.cx]).length;
}
