"use client";

// Повтор налёта глазами нападавшего. Ничего не выдумываем: берём слепок
// склада защитника, то же расписание вылетов по тому же seed и запись его
// действий — и прокручиваем бой тем же движком, теми же шагами.

import { useEffect, useMemo, useRef, useState } from "react";
import type { AttackOrder, Payload } from "@/lib/attack";
import { G_BURNT, decodeCells, type Depot, type Gun } from "@/lib/base";
import type { GameState } from "@/lib/engine";
import { simFor, type Sim } from "@/lib/sim";
import { fmt } from "@/lib/economy";
import { useT } from "@/lib/i18n";
import { explainAlone } from "@/lib/errors";
import { useZones } from "../ZonesToggle";
import MapCanvas, { CELL } from "../MapCanvas";
import { Button, Chip, ChipBar, Panel, Row, inputClass } from "../ui";
import { PayloadLegend } from "./Battle";
import BattleFrame, { BattleWindow, MAP_EVERY_MS } from "./BattleFrame";
import { usePanelFold } from "./usePanelFold";
import { useEditLast } from "../useEditLast";
import Avatar from "../Avatar";
import {
  deleteComment,
  editComment,
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

/** Разговор под боем: список заметок и поле для своей. tall — в колонке, где места больше. */
function Talk({ battleId, tall = false }: { battleId: string; tall?: boolean }) {
  const t = useT();
  const [items, setItems] = useState<BattleComment[]>([]);
  const [draft, setDraft] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = useEditLast(items, draft, setDraft);

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
      if (edit.editing) {
        const id = edit.editing;
        await editComment(id, body);
        setItems((cur) => cur.map((c) => (c.id === id ? { ...c, body } : c)));
        edit.cancel();
      } else {
        const fresh = await postRaidComment(battleId, body);
        setItems((cur) => [...cur, fresh]);
        setDraft("");
      }
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
    <div className="min-h-0 shrink-0">
      <div className={`${tall ? "max-h-72" : "max-h-24"} space-y-1 overflow-y-auto overscroll-contain pr-1 text-sm`}>
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
              if (edit.onKey(e)) return;
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
      {edit.editing && <p className="mt-1 text-xs text-emerald-300/80">{t("chat.editing")}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** Что показывает колонка повтора — те же счётчики, что в бою. */
interface ReplayHud {
  time: number;
  inAir: number;
  left: number;
  killedByGuns: number;
  killedByMg: number;
  fires: number;
  burned: number;
  gunsAlive: number;
  gunsTotal: number;
  integrity: number;
  byPayload: Partial<Record<Payload, number>>;
  done: boolean;
  /** Сколько записи уже прокручено, от 0 до 1. */
  progress: number;
}

const EMPTY_HUD: ReplayHud = {
  time: 0,
  inAir: 0,
  left: 0,
  killedByGuns: 0,
  killedByMg: 0,
  fires: 0,
  burned: 0,
  gunsAlive: 0,
  gunsTotal: 0,
  integrity: 100,
  byPayload: {},
  done: false,
  progress: 0,
};

/** Сколько миллисекунд кадра отдаём перемотке: окно не должно замирать. */
const SEEK_BUDGET_MS = 12;
/** Деления ползунка. */
const SCRUB_MAX = 1000;
/** Нажатие по карте — пауза, если короче этого, мс… */
const TAP_MS = 400;
/** …и сдвинулось не дальше этого, в клетках. */
const TAP_MOVE = 1.5;

function ReplayView({
  sim,
  name,
  replay,
  shareId,
  onClose,
}: {
  /** Движок той версии, по которой бой шёл. */
  sim: Sim;
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
  const [hud, setHud] = useState<ReplayHud>(EMPTY_HUD);
  /** Положение ползунка, пока его тянут; null — ползунок идёт за повтором. */
  const [scrub, setScrub] = useState<number | null>(null);
  /** Пауза — нажатием по карте. */
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  /** Где и когда коснулись карты: пауза — только от короткого нажатия на месте. */
  const tapRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [statsFolded, foldStats] = usePanelFold("replay.stats");
  const [payloadsFolded, foldPayloads] = usePanelFold("payloads");
  const [talkFolded, foldTalk] = usePanelFold("replay.talk");

  const frames = useMemo(() => sim.decodeTrace(replay.trace), [sim, replay.trace]);
  /** Шкала ползунка — длина записи. Хвост tailFrames в неё не кладём:
   *  бой обычно кончается около конца записи, и бар прыгал с ~35% в 100%. */
  const progressSteps = Math.max(1, frames.length);

  const makeState = () =>
    sim.createBattle(
      decodeCells(replay.cells),
      replay.guns as Gun[],
      replay.depots as Depot[],
      sim.buildPlan(replay.order),
      { ...replay.levels, drones: replay.order.droneLevel, seed: replay.order.seed }
    );

  const state = useRef<GameState | null>(null);
  if (!state.current) state.current = makeState();
  const s = state.current;
  /** Сколько шагов уже прокручено — его видит и перемотка. */
  const stepRef = useRef(0);
  /** Куда перемотать: шаг записи; null — крутим своим ходом. */
  const seekRef = useRef<number | null>(null);

  // Пушки крутит накладка кадра — на статике они иначе дают бледный призрак.
  const scene = useMemo(() => ({ cells: s.cells, guns: [], depots: s.depots }), [s]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let hudAt = 0;
    let hudStep = -1;
    let hudPhase: GameState["phase"] | undefined;
    let mapAt = 0;
    const cur = state.current!;
    stepRef.current = 0;

    /** Конец повтора: оставшийся огонь → пепел, как после настоящего боя. */
    const finish = (won: boolean) => {
      for (const i of cur.fire.keys()) cur.cells[i] = G_BURNT;
      cur.fire.clear();
      cur.phase = won ? "won" : "lost";
      cur.dirty = true;
      setVersion((v) => v + 1);
    };

    /** Один шаг боя с руками защитника. false — бой кончился. */
    const tick = () => {
      // Запись кончилась — доигрываем хвост без рук защитника и на этом
      // всё: дожигать склад, которого он не терял, повтор не должен.
      if (frames.length && stepRef.current >= frames.length + sim.SIM.tailFrames) {
        finish(cur.baseOk > 0);
        return false;
      }
      // руки защитника: что он делал на этом шаге, то и повторяем
      const f = frames[stepRef.current++] ?? null;
      sim.setAim(cur, f ? { x: f.x + 0.5, y: f.y + 0.5 } : null);
      sim.setFiring(cur, Boolean(f?.firing));
      sim.update(cur, sim.SIM.step);
      // Движок мог закончить бой (склад пал или всё потухло) — огонь на
      // кадре всё ещё мигает, пока не свести его в пепел, как settle().
      if (cur.phase !== "playing") {
        finish(cur.phase === "won");
        return false;
      }
      return true;
    };

    const loop = (now: number) => {
      // Повтор начали заново (перемотка назад): этот прогон уже чужой. Без
      // этого его последний кадр, ещё до уборки, снимал свежую перемотку.
      if (state.current !== cur) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const target = seekRef.current;
      if (target !== null) {
        // Перемотка вперёд: шагаем без отрисовки, пока не дойдём или не
        // кончится бюджет кадра, — остальное доделаем в следующем.
        const until = performance.now() + SEEK_BUDGET_MS;
        while (cur.phase === "playing" && stepRef.current < target && performance.now() < until) {
          if (!tick()) break;
        }
        if (cur.phase !== "playing" || stepRef.current >= target) seekRef.current = null;
        carry = 0;
      } else if (pausedRef.current) {
        // на паузе время стоит, а перемотка ползунком работает
        carry = 0;
      } else {
        carry += dt * speedRef.current;
        let guard = 0;
        while (carry >= sim.SIM.step && guard++ < 32 && cur.phase === "playing") {
          carry -= sim.SIM.step;
          if (!tick()) break;
        }
      }

      if (cur.dirty && now - mapAt > MAP_EVERY_MS) {
        cur.dirty = false;
        mapAt = now;
        setVersion((v) => v + 1);
      }
      // На паузе и после конца не пересобираем HUD: это будило и React, и карту.
      // При перемотке шаг меняется, поэтому счёт и кадр продолжают обновляться.
      if (now - hudAt > 100 && (hudStep !== stepRef.current || hudPhase !== cur.phase)) {
        hudAt = now;
        hudStep = stepRef.current;
        hudPhase = cur.phase;
        const done = cur.phase !== "playing";
        const byPayload: Partial<Record<Payload, number>> = {};
        for (const d of cur.drones) {
          if (!d.hit) byPayload[d.payload] = (byPayload[d.payload] ?? 0) + 1;
        }
        const towers = cur.guns.filter((g) => !g.spray && !g.trap && !g.balloon);
        setHud({
          time: cur.time,
          inAir: cur.drones.length,
          left: cur.plan.length - cur.planAt,
          killedByGuns: cur.result.killedByGuns,
          killedByMg: cur.result.killedByMg,
          fires: cur.fire.size,
          burned: cur.result.burned,
          gunsAlive: towers.filter((g) => g.alive).length,
          gunsTotal: towers.length,
          integrity: cur.baseTotal ? Math.round((cur.baseOk / cur.baseTotal) * 100) : 0,
          byPayload,
          done,
          // до края ползунок доходит, только когда повтор реально кончился
          progress: done ? 1 : Math.min(0.99, stepRef.current / progressSteps),
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run, frames, progressSteps, sim]);

  // Нажатие, а не жест: короче TAP_MS и почти без сдвига. Щипок двумя
  // пальцами MapCanvas сообщает через onLeave — тогда нажатие отменяется.
  const onMapDown = (p: { x: number; y: number }, button: number) => {
    tapRef.current = button === 0 ? { x: p.x, y: p.y, at: performance.now() } : null;
  };
  const onMapUp = (p: { x: number; y: number }) => {
    const tap = tapRef.current;
    tapRef.current = null;
    if (!tap || hud.done) return;
    if (performance.now() - tap.at > TAP_MS || Math.hypot(p.x - tap.x, p.y - tap.y) > TAP_MOVE) return;
    setPaused((v) => !v);
  };

  const restart = () => {
    setPaused(false);
    state.current = makeState();
    setHud(EMPTY_HUD);
    setVersion((v) => v + 1);
    setRun((n) => n + 1);
  };

  /** Перемотать на долю записи. Назад — с начала: бой идёт только вперёд. */
  const seekTo = (share: number) => {
    const target = Math.round(Math.max(0, Math.min(1, share)) * progressSteps);
    if (target < stepRef.current || hud.done) restart();
    seekRef.current = target;
  };

  // Анимация — по часам боя, а не по настенным: на паузе стоит всё разом
  // (кольца ловушек, огонь, дым), а на 2× и 4× крутится вместе с боем.
  const overlay = (ctx: CanvasRenderingContext2D) => {
    sim.drawFrame(ctx, s, CELL, null, s.time * 1000, zones);
  };

  const seconds = `${Math.floor(hud.time)} ${t("battle.seconds")}`;
  // у состязания склад свой: вместо «налёт на …» — его номер
  const title = replay.order.competitionStage
    ? t("competition.title", { n: replay.order.competitionStage })
    : `${t("replay.of")} ${name}`;

  // Скорость — строкой, кнопки по своей ширине; ссылка и «ОК» — строкой ниже.
  // Обе строки — по центру колонки.
  const controls = (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="flex gap-2">
        {SPEEDS.map((v) => (
          <Button key={v} size="sm" active={speed === v} onClick={() => setSpeed(v)}>
            {v}×
          </Button>
        ))}
      </div>
      {(shareId || onClose) && (
        <div className="flex gap-2">
          {shareId && (
            <Button
              size="sm"
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
            <Button size="sm" variant="build" onClick={onClose}>
              {t("common.ok")}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const shown = scrub ?? hud.progress * SCRUB_MAX;
  const commitScrub = () => {
    if (scrub === null) return;
    seekTo(scrub / SCRUB_MAX);
    setScrub(null);
  };

  return (
    <BattleFrame
      variant={onClose ? "replay" : "page"}
      onDismiss={onClose}
      map={
        <>
          <MapCanvas
            fit
            className="h-full w-full rounded-b-none"
            scene={scene}
            sceneVersion={version}
            overlay={overlay}
            idle={paused || hud.done}
            cursor="pointer"
            zones={{ on: zones, onChange: setZones }}
            onDown={onMapDown}
            onUp={onMapUp}
            onLeave={() => (tapRef.current = null)}
          />
          {paused && !hud.done && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 pl-1 text-3xl text-white/90">
                ▶
              </span>
            </div>
          )}
          {hud.done && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/70">
              <Button variant="build" onClick={restart}>
                {t("replay.again")}
              </Button>
            </div>
          )}
        </>
      }
      // Ползунок по нижнему краю карты: видно, сколько прошло, и можно
      // перемотать. Перемотка — на отпускании: тянуть, пересчитывая бой на
      // каждый сдвиг, было бы тяжело.
      under={
        <input
          type="range"
          min={0}
          max={SCRUB_MAX}
          value={Math.round(shown)}
          aria-label={t("replay.progress")}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={commitScrub}
          onKeyUp={commitScrub}
          onBlur={commitScrub}
          className="h-4 w-full cursor-pointer accent-white"
        />
      }
      underHeight="1rem"
      mobile={
        <>
          <ChipBar>
            <Chip label={t("battle.hudTime")} value={seconds} />
            <Chip label={t("battle.hudAir")} value={String(hud.inAir)} tone="text-red-300" />
            <Chip label={t("battle.hudLeft")} value={String(hud.left)} />
            <Chip label={t("battle.hudKilled")} value={String(hud.killedByGuns + hud.killedByMg)} tone="text-emerald-300" />
            <Chip label={t("battle.burned")} value={fmt(hud.burned)} tone="text-orange-300" />
            <Chip label={t("battle.hudGuns")} value={`${hud.gunsAlive}/${hud.gunsTotal}`} />
            <Chip
              label={t("battle.hudIntegrity")}
              value={`${hud.integrity}%`}
              tone={hud.integrity < 60 ? "text-orange-300" : "text-emerald-300"}
            />
          </ChipBar>
          {shareId && (
            <div className="border-t border-neutral-800 pt-2">
              <Talk battleId={shareId} />
            </div>
          )}
        </>
      }
      // кнопки — внизу и на месте, прокручиваются только панели над ними
      foot={controls}
      panels={
        <>
          <Panel title={t("panel.replay")} collapsed={statsFolded} onToggle={foldStats}>
            <p className="mb-3 text-neutral-300">{title}</p>
            <dl className="space-y-1 font-mono">
              <Row label={t("battle.time")} value={seconds} />
              <Row label={t("battle.inAir")} value={String(hud.inAir)} />
              <Row label={t("battle.incomingLeft")} value={String(hud.left)} />
              <Row label={t("battle.killedByGuns")} value={String(hud.killedByGuns)} />
              <Row label={t("battle.killedByMg")} value={String(hud.killedByMg)} />
              <Row label={t("battle.fires")} value={String(hud.fires)} />
              <Row label={t("battle.burned")} value={fmt(hud.burned)} />
              <Row label={t("battle.gunsAlive")} value={`${hud.gunsAlive}/${hud.gunsTotal}`} />
              <Row label={t("battle.integrity")} value={`${hud.integrity}%`} />
            </dl>
          </Panel>
          <Panel title={t("panel.payloads")} collapsed={payloadsFolded} onToggle={foldPayloads}>
            <PayloadLegend t={t} counts={hud.byPayload} />
          </Panel>
          {/* разговор — своей панелью */}
          {shareId && (
            <Panel title={t("panel.talk")} collapsed={talkFolded} onToggle={foldTalk}>
              <Talk battleId={shareId} tall />
            </Panel>
          )}
        </>
      }
    />
  );
}


/**
 * Повтор боя. Бой прогоняется заново по слепку склада и записи рук, а
 * правила с тех пор могли поменяться, — поэтому берём движок той версии, по
 * которой бой шёл: нынешний или замороженный в lib/sims.
 */
export default function Replay(props: {
  name: string;
  replay: ReplayData;
  shareId?: string;
  onClose?: () => void;
}) {
  const t = useT();
  const version = props.replay.order.simulationVersion;
  const [sim, setSim] = useState<Sim | null | "loading">("loading");
  useEffect(() => {
    let alive = true;
    simFor(version)
      .then((found) => alive && setSim(found))
      .catch(() => alive && setSim(null));
    return () => {
      alive = false;
    };
  }, [version]);

  if (sim === "loading" || !sim) {
    // пока движок грузится — то же окно, что и у повтора, а не голый текст
    return (
      <BattleWindow variant={props.onClose ? "replay" : "page"} onDismiss={props.onClose}>
        <p className={`p-6 text-sm ${sim ? "text-neutral-500" : "text-neutral-400"}`}>
          {sim ? t("app.loading") : t("replay.tooOld")}
        </p>
      </BattleWindow>
    );
  }
  return <ReplayView sim={sim} {...props} />;
}
