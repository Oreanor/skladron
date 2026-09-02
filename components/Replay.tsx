"use client";

// Повтор налёта глазами нападавшего. Ничего не выдумываем: берём слепок
// склада защитника, то же расписание вылетов по тому же seed и запись его
// действий — и прокручиваем бой тем же движком, теми же шагами.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPlan, type AttackOrder } from "@/lib/attack";
import { G_BURNT, decodeCells, type Depot, type Gun } from "@/lib/base";
import { createBattle, setAim, setFiring, update, type GameState } from "@/lib/engine";
import { drawFrame } from "@/lib/render";
import { STEP, TAIL_FRAMES, decodeTrace } from "@/lib/replay";
import { fmt } from "@/lib/economy";
import { useT } from "@/lib/i18n";
import MapCanvas, { CELL } from "./MapCanvas";
import { Button, Chip, ChipBar, inputClass } from "./ui";
import {
  addComment,
  deleteComment,
  loadComments,
  signedIn,
  type BattleComment,
} from "@/lib/comments";

/** Во сколько раз крутим бой. Живьём он идёт минуты — смотреть столько незачем. */
const SPEEDS = [1, 2, 4] as const;

export interface ReplayData {
  order: AttackOrder;
  cells: string;
  guns: { cx: number; cy: number }[];
  depots: { cx: number; cy: number; n: number; kind?: string }[];
  levels: { guns?: number; mg?: number; water?: number };
  trace: string;
}

/** Разговор под боем: список заметок и поле для своей. */
function Talk({ battleId }: { battleId: string }) {
  const t = useT();
  const [items, setItems] = useState<BattleComment[]>([]);
  const [draft, setDraft] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadComments(battleId)
      .then((rows) => alive && setItems(rows))
      .catch(() => {});
    void signedIn().then((yes) => alive && setCanWrite(yes));
    return () => {
      alive = false;
    };
  }, [battleId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await addComment(battleId, body);
      setItems((cur) => [...cur, fresh]);
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setItems((cur) => cur.filter((c) => c.id !== id));
    try {
      await deleteComment(id);
    } catch {
      void loadComments(battleId).then(setItems);
    }
  };

  return (
    <div className="min-h-0 shrink-0 border-t border-neutral-800 pt-2">
      <div className="max-h-24 space-y-1 overflow-y-auto overscroll-contain pr-1 text-sm">
        {items.length === 0 ? (
          <p className="text-neutral-600">{t("talk.empty")}</p>
        ) : (
          items.map((c) => (
            <p key={c.id} className="text-neutral-300">
              <span className="text-neutral-500">{c.author}: </span>
              {c.body}
              {c.mine && (
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  aria-label={t("talk.remove")}
                  title={t("talk.remove")}
                  className="ml-1 cursor-pointer text-neutral-600 hover:text-neutral-300"
                >
                  ×
                </button>
              )}
            </p>
          ))
        )}
      </div>
      {canWrite ? (
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            maxLength={500}
            placeholder={t("talk.placeholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            className={inputClass}
          />
          <Button size="sm" disabled={busy || !draft.trim()} onClick={() => void send()}>
            {t("talk.send")}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-neutral-600">{t("talk.signIn")}</p>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function Replay({
  name,
  replay,
  shareId,
  onClose,
}: {
  /** Чей склад отбивался — его и показываем в шапке. */
  name: string;
  replay: ReplayData;
  /** Есть id — можно дать ссылку, по которой бой посмотрят другие. */
  shareId?: string;
  onClose?: () => void;
}) {
  const t = useT();
  const [shared, setShared] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [version, setVersion] = useState(0);
  const [hud, setHud] = useState({ time: 0, inAir: 0, burned: 0, done: false });
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const frames = useMemo(() => decodeTrace(replay.trace), [replay.trace]);

  const state = useRef<GameState | null>(null);
  if (!state.current) {
    state.current = createBattle(
      decodeCells(replay.cells),
      replay.guns as Gun[],
      replay.depots as Depot[],
      buildPlan(replay.order),
      { ...replay.levels, drones: replay.order.droneLevel ?? 1, seed: replay.order.seed }
    );
  }
  const s = state.current;

  const scene = useMemo(() => ({ cells: s.cells, guns: s.guns, depots: s.depots }), [s]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let step = 0;
    let hudAt = 0;
    let mapAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      carry += dt * speedRef.current;

      let guard = 0;
      while (carry >= STEP && guard++ < 32 && s.phase === "playing") {
        // Запись кончилась — доигрываем хвост без рук защитника и на этом
        // всё: дожигать склад, которого он не терял, повтор не должен.
        if (frames.length && step >= frames.length + TAIL_FRAMES) {
          // что горело к этому мгновению — то и осталось пепелищем
          for (const i of s.fire.keys()) s.cells[i] = G_BURNT;
          s.fire.clear();
          s.phase = s.baseOk > 0 ? "won" : "lost";
          setVersion((v) => v + 1);
          break;
        }
        carry -= STEP;
        // руки защитника: что он делал на этом шаге, то и повторяем
        const f = frames[step++] ?? null;
        setAim(s, f ? { x: f.x + 0.5, y: f.y + 0.5 } : null);
        setFiring(s, Boolean(f?.firing));
        update(s, STEP);
      }

      if (s.dirty && now - mapAt > 100) {
        s.dirty = false;
        mapAt = now;
        setVersion((v) => v + 1);
      }
      if (now - hudAt > 100) {
        hudAt = now;
        setHud({
          time: s.time,
          inAir: s.drones.length,
          burned: s.result.burned,
          done: s.phase !== "playing",
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s, frames]);

  const overlay = (ctx: CanvasRenderingContext2D, now: number) => {
    drawFrame(ctx, s, CELL, null, now);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ChipBar className="shrink-0 flex-wrap">
        <Chip label={t("replay.of")} value={name} />
        <Chip label={t("battle.time")} value={`${Math.floor(hud.time)} ${t("battle.seconds")}`} />
        <Chip label={t("battle.inAir")} value={String(hud.inAir)} />
        <Chip label={t("battle.burned")} value={fmt(hud.burned)} tone="text-orange-300" />
      </ChipBar>

      <MapCanvas
        className="min-h-0 flex-1"
        scene={scene}
        sceneVersion={version}
        overlay={overlay}
        cursor="default"
      />

      {shareId && <Talk battleId={shareId} />}

      <div className="flex shrink-0 items-center gap-2">
        {SPEEDS.map((v) => (
          <Button key={v} size="sm" active={speed === v} onClick={() => setSpeed(v)}>
            {v}×
          </Button>
        ))}
        {shareId && (
          <Button
            className="ml-auto"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(`${location.origin}/replay/${shareId}`)
                .then(() => setShared(true))
                .catch(() => setShared(false));
            }}
          >
            {shared ? t("replay.copied") : t("replay.share")}
          </Button>
        )}
        {onClose && (
          <Button variant="neutral" className={shareId ? "" : "ml-auto"} onClick={onClose}>
            {t("common.ok")}
          </Button>
        )}
      </div>
    </div>
  );
}
