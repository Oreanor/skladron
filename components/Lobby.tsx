"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GRID,
  G_BASE,
  G_BURNT,
  DRONES_PER_CELL,
  type Rect,
  applyRect,
  droneCount,
  freeCells,
  idx,
  isBuilding,
  newCellsIn,
  normRect,
  placeDepots,
  rectConnects,
  touchesBuilding,
} from "@/lib/base";
import {
  CELL_COST,
  DRONE_PACK,
  DRONE_PACK_COST,
  GUN_COST,
  GUN_REFUND,
  MIN_BASE_CELLS,
  REPAIR_COST,
  fmt,
} from "@/lib/economy";
import {
  EDGE_NAMES,
  PATTERNS,
  type AttackOrder,
  type Pattern,
  makeOrder,
} from "@/lib/attack";
import {
  burntCells,
  dailyIncome,
  intactCells,
  isDoomed,
  type Player,
} from "@/lib/player";
import { getRepo } from "@/lib/repo";
import {
  type Enemy,
  type RaidOutcome,
  counterRaid,
  makeEnemy,
  raid,
  takeDrones,
} from "@/lib/enemy";
import type { Account } from "./AuthGate";
import Enemies from "./Enemies";
import { drawCoverage, drawDepots } from "@/lib/render";
import Battle, { type BattleOutcome } from "./Battle";
import MapCanvas, { type Pt } from "./MapCanvas";
import {
  Button,
  Card,
  Chip,
  ChipBar,
  IconButton,
  IconMenu,
  IconTarget,
  IconUsers,
  Notice,
  Panel,
  Row,
  SectionTitle,
  Sheet,
  StatRow,
} from "./ui";

type Tool = "area" | "repair" | "gun" | "drones";
/** Панели, которые на телефоне открываются шторкой снизу. */
type SheetId = "found" | "arsenal" | "attacks" | "enemies" | "menu";

const TOOLS: { id: Tool; name: string; hint: string }[] = [
  { id: "area", name: "Площадь", hint: `${CELL_COST} кр за новую клетку` },
  { id: "repair", name: "Ремонт", hint: `${REPAIR_COST} кр за клетку` },
  { id: "gun", name: "Пушка", hint: `${GUN_COST} кр, снять — вернёт ${GUN_REFUND}` },
  { id: "drones", name: "Дроны", hint: `${fmt(DRONE_PACK_COST)} кр за ${DRONE_PACK} шт` },
];

const ENEMY_NAMES = ["Сосед", "Конкурент", "Бывший партнёр", "Аноним"];

export default function Lobby({
  account,
  onSignOut,
}: {
  account: Account | null;
  onSignOut: () => void;
}) {
  const repo = getRepo();
  const playerRef = useRef<Player | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useState(0);
  const [tool, setTool] = useState<Tool>("area");
  const [message, setMessage] = useState<string | null>(null);
  const [battle, setBattle] = useState<AttackOrder | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const toggleSheet = (id: SheetId) => setSheet((cur) => (cur === id ? null : id));

  // заготовка площади
  const draftRef = useRef<Rect | null>(null);
  const dragRef = useRef<{
    mode: "create" | "move" | "resize";
    corner: number;
    startX: number;
    startY: number;
    origin: Rect;
    moved: boolean;
  } | null>(null);
  const hoverRef = useRef<Pt | null>(null);
  const paintingRef = useRef(false);
  // раскладка контейнеров
  const [arranging, setArranging] = useState(false);
  const dragDepotRef = useRef<{ cx: number; cy: number } | null>(null);

  /** Пишем склад с задержкой: на сервере это одна проверяемая операция. */
  const persist = () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      const cur = playerRef.current;
      if (!cur) return;
      try {
        const patch = await repo.saveBase(cur);
        if (patch.credits !== undefined) cur.credits = patch.credits;
        forceRender((v) => v + 1);
      } catch (e) {
        setMessage(`Сервер отклонил правку: ${(e as Error).message}`);
      }
    }, 400);
  };

  const touch = () => {
    setVersion((v) => v + 1);
    forceRender((v) => v + 1);
    persist();
  };

  useEffect(() => {
    let alive = true;
    repo
      .load()
      .then(({ player, income }) => {
        if (!alive) return;
        playerRef.current = player;
        setReady(true);
        if (income.credits > 0) {
          setMessage(`Доход за ${income.days} сут: +${fmt(income.credits)} кр`);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setMessage(`Не удалось загрузить склад: ${(e as Error).message}`);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [repo]);

  const p = playerRef.current;
  const scene = useMemo(
    () =>
      p
        ? { cells: p.cells, guns: p.guns, depots: p.depots }
        : { cells: new Uint8Array(0), guns: [], depots: [] },
    [p]
  );

  if (!ready || !p) {
    return <div className="p-6 text-sm text-neutral-500">Загрузка склада…</div>;
  }

  const intact = intactCells(p);
  const burnt = burntCells(p);
  const hasBuilding = intact + burnt > 0;
  const doomed = isDoomed(p);
  const drones = droneCount(p.depots);
  const free = freeCells(p.cells, p.guns, p.depots).length;
  // магазин сам ограничивает покупку: и кошельком, и свободной площадью
  const cellsPerPack = DRONE_PACK / DRONES_PER_CELL;
  const packsAvailable = Math.min(
    Math.floor(p.credits / DRONE_PACK_COST),
    Math.floor(free / cellsPerPack)
  );

  // ---------- бой ----------

  if (battle) {
    return (
      <Battle
        cells={p.cells}
        guns={p.guns}
        depots={p.depots}
        order={battle}
        onFinish={async (o: BattleOutcome) => {
          p.cells = o.cells;
          p.guns = o.guns;
          p.depots = o.depots;
          p.incoming = p.incoming.filter((a) => a.id !== battle.id);
          p.stats.battles++;
          p.stats.dronesKilled += o.result.killedByGuns + o.result.killedByMg;
          p.stats.cellsBurned += o.result.burned;
          // счёт вражды: записываем, сколько он у нас сжёг
          const foe = p.enemies.find((e) => e.name === battle.from);
          if (foe) foe.burnedByThem += o.result.burned;
          setBattle(null);
          setMessage(
            o.won
              ? `Налёт отбит. Потеряно клеток: ${o.result.burned}`
              : `Склад выгорел под атакой ${battle.from}`
          );
          setVersion((v) => v + 1);
          forceRender((v) => v + 1);
          try {
            // урон пишем отдельной операцией: она умеет только ухудшать карту
            const patch = await repo.applyBattle(p, o.result);
            if (patch.credits !== undefined) p.credits = patch.credits;
            forceRender((v) => v + 1);
          } catch (e) {
            setMessage(`Итог боя не сохранён: ${(e as Error).message}`);
          }
        }}
      />
    );
  }

  // ---------- инструменты ----------

  const draft = draftRef.current;
  const draftRect = draft ? normRect(draft) : null;
  const draftNew = draftRect ? newCellsIn(p.cells, draftRect) : 0;
  const draftCost = draftNew * CELL_COST;
  const draftConnects = draftRect ? rectConnects(p.cells, draftRect, hasBuilding) : false;
  const draftAfford = draftCost <= p.credits;

  const commitDraft = () => {
    if (!draftRect || draftRect.w <= 0 || draftRect.h <= 0) return;
    if (!draftConnects) {
      setMessage("Здание должно быть без разрывов");
      return;
    }
    if (!draftAfford) {
      setMessage(`Не хватает кредитов: нужно ${fmt(draftCost)}`);
      return;
    }
    applyRect(p.cells, draftRect);
    p.credits -= draftCost;
    draftRef.current = null;
    dragRef.current = null;
    setMessage(`Пристроено ${draftNew} клеток за ${fmt(draftCost)} кр`);
    touch();
  };

  const buildOne = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    const i = idx(x, y);
    if (isBuilding(p.cells[i])) return;
    if (hasBuilding && !touchesBuilding(p.cells, x, y)) {
      setMessage("Здание должно быть без разрывов");
      return;
    }
    if (p.credits < CELL_COST) {
      setMessage("Не хватает кредитов");
      return;
    }
    p.cells[i] = G_BASE;
    p.credits -= CELL_COST;
    touch();
  };

  const repairAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    const i = idx(x, y);
    if (p.cells[i] !== G_BURNT) return;
    if (p.credits < REPAIR_COST) {
      setMessage("Не хватает кредитов на ремонт");
      return;
    }
    p.cells[i] = G_BASE;
    p.credits -= REPAIR_COST;
    p.stats.cellsRepaired++;
    touch();
  };

  const gunAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    const existing = p.guns.findIndex((g) => g.cx === x && g.cy === y);
    if (existing >= 0) {
      p.guns.splice(existing, 1);
      p.credits += GUN_REFUND;
      touch();
      return;
    }
    if (p.cells[idx(x, y)] !== G_BASE) {
      setMessage("Пушка ставится только на целую клетку здания");
      return;
    }
    if (p.depots.some((d) => d.cx === x && d.cy === y)) {
      setMessage("Клетка занята контейнером с дронами");
      return;
    }
    if (p.credits < GUN_COST) {
      setMessage("Не хватает кредитов на пушку");
      return;
    }
    p.guns.push({ cx: x, cy: y });
    p.credits -= GUN_COST;
    touch();
  };

  const buyDrones = async () => {
    if (packsAvailable < 1) return;
    const added = placeDepots(p.cells, p.guns, p.depots, DRONE_PACK / DRONES_PER_CELL);
    if (added.length < DRONE_PACK / DRONES_PER_CELL) {
      setMessage("Не хватает свободных клеток под контейнеры");
      return;
    }
    p.depots.push(...added);
    p.credits -= DRONE_PACK_COST;
    setMessage(`Закуплено ${DRONE_PACK} дронов — ${added.length} контейнеров на складе`);
    setVersion((v) => v + 1);
    forceRender((v) => v + 1);
    try {
      const patch = await repo.buyDrones(p, 1);
      if (patch.credits !== undefined) p.credits = patch.credits;
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(`Закупка не прошла: ${(e as Error).message}`);
    }
  };

  /** Перетаскивание контейнера на свободную клетку. */
  const moveDepot = (from: { cx: number; cy: number }, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    if (p.cells[idx(x, y)] !== G_BASE) {
      setMessage("Контейнер ставится только на целую клетку склада");
      return;
    }
    if (p.guns.some((g) => g.cx === x && g.cy === y)) {
      setMessage("Клетка занята пушкой");
      return;
    }
    if (p.depots.some((d) => d.cx === x && d.cy === y)) {
      setMessage("Здесь уже стоит контейнер");
      return;
    }
    const d = p.depots.find((q) => q.cx === from.cx && q.cy === from.cy);
    if (!d) return;
    d.cx = x;
    d.cy = y;
    touch();
  };

  const found = () => {
    if (intact < MIN_BASE_CELLS) return;
    p.founded = true;
    p.lastIncomeAt = Date.now();
    setMessage("Склад основан. Доход пошёл.");
    touch();
  };

  const addEnemy = (email: string): string | null => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Похоже, это не почта";
    if (p.enemies.some((e) => e.email.toLowerCase() === email.toLowerCase())) {
      return "Этот враг уже в списке";
    }
    p.enemies.push(makeEnemy(email));
    touch();
    return null;
  };

  const doRaid = (
    enemy: Enemy,
    n: number,
    pattern: Pattern,
    direction: number
  ): RaidOutcome => {
    const sent = takeDrones(p.depots, n);
    const out = raid(enemy, sent, pattern, direction, account?.name ?? "Ты");
    p.credits += out.loot;
    p.stats.raids++;
    p.stats.looted += out.loot;

    // враг отвечает: чем больше сожжено, тем злее налёт
    const answer = counterRaid(enemy);
    if (answer) p.incoming.push(answer); // счёт вражды обновится, когда его отыграют
    touch();
    return out;
  };

  const summonAttack = () => {
    const pattern = PATTERNS[(Math.random() * PATTERNS.length) | 0].id as Pattern;
    const size = 20 + Math.floor(Math.random() * 60);
    const order = makeOrder(
      ENEMY_NAMES[(Math.random() * ENEMY_NAMES.length) | 0],
      size,
      pattern,
      (Math.random() * 4) | 0
    );
    p.incoming.push(order);
    touch();
  };

  // ---------- ввод по карте ----------

  const cellOf = (pt: Pt) => ({ x: Math.floor(pt.x), y: Math.floor(pt.y) });

  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __lobby: unknown }).__lobby = {
      player: p,
      tool,
      arranging,
      dragDepot: dragDepotRef,
      moveDepot,
    };
  }

  const cornerNear = (r: Rect, pt: Pt) => {
    const corners: [number, number][] = [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ];
    for (let i = 0; i < 4; i++) {
      if (Math.abs(corners[i][0] - pt.x) < 2.5 && Math.abs(corners[i][1] - pt.y) < 2.5) return i;
    }
    return -1;
  };

  const onDown = (pt: Pt, button: number) => {
    if (button !== 0) return;
    const c = cellOf(pt);
    if (tool === "drones") {
      if (!arranging) return;
      const d = p.depots.find((q) => q.cx === c.x && q.cy === c.y);
      if (d) dragDepotRef.current = { cx: d.cx, cy: d.cy };
      return;
    }
    if (tool === "repair") {
      paintingRef.current = true;
      repairAt(c.x, c.y);
      return;
    }
    if (tool === "gun") {
      gunAt(c.x, c.y);
      return;
    }
    if (tool !== "area") return;

    const cur = draftRef.current ? normRect(draftRef.current) : null;
    if (cur) {
      const corner = cornerNear(cur, pt);
      if (corner >= 0) {
        dragRef.current = {
          mode: "resize",
          corner,
          startX: pt.x,
          startY: pt.y,
          origin: cur,
          moved: false,
        };
        return;
      }
      if (pt.x >= cur.x && pt.x <= cur.x + cur.w && pt.y >= cur.y && pt.y <= cur.y + cur.h) {
        dragRef.current = {
          mode: "move",
          corner: -1,
          startX: pt.x,
          startY: pt.y,
          origin: cur,
          moved: false,
        };
        return;
      }
    }
    draftRef.current = { x: Math.floor(pt.x), y: Math.floor(pt.y), w: 0, h: 0 };
    dragRef.current = {
      mode: "create",
      corner: -1,
      startX: pt.x,
      startY: pt.y,
      origin: { x: Math.floor(pt.x), y: Math.floor(pt.y), w: 0, h: 0 },
      moved: false,
    };
  };

  const onMove = (pt: Pt) => {
    hoverRef.current = pt;
    if (tool === "repair" && paintingRef.current) {
      const c = cellOf(pt);
      repairAt(c.x, c.y);
      return;
    }
    const drag = dragRef.current;
    if (!drag || tool !== "area") return;
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) drag.moved = true;

    if (drag.mode === "create") {
      draftRef.current = {
        x: drag.origin.x,
        y: drag.origin.y,
        w: Math.round(pt.x - drag.origin.x),
        h: Math.round(pt.y - drag.origin.y),
      };
    } else if (drag.mode === "move") {
      draftRef.current = {
        x: drag.origin.x + Math.round(dx),
        y: drag.origin.y + Math.round(dy),
        w: drag.origin.w,
        h: drag.origin.h,
      };
    } else {
      const o = drag.origin;
      let x0 = o.x;
      let y0 = o.y;
      let x1 = o.x + o.w;
      let y1 = o.y + o.h;
      if (drag.corner === 0 || drag.corner === 2) x0 = Math.round(pt.x);
      else x1 = Math.round(pt.x);
      if (drag.corner === 0 || drag.corner === 1) y0 = Math.round(pt.y);
      else y1 = Math.round(pt.y);
      draftRef.current = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    forceRender((v) => v + 1);
  };

  const onUp = (pt: Pt) => {
    paintingRef.current = false;
    if (tool === "drones") {
      const from = dragDepotRef.current;
      dragDepotRef.current = null;
      if (from) {
        const c = cellOf(pt);
        if (c.x !== from.cx || c.y !== from.cy) moveDepot(from, c.x, c.y);
        else forceRender((v) => v + 1);
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || tool !== "area") return;
    dragRef.current = null;

    if (drag.mode === "create" && !drag.moved) {
      // одиночный клик по смежной клетке — застраиваем одну
      draftRef.current = null;
      const c = cellOf(pt);
      buildOne(c.x, c.y);
      return;
    }
    if (drag.mode !== "create" && !drag.moved) {
      commitDraft(); // клик по заготовке утверждает её
      return;
    }
    forceRender((v) => v + 1);
  };

  const onRightClick = () => {
    if (tool === "area" && draftRef.current) {
      draftRef.current = null;
      dragRef.current = null;
      forceRender((v) => v + 1);
    }
  };

  // ---------- отрисовка поверх карты ----------

  const overlay = (ctx: CanvasRenderingContext2D) => {
    const cell = 7;
    drawCoverage(ctx, p.guns, cell);
    drawDepots(ctx, p.depots, cell);

    const d = draftRef.current ? normRect(draftRef.current) : null;
    if (d && d.w > 0 && d.h > 0) {
      const bad = !draftConnects || !draftAfford;
      ctx.fillStyle = bad ? "rgba(229, 56, 59, 0.28)" : "rgba(229, 90, 43, 0.3)";
      ctx.fillRect(d.x * cell, d.y * cell, d.w * cell, d.h * cell);
      ctx.strokeStyle = bad ? "#ff6b6b" : "#ff9f5a";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(d.x * cell, d.y * cell, d.w * cell, d.h * cell);
      ctx.fillStyle = "#ff9f5a";
      const hs = cell * 1.6;
      for (const [hx, hy] of [
        [d.x, d.y],
        [d.x + d.w, d.y],
        [d.x, d.y + d.h],
        [d.x + d.w, d.y + d.h],
      ]) {
        ctx.fillRect(hx * cell - hs / 2, hy * cell - hs / 2, hs, hs);
      }
    }

    // раскладка: подсвечиваем свободные клетки и тащим контейнер за курсором
    if (tool === "drones" && arranging) {
      ctx.fillStyle = "rgba(214, 168, 92, 0.18)";
      for (const i of freeCells(p.cells, p.guns, p.depots)) {
        ctx.fillRect((i % GRID) * cell, ((i / GRID) | 0) * cell, cell, cell);
      }
      const from = dragDepotRef.current;
      const h2 = hoverRef.current;
      if (from && h2) {
        ctx.strokeStyle = "#d6a85c";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          Math.floor(h2.x) * cell,
          Math.floor(h2.y) * cell,
          cell,
          cell
        );
      }
    }

    const h = hoverRef.current;
    if (h && !d) {
      const cx = Math.floor(h.x);
      const cy = Math.floor(h.y);
      if (cx >= 0 && cy >= 0 && cx < GRID && cy < GRID) {
        const v = p.cells[idx(cx, cy)];
        let ok = false;
        if (tool === "area") ok = !isBuilding(v) && (!hasBuilding || touchesBuilding(p.cells, cx, cy));
        else if (tool === "repair") ok = v === G_BURNT;
        else if (tool === "gun") ok = v === G_BASE && !p.depots.some((q) => q.cx === cx && q.cy === cy);
        if (tool !== "drones") {
          ctx.fillStyle = ok ? "rgba(140, 215, 255, 0.6)" : "rgba(229, 56, 59, 0.55)";
          ctx.fillRect(cx * cell, cy * cell, cell, cell);
        }
      }
    }
  };


  // ---------- экраны ----------

  if (doomed) {
    return (
      <div className="mx-auto max-w-md rounded-md border border-red-900/60 bg-neutral-900/70 p-6 text-center sm:p-8">
        <h2 className="mb-2 text-2xl font-bold text-red-400">Склад выгорел дотла</h2>
        <p className="mb-6 text-sm text-neutral-400">
          Целых клеток не осталось, а на ремонт нет кредитов. Придётся начинать сначала —
          статистика и вражда сохранятся.
        </p>
        <Button
          variant="neutral"
          size="lg"
          onClick={async () => {
            try {
              playerRef.current = await repo.wipe(p);
              setMessage("Новый склад, новые 10 000 кр");
              setVersion((v) => v + 1);
              forceRender((v) => v + 1);
            } catch (e) {
              setMessage(`Не удалось начать заново: ${(e as Error).message}`);
            }
          }}
        >
          Начать заново
        </Button>
      </div>
    );
  }

  const income = dailyIncome(p);
  const pickTool = (id: Tool) => {
    setTool(id);
    draftRef.current = null;
    // на телефоне арсенал живёт в шторке, на десктопе — в боковой колонке
    if (id === "drones") setSheet("arsenal");
  };

  // ---------- содержимое панелей ----------
  // Одни и те же куски разметки идут и в боковую колонку (десктоп),
  // и в шторки (телефон), поэтому собраны здесь один раз.

  const foundBody = (
    <>
      <p className="mb-3 text-neutral-300">
        Потяни по карте — появится красная заготовка. Её можно двигать и тянуть за углы, клик по
        ней утверждает постройку, кнопка «Убрать» отменяет. Одиночный тап по клетке рядом со
        зданием достраивает её сразу.
      </p>
      <div className="mb-3 flex items-center justify-between font-mono">
        <span className="text-neutral-400">Площадь</span>
        <span className={intact >= MIN_BASE_CELLS ? "text-emerald-400" : "text-neutral-100"}>
          {intact}/{MIN_BASE_CELLS}
        </span>
      </div>
      <Button variant="build" block onClick={found} disabled={intact < MIN_BASE_CELLS}>
        Основать склад
      </Button>
    </>
  );

  const arsenalBody = (
    <>
      <p className="mb-3 text-neutral-400">
        Дроны лежат контейнерами прямо на складе — по {DRONES_PER_CELL} штук на клетку. Клетка
        сгорела — дроны в ней пропали.
      </p>
      <dl className="mb-3 space-y-1 font-mono text-sm">
        <Row label="Дронов" value={fmt(drones)} />
        <Row label="Контейнеров" value={String(p.depots.length)} />
        <Row label="Свободных клеток" value={String(free)} />
      </dl>
      <Button variant="neutral" block onClick={buyDrones} disabled={packsAvailable < 1}>
        Купить {DRONE_PACK} за {fmt(DRONE_PACK_COST)} кр
      </Button>
      <p className="mt-2 text-xs text-neutral-500">
        {packsAvailable >= 1
          ? `Можно закупить ещё ${packsAvailable} ${packsAvailable === 1 ? "пачку" : "пачек"}`
          : free < cellsPerPack
          ? `Нужно ещё ${cellsPerPack - free} свободных клеток под контейнеры`
          : "Не хватает кредитов"}
      </p>
      <Button
        block
        active={arranging}
        tone="amber"
        className="mt-3"
        disabled={p.depots.length === 0}
        onClick={() => {
          // раскладывать контейнеры надо по карте — шторка тут только мешает
          if (!arranging) setSheet(null);
          setArranging((v) => !v);
        }}
      >
        {arranging ? "Готово" : "Разместить на складе"}
      </Button>
      {arranging && (
        <p className="mt-2 text-xs text-neutral-500">
          Перетаскивай контейнеры на подсвеченные клетки. Кучно — удобно, но один пожар съест всё
          разом.
        </p>
      )}
    </>
  );

  const attacksBody =
    p.incoming.length === 0 ? (
      <p className="text-neutral-500">
        Пока тихо. Кнопка «+ налёт» присылает атаку от бота — на этапе 1 так проверяем баланс.
      </p>
    ) : (
      <ul className="space-y-2">
        {p.incoming.map((a) => {
          const pat = PATTERNS.find((x) => x.id === a.pattern);
          return (
            <Card key={a.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-neutral-200">{a.from}</div>
                <div className="font-mono text-xs text-neutral-500">
                  {a.drones} дронов · {pat?.name.toLowerCase()}
                  {a.pattern === "lines" ? ` ${EDGE_NAMES[a.direction]}` : ""}
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                disabled={intact === 0}
                onClick={() => {
                  setSheet(null);
                  setBattle(a);
                }}
              >
                Отбить
              </Button>
            </Card>
          );
        })}
      </ul>
    );

  const summonButton = (
    <Button size="sm" onClick={summonAttack}>
      + налёт
    </Button>
  );

  const enemiesBody = (
    <Enemies
      enemies={p.enemies}
      drones={drones}
      onAdd={addEnemy}
      onRaid={doRaid}
      onChanged={() => forceRender((v) => v + 1)}
    />
  );

  const statsBody = (
    <div className="space-y-1 font-mono text-xs text-neutral-400">
      <StatRow label="Боёв" value={p.stats.battles} />
      <StatRow label="Дронов сбито" value={p.stats.dronesKilled} />
      <StatRow label="Клеток сгорело" value={p.stats.cellsBurned} />
      <StatRow label="Клеток починено" value={p.stats.cellsRepaired} />
      <StatRow label="Складов потеряно" value={p.stats.wipes} />
      <StatRow label="Налётов совершено" value={p.stats.raids} />
      <StatRow label="Добыто кредитов" value={p.stats.looted} />
    </div>
  );

  const signOutButton = (
    <Button size="sm" onClick={onSignOut}>
      Выйти
    </Button>
  );

  const accountLine = account ? (
    <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
      <span className="max-w-[14rem] truncate">{account.name ?? account.email}</span>
      {signOutButton}
    </div>
  ) : (
    <span className="shrink-0 font-mono text-xs text-neutral-600">локальный режим</span>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:gap-4">
      {/* шапка телефона: счётчики одной строкой плюс кнопки панелей */}
      <div className="flex shrink-0 items-center gap-2 lg:hidden">
        <ChipBar className="min-w-0 flex-1">
          <Chip label="кр" value={fmt(p.credits)} tone="text-emerald-300" />
          <Chip label="дроны" value={fmt(drones)} />
          <Chip label="клетки" value={fmt(intact)} />
          {burnt > 0 && <Chip label="горело" value={fmt(burnt)} tone="text-orange-300" />}
          <Chip label="пушки" value={fmt(p.guns.length)} />
          <Chip label="/сут" value={`+${fmt(income)}`} tone="text-emerald-300" />
        </ChipBar>
        <IconButton label="Налёты" badge={p.incoming.length} onClick={() => toggleSheet("attacks")}>
          <IconTarget />
        </IconButton>
        <IconButton label="Враги" onClick={() => toggleSheet("enemies")}>
          <IconUsers />
        </IconButton>
        <IconButton label="Меню" onClick={() => toggleSheet("menu")}>
          <IconMenu />
        </IconButton>
      </div>

      {/* шапка десктопа: логотип, счётчики и аккаунт одной строкой */}
      <div className="hidden items-center gap-4 lg:flex">
        <h1 className="shrink-0 text-2xl font-black uppercase tracking-tight">Skladron</h1>
        <ChipBar className="min-w-0 flex-1 flex-wrap px-4 py-3 text-sm">
          <Chip label="кредиты" value={fmt(p.credits)} tone="text-emerald-300" />
          <Chip label="дроны" value={fmt(drones)} />
          <Chip label="целых клеток" value={fmt(intact)} />
          <Chip label="сгорело" value={fmt(burnt)} tone={burnt ? "text-orange-300" : undefined} />
          <Chip label="пушек" value={fmt(p.guns.length)} />
          <Chip label="доход/сут" value={`+${fmt(income)}`} tone="text-emerald-300" />
        </ChipBar>
        {accountLine}
      </div>

      {message && (
        <Notice className="justify-between">
          <span className="min-w-0 truncate lg:whitespace-normal">{message}</span>
          <Button variant="ghost" size="sm" className="-mr-2" onClick={() => setMessage(null)}>
            ✕
          </Button>
        </Notice>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,700px)_20rem] lg:gap-4">
        {/*
          Левая колонка. На телефоне порядок задаём через order-*: карта наверху
          забирает всю свободную высоту, инструменты прижаты к низу под большой палец.
        */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:min-h-0 lg:gap-3">
          <div className="order-3 grid shrink-0 grid-cols-4 gap-1.5 lg:order-1 lg:flex lg:flex-wrap lg:gap-2">
            {TOOLS.map((t) => (
              <Button
                key={t.id}
                active={tool === t.id}
                title={t.hint}
                disabled={!p.founded && t.id !== "area"}
                onClick={() => pickTool(t.id)}
                className="min-w-0 px-2 lg:px-3"
              >
                <span className="truncate">{t.name}</span>
                <span className="hidden font-mono text-[11px] font-normal text-neutral-500 lg:inline">
                  {t.hint}
                </span>
              </Button>
            ))}
          </div>

          <MapCanvas
            className="order-1 min-h-0 flex-1 lg:order-2"
            scene={scene}
            sceneVersion={version}
            overlay={overlay}
            onDown={onDown}
            onMove={onMove}
            onUp={onUp}
            onRightClick={onRightClick}
            onLeave={() => {
              hoverRef.current = null;
              paintingRef.current = false;
            }}
            cursor={tool === "drones" && !arranging ? "default" : tool === "drones" ? "grab" : "crosshair"}
          />

          {tool === "area" && draftRect && draftRect.w > 0 && draftRect.h > 0 && (
            <Notice tone="warn" className="order-2 flex-wrap lg:order-3">
              <span className="font-mono">
                {draftRect.w}×{draftRect.h} · +{draftNew} клеток · {fmt(draftCost)} кр
              </span>
              {!draftConnects && <span className="text-red-400">разрыв со зданием</span>}
              {draftConnects && !draftAfford && (
                <span className="text-red-400">не хватает кредитов</span>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  variant="build"
                  size="sm"
                  onClick={commitDraft}
                  disabled={!draftConnects || !draftAfford}
                >
                  Утвердить
                </Button>
                <Button size="sm" onClick={onRightClick}>
                  Убрать
                </Button>
              </div>
            </Notice>
          )}

          {/* пока склад не основан, счётчик площади держим на виду */}
          {!p.founded && (
            <Notice className="order-2 lg:order-3 lg:hidden">
              <IconButton
                label="Как размечать склад"
                round
                className="h-7 w-7 text-xs"
                onClick={() => setSheet("found")}
              >
                ?
              </IconButton>
              <span className="font-mono">
                <span className="text-neutral-400">площадь </span>
                <span className={intact >= MIN_BASE_CELLS ? "text-emerald-400" : "text-neutral-100"}>
                  {intact}/{MIN_BASE_CELLS}
                </span>
              </span>
              <Button
                variant="build"
                size="sm"
                className="ml-auto"
                onClick={found}
                disabled={intact < MIN_BASE_CELLS}
              >
                Основать
              </Button>
            </Notice>
          )}

          {/* входящий налёт не должен теряться в шторке */}
          {p.founded && p.incoming.length > 0 && (
            <Notice tone="danger" className="order-2 lg:order-3 lg:hidden">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="min-w-0 truncate">
                Налёт: {p.incoming[0].from} · {p.incoming[0].drones} дронов
              </span>
              <Button
                variant="danger"
                size="sm"
                className="ml-auto"
                onClick={() => setSheet("attacks")}
              >
                {p.incoming.length > 1 ? `Отбить (${p.incoming.length})` : "Отбить"}
              </Button>
            </Notice>
          )}
        </div>

        {/* боковая колонка десктопа */}
        <aside className="hidden min-h-0 space-y-4 overflow-y-auto text-sm lg:block">
          {!p.founded ? (
            <Panel title="Разметка склада">{foundBody}</Panel>
          ) : (
            <>
              {tool === "drones" && <Panel title="Арсенал">{arsenalBody}</Panel>}
              <Panel title="Входящие атаки" action={summonButton}>
                {attacksBody}
              </Panel>
              <Panel title="Враги">{enemiesBody}</Panel>
              <Panel title="Статистика">{statsBody}</Panel>
            </>
          )}
        </aside>
      </div>

      {/* мобильные шторки */}
      <Sheet open={sheet === "found"} title="Разметка склада" onClose={() => setSheet(null)}>
        {foundBody}
      </Sheet>
      <Sheet open={sheet === "arsenal"} title="Арсенал" onClose={() => setSheet(null)}>
        {p.founded ? arsenalBody : <p className="text-neutral-500">Сначала основай склад.</p>}
      </Sheet>
      <Sheet open={sheet === "attacks"} title="Входящие атаки" onClose={() => setSheet(null)}>
        <div className="mb-3 flex justify-end">{summonButton}</div>
        {attacksBody}
      </Sheet>
      <Sheet open={sheet === "enemies"} title="Враги" onClose={() => setSheet(null)}>
        {enemiesBody}
      </Sheet>
      <Sheet open={sheet === "menu"} title="Склад" onClose={() => setSheet(null)}>
        <div className="space-y-5">
          <div>
            <div className="mb-2">
              <SectionTitle>Статистика</SectionTitle>
            </div>
            {statsBody}
          </div>
          <div>
            <div className="mb-2">
              <SectionTitle>Управление</SectionTitle>
            </div>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-neutral-400">
              <li>Тап по клетке рядом со зданием — достроить её.</li>
              <li>Протяжка — заготовка площади, её надо утвердить.</li>
              <li>Два пальца — зум и перетаскивание карты.</li>
            </ul>
          </div>
          <div>
            <div className="mb-2">
              <SectionTitle>Аккаунт</SectionTitle>
            </div>
            {account ? (
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-neutral-300">
                  {account.name ?? account.email}
                </span>
                {signOutButton}
              </div>
            ) : (
              <span className="font-mono text-xs text-neutral-600">локальный режим</span>
            )}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
