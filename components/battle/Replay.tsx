"use client";

// Повтор налёта глазами нападавшего. Ничего не выдумываем: берём слепок
// склада защитника, то же расписание вылетов по тому же seed и запись его
// действий — и прокручиваем бой тем же движком, теми же шагами.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPlan, type AttackOrder } from "@/lib/attack";
import { G_BURNT, decodeCells, type Depot, type Gun } from "@/lib/base";
import { createBattle, setAim, setFiring, update, type GameState } from "@/lib/engine";
import { drawFrame } from "@/lib/render";
import { decodeTrace } from "@/lib/replay";
import { SIM } from "@/lib/tuning";
import { fmt } from "@/lib/economy";
import { useT } from "@/lib/i18n";
import { explainAlone } from "@/lib/errors";
import { useZones } from "../ZonesToggle";
import MapCanvas, { CELL } from "../MapCanvas";
import { Button, Chip, ChipBar, inputClass } from "../ui";
import Avatar from "../Avatar";
import {
  deleteComment,
  loadComments,
  postRaidComment,
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
  levels: {
    guns?: number;
    rockets?: number;
    sprays?: number;
    traps?: number;
    balloons?: number;
    mg?: number;
    water?: number;
  };
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
      const fresh = await postRaidComment(battleId, body);
      setItems((cur) => [...cur, fresh]);
      setDraft("");
    } catch (e) {
      setError(explainAlone(e, t));
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
            <p key={c.id} className="flex items-start gap-3 text-neutral-300">
              <Avatar avatar={c.avatar} name={c.author} className="mt-0.5" />
              <span className="min-w-0 flex-1">
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
              </span>
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
  const [zones, setZones] = useZones();
  const [shared, setShared] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  /** Счётчик прогонов: по нему эффект крутит бой с нуля в том же окне. */
  const [run, setRun] = useState(0);
  const [version, setVersion] = useState(0);
  const [hud, setHud] = useState({ time: 0, inAir: 0, burned: 0, done: false, progress: 0 });
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const frames = useMemo(() => decodeTrace(replay.trace), [replay.trace]);
  /** Шкала бара — длина записи. Хвост tailFrames в знаменатель не кладём:
   *  бой обычно кончается около конца записи, и бар прыгал с ~35% в 100%. */
  const progressSteps = Math.max(1, frames.length);

  const makeState = () =>
    createBattle(
      decodeCells(replay.cells),
      replay.guns as Gun[],
      replay.depots as Depot[],
      buildPlan(replay.order),
      { ...replay.levels, drones: replay.order.droneLevel, seed: replay.order.seed }
    );

  const state = useRef<GameState | null>(null);
  if (!state.current) state.current = makeState();
  const s = state.current;

  // Пушки крутит накладка кадра — на статике они иначе дают бледный призрак.
  const scene = useMemo(() => ({ cells: s.cells, guns: [], depots: s.depots }), [s, run]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let step = 0;
    let hudAt = 0;
    let mapAt = 0;
    const cur = state.current!;

    /** Конец повтора: оставшийся огонь → пепел, как после настоящего боя. */
    const finish = (won: boolean) => {
      for (const i of cur.fire.keys()) cur.cells[i] = G_BURNT;
      cur.fire.clear();
      cur.phase = won ? "won" : "lost";
      cur.dirty = true;
      setVersion((v) => v + 1);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      carry += dt * speedRef.current;

      let guard = 0;
      while (carry >= SIM.step && guard++ < 32 && cur.phase === "playing") {
        // Запись кончилась — доигрываем хвост без рук защитника и на этом
        // всё: дожигать склад, которого он не терял, повтор не должен.
        if (frames.length && step >= frames.length + SIM.tailFrames) {
          finish(cur.baseOk > 0);
          break;
        }
        carry -= SIM.step;
        // руки защитника: что он делал на этом шаге, то и повторяем
        const f = frames[step++] ?? null;
        setAim(cur, f ? { x: f.x + 0.5, y: f.y + 0.5 } : null);
        setFiring(cur, Boolean(f?.firing));
        update(cur, SIM.step);
        // Движок мог закончить бой (склад пал или всё потухло) — огонь на
        // кадре всё ещё мигает, пока не свести его в пепел, как settle().
        if (cur.phase !== "playing") {
          finish(cur.phase === "won");
          break;
        }
      }

      if (cur.dirty && now - mapAt > 100) {
        cur.dirty = false;
        mapAt = now;
        setVersion((v) => v + 1);
      }
      if (now - hudAt > 100) {
        hudAt = now;
        const done = cur.phase !== "playing";
        // Полоска доходит до края только когда повтор реально кончился.
        // Пока крутится хвост после записи — чуть не дожимаем до 100%.
        let progress = 0;
        if (done) progress = 1;
        else if (step < progressSteps) progress = (step / progressSteps) * 0.97;
        else {
          const tail = Math.min(1, (step - progressSteps) / Math.max(1, SIM.tailFrames));
          progress = 0.97 + 0.03 * tail;
        }
        setHud({
          time: cur.time,
          inAir: cur.drones.length,
          burned: cur.result.burned,
          done,
          progress,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run, frames, progressSteps]);

  const restart = () => {
    state.current = makeState();
    setHud({ time: 0, inAir: 0, burned: 0, done: false, progress: 0 });
    setVersion((v) => v + 1);
    setRun((n) => n + 1);
  };

  const overlay = (ctx: CanvasRenderingContext2D, now: number) => {
    drawFrame(ctx, s, CELL, null, now, zones);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ChipBar className="shrink-0 flex-wrap">
        {/* у состязания склад свой: вместо «налёт на …» — его номер */}
        {replay.order.competitionStage ? (
          <Chip
            label={t("replay.competition")}
            value={t("competition.title", { n: replay.order.competitionStage })}
          />
        ) : (
          <Chip label={t("replay.of")} value={name} />
        )}
        <Chip label={t("battle.time")} value={`${Math.floor(hud.time)} ${t("battle.seconds")}`} />
        <Chip label={t("battle.inAir")} value={String(hud.inAir)} />
        <Chip label={t("battle.burned")} value={fmt(hud.burned)} tone="text-orange-300" />
      </ChipBar>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <MapCanvas
            fit
            className="h-full min-h-0 rounded-b-none"
            scene={scene}
            sceneVersion={version}
            overlay={overlay}
            cursor="default"
            zones={{ on: zones, onChange: setZones }}
          />
          {hud.done && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/70">
              <Button variant="build" onClick={restart}>
                {t("replay.again")}
              </Button>
            </div>
          )}
        </div>
        {/* Прогресс повтора: тонкая белая линия вплотную под кадром. */}
        <div className="h-0.5 w-full shrink-0 bg-neutral-800" aria-hidden>
          <div className="h-full bg-white" style={{ width: `${hud.progress * 100}%` }} />
        </div>
      </div>

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
          <Button variant="build" className={shareId ? "" : "ml-auto"} onClick={onClose}>
            {t("common.ok")}
          </Button>
        )}
      </div>
    </div>
  );
}
