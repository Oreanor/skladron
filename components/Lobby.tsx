"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  GRID,
  G_BASE,
  G_BURNT,
  G_GROUND,
  DRONES_PER_CELL,
  type Rect,
  applyRect,
  depotKind,
  droneCount,
  countFreeCells,
  countKind,
  gunKind,
  type GunKind,
  isWhole,
  scrapRect,
  idx,
  isBuilding,
  burntCellsIn,
  newCellsIn,
  normRect,
  rectConnects,
  repairRect,
  touchesBuilding,
} from "@/lib/base";
import {
  CELL_COST,
  STARTER_SIDE,
  DRONE_UNIT_COST,
  INSURANCE_CELL,
  MAX_INSURANCE_LEVEL,
  LOAN_HOURS,
  LOAN_MAX,
  LOAN_MIN,
  LOAN_RATE,
  LOAN_STEP,
  SALE_MULTIPLIER,
  SHIFT_HOURS,
  SCRAP_REWARD,
  priceAt,
  loanDebt,
  goodsValue,
  insurance,
  insuranceShare,
  GUN_COST,
  SPRAY_COST,
  TRAP_COST,
  MIN_BASE_CELLS,
  REPAIR_COST,
  SCOUT_UNIT_COST,
  maxLevel,
  UPGRADE_KINDS,
  upgradeCost,
  type UpgradeKind,
  fmt,
} from "@/lib/economy";
import {
  PATTERNS,
  payloadCost,
  raidDifficulty,
  raidSize,
  raidTotal,
  type AttackOrder,
  type AttackReport,
  type Pattern,
  type RaidLog,
  type WavePlan,
  makeOrder,
} from "@/lib/attack";
import {
  MAX_BASE_NAME,
  burntCells,
  shiftIncome,
  intactCells,
  isDoomed,
  normName,
  type Player,
} from "@/lib/player";
import { getRepo } from "@/lib/repo";
import {
  type Enemy,
  blankEnemy,
  makeEnemy,
} from "@/lib/enemy";
import type { Account } from "./AuthGate";
import Enemies from "./Enemies";
import { drawCoverage, drawDepots, type View } from "@/lib/render";
import { gunRange, sprayRange, trapRange } from "@/lib/engine";
import { RAID } from "@/lib/tuning";
import Battle, { type BattleOutcome } from "./Battle";
import TestRaidDialog from "./lobby/TestRaidDialog";
import AttackReportDialog from "./lobby/AttackReportDialog";
import BaseName from "./lobby/BaseName";
import { TEST_RAID_MAX } from "./lobby/limits";
import {
  drawDraft,
  drawDropTarget,
  drawFreeCells,
  drawHoverCell,
  drawHoverLabel,
  drawPriceTags,
  dropAllowed,
  onMap,
} from "./lobby/overlay";
import {
  BOT_COUNT,
  DEFAULT_PANELS,
  PANELS_KEY,
  TOOLS,
  findFoe,
  readPanels,
  type ModalId,
  type SheetId,
  type Tool,
  type ToolId,
} from "./lobby/tools";
import Scout, { type ScoutOutcome } from "./Scout";
import ScoutMap from "./ScoutMap";
import Replay, { type ReplayData } from "./Replay";
import Rules from "./Rules";
import { notifyBattle } from "@/lib/notify";

/** Имя бота из настроек сборки: без него привязывать некуда. */
const TG_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT;
import MapCanvas, { type Pt } from "./MapCanvas";
import AccountMenu, { SettingsList } from "./AccountMenu";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";
import {
  Play,
  Trash2,
} from "lucide-react";
import { autoDefend, type UnattendedOutcome } from "@/lib/unattended";
import {
  decodeRle,
  encodeRle,
  fogPatches,
  type DroneKind,
  type Gun,
} from "@/lib/base";
import {
  Button,
  IconButton,
  IconMenu,
  IconTarget,
  IconUsers,
  ConfirmDialog,
  NameDialog,
  Modal,
  Panel,
  Row,
  SectionTitle,
  MESSAGE_MS,
  Sheet,
  StatRow,
  ToolButton,
} from "./ui";

export default function Lobby({
  account,
  onSignOut,
}: {
  account: Account | null;
  onSignOut: () => void;
}) {
  const t = useT();
  /**
   * Опросы заводятся один раз на всю игру, а переводчик меняется вместе с
   * языком. Читаем его через ref, иначе интервалы замыкают самый первый t
   * и до перезагрузки говорят на языке, с которого игрок уже ушёл.
   */
  const tRef = useRef(t);
  tRef.current = t;
  const repo = getRepo();
  const playerRef = useRef<Player | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useState(0);
  const [tool, setTool] = useState<Tool>("area");
  /** Выбранный инструмент помним между заходами — он тоже настройка. */
  const toolRef = useRef<Tool>("area");
  toolRef.current = tool;
  const [message, setMessage] = useState<string | null>(null);
  const [battle, setBattle] = useState<AttackOrder | null>(null);
  /** Открыт ли планировщик пробного налёта на себя. */
  const [testRaidOpen, setTestRaid] = useState(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [modal, setModal] = useState<ModalId | null>(null);
  const [naming, setNaming] = useState<"found" | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [loanAmount, setLoanAmount] = useState(LOAN_MIN);
  /** Чью снятую карту сейчас смотрим и что на ней успело устареть. */
  const [mapOf, setMapOf] = useState<Enemy | null>(null);
  const [stale, setStale] = useState<number[]>([]);
  /** Что сейчас крутим: чей бой и сама запись. */
  const [watching, setWatching] = useState<
    { id: string; name: string; replay: ReplayData } | null
  >(null);
  const [showRules, setShowRules] = useState(false);
  const [telegram, setTelegram] = useState<{ code: string; linked: boolean } | null>(null);
  const [panelOrder, setPanelOrder] = useState(DEFAULT_PANELS);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [dragPanel, setDragPanel] = useState<string | null>(null);
  /** Журнал боёв: и свои налёты, и те, где отбивался. */
  const [raids, setRaids] = useState<RaidLog[]>([]);
  /** Идущий разведвылет: карта врага, его пушки и сколько самолётов послали. */
  const [scout, setScout] = useState<{
    enemy: Enemy;
    cells: Uint8Array;
    guns: Gun[];
    planes: number;
    /** Уровень пушек противника — они стреляют дальше и точнее. */
    gunLevel: number;
    /** Квадраты, устаревшие с прошлой разведки: летим смотреть заново. */
    stale: number[];
  } | null>(null);
  /** Итог налёта, который прошёл без игрока. */
  const [autoReport, setAutoReport] = useState<
    { from: string; outcome: UnattendedOutcome } | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  /** Атаки, которые уже прошли автоматом: опрос не должен их воскрешать. */
  const resolvedRef = useRef(new Set<string>());
  const autoBusyRef = useRef(false);
  /** Когда последний раз сверяли имена чужих складов. */
  const namesAt = useRef(0);
  const [reports, setReports] = useState<AttackReport[]>([]);
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
  /** Ценники, всплывающие над клеткой в момент покупки. */
  const priceTags = useRef<{ x: number; y: number; text: string; gain: boolean; at: number }[]>([]);
  /** Последняя нарисованная рамка: по ней решаем, нужен ли React-рендер. */
  const draftKey = useRef("");
  const paintingRef = useRef(false);
  // раскладка контейнеров
  const dragDepotRef = useRef<{ cx: number; cy: number } | null>(null);
  const dragGunRef = useRef<{ cx: number; cy: number } | null>(null);

  /** Пишем склад с задержкой: на сервере это одна проверяемая операция. */
  /**
   * Сервер отверг запись — значит наша копия склада разъехалась с его.
   * Дальше без синхронизации отвергалась бы каждая следующая правка, поэтому
   * берём серверную версию: она и есть настоящая.
   */
  // Раскладку панелей помним в браузере: она про привычку, а не про склад.
  useEffect(() => {
    const saved = readPanels();
    setPanelOrder(saved.order);
    setHidden(saved.hidden);
    if (saved.tool) setTool(saved.tool);
  }, []);

  const savePanels = (
    order: string[],
    next: Record<string, boolean>,
    activeTool: Tool = toolRef.current
  ) => {
    try {
      window.localStorage.setItem(
        PANELS_KEY,
        JSON.stringify({ order, hidden: next, tool: activeTool })
      );
    } catch {
      // приватный режим — переживём, просто не запомним
    }
  };

  const togglePanel = (id: string) => {
    setHidden((cur) => {
      const next = { ...cur, [id]: !cur[id] };
      savePanels(panelOrder, next);
      return next;
    });
  };

  /** Перетаскивание: тащим одну панель поверх другой — они меняются местами. */
  const movePanel = (over: string) => {
    setPanelOrder((cur) => {
      if (!dragPanel || dragPanel === over) return cur;
      const from = cur.indexOf(dragPanel);
      const to = cur.indexOf(over);
      if (from < 0 || to < 0) return cur;
      const next = cur.slice();
      next.splice(from, 1);
      next.splice(to, 0, dragPanel);
      savePanels(next, hidden);
      return next;
    });
  };

  const loadRaids = () => {
    void repo
      .raidLog()
      .then((rows) => setRaids(rows))
      .catch(() => {
        // журнал — не игра, из-за него ломаться нечему
      });
  };

  const resyncBase = async () => {
    const cur = playerRef.current;
    if (!cur) return;
    try {
      await repo.reloadBase(cur);
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
    } catch {
      // не достучались — попробуем при следующей правке
    }
  };

  const saveNow = async () => {
    const cur = playerRef.current;
    if (!cur) return;
    try {
      const patch = await repo.saveBase(cur);
      if (patch.credits !== undefined) cur.credits = patch.credits;
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("save.rejected", { error: (e as Error).message }));
      await resyncBase();
    }
  };

  const persist = () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => void saveNow(), 400);
  };

  /** Досохранить прямо сейчас: перед налётом склад должен лежать на сервере. */
  const flushPersist = async () => {
    if (!persistTimer.current) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = null;
    await saveNow();
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
      .then(({ player, income, reports: loadedReports }) => {
        if (!alive) return;
        playerRef.current = player;
        setReports(loadedReports);
        setReady(true);
        loadRaids();
        if (income.credits > 0) {
          const sold = income.sold;
          setMessage(
            t("income.collected", {
              hours: income.days * SHIFT_HOURS,
              credits: fmt(income.credits),
            }) +
              (sold && (sold.drones || sold.scouts)
                ? t("income.sold", {
                    drones: sold.drones,
                    // Считаем по тем же ценам, что и сервер: с учётом уровня.
                    // Иначе в сообщении стояла бы одна сумма, а на счёт
                    // приходила другая.
                    dronesValue: fmt(
                      sold.drones *
                        priceAt(DRONE_UNIT_COST, player.levels.drones) *
                        SALE_MULTIPLIER
                    ),
                    scouts: sold.scouts,
                    scoutsValue: fmt(
                      sold.scouts *
                        priceAt(SCOUT_UNIT_COST, player.levels.scouts) *
                        SALE_MULTIPLIER
                    ),
                  })
                : "")
          );
        }
      })
      .catch((e) => {
        if (!alive) return;
        setMessage(t("load.failed", { error: (e as Error).message }));
        setReady(true);
      });
    return () => {
      alive = false;
    };
    // Загрузка профиля бывает ровно одна на заход: t и loadRaids тут нужны
    // такими, какими были в этот момент, и перезапуск по их смене только
    // заново дёрнул бы сервер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  useEffect(() => {
    if (repo.mode !== "cloud") return;
    let alive = true;
    const sync = async () => {
      // В свёрнутой вкладке опрашивать некого: игрок всё равно не смотрит,
      // а запросы идут. Вернётся — синхронизируемся сразу.
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const state = await repo.syncAttacks();
        const cur = playerRef.current;
        if (!alive || !cur) return;
        // Очередь сервера — только настоящие налёты. Боты с кнопки «+ налёт»
        // живут на клиенте, и раньше их сносил первый же опрос: список
        // подменялся серверным целиком. Теперь сливаем оба и сортируем по
        // времени — очередь остаётся одна и в правильном порядке.
        const bots = cur.incoming.filter((a) => !a.remote);
        cur.incoming = [
          ...state.incoming.filter((a) => !resolvedRef.current.has(a.id)),
          ...bots,
        ].sort((a, b) => a.createdAt - b.createdAt);
        if (state.credits !== undefined) cur.credits = state.credits;
        if (state.stats) cur.stats = { ...cur.stats, ...state.stats };
        // Кто на нас напал, тот попадает в список: иначе ответить некому.
        let met = false;
        for (const a of cur.incoming) {
          const mail = a.fromEmail;
          if (!mail) continue;
          if (cur.enemies.some((e) => e.email.toLowerCase() === mail.toLowerCase())) continue;
          cur.enemies.push(blankEnemy(mail, a.from));
          met = true;
        }
        if (met) void repo.saveEnemies(cur).catch(() => {});

        setReports(state.reports);
        forceRender((value) => value + 1);
      } catch {
        // Сеть может кратко пропасть — следующий опрос повторит попытку.
      }

      // Склад врага могли переименовать прямо сейчас — раз в пять минут
      // сверяем имена, чтобы список не звал человека вчерашним именем.
      if (Date.now() - namesAt.current < 5 * 60_000) return;
      namesAt.current = Date.now();
      try {
        const cur = playerRef.current;
        if (!cur?.enemies.length) return;
        const names = await repo.baseNames(cur.enemies.map((e) => e.email));
        let changed = false;
        for (const e of cur.enemies) {
          const fresh = names.get(e.email.toLowerCase());
          if (fresh && fresh !== e.name) {
            e.name = fresh;
            changed = true;
          }
        }
        if (changed && alive) forceRender((value) => value + 1);
      } catch {
        // имена — украшение списка, из-за них опрос ломаться не должен
      }
    };
    const timer = window.setInterval(() => void sync(), 10_000);
    const onVisible = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [repo]);

  /**
   * Атаки отбиваются строго по очереди. У первой в списке идут часы: не успел
   * за RAID.ttlMs — налёт проходит сам, без брандспойта и пулемёта, и очередь
   * двигается дальше. Тикаем раз в секунду, но только когда есть что считать.
   */
  useEffect(() => {
    const tick = async () => {
      const cur = playerRef.current;
      const head = cur?.incoming[0];
      // время нужно не только очереди налётов: по нему же идёт срок займа
      if (cur?.loan) setNow(Date.now());
      if (!cur || !head) return;
      if (!head.activatedAt) {
        // сервер отметит своим временем при ближайшем опросе, а бот-атаки
        // живут только на клиенте — часы им заводим здесь
        head.activatedAt = Date.now();
        forceRender((v) => v + 1);
        return;
      }
      setNow(Date.now());
      if (Date.now() < head.activatedAt + RAID.ttlMs) return;
      if (autoBusyRef.current) return;

      autoBusyRef.current = true;
      try {
        // Уровни передаём все: пушки и огнетушители работают сами, и сервер
        // пересчитает бой ровно с ними же. Раньше сюда шли одни пушки, и
        // показанный игроку исход расходился бы с посчитанным на сервере.
        const o = autoDefend(cur.cells, cur.guns, cur.depots, head, {
          guns: cur.levels.guns,
          sprays: cur.levels.sprays,
          traps: cur.levels.traps,
          mg: cur.levels.mg,
          water: cur.levels.water,
        });
        resolvedRef.current.add(head.id);
        const goodsBefore = goodsValue(cur.depots);
        cur.cells = o.cells;
        cur.guns = o.guns;
        cur.depots = o.depots;
        cur.incoming = cur.incoming.filter((a) => a.id !== head.id);
        cur.stats.battles++;
        const killed = o.result.killedByGuns + o.result.killedByMg;
        cur.stats.dronesKilled += killed;
        cur.stats.cellsBurned += o.result.burned;
        // страховка погорельцу: ремонт клеток и половина сгоревшего добра
        cur.credits += insurance(
          o.result.burned,
          goodsBefore - goodsValue(o.depots),
          o.result.gunsLost,
          cur.levels.insurance,
          o.result.spraysLost,
          o.result.trapsLost
        );
        const foe = findFoe(cur, head);
        if (foe) {
          foe.burnedByThem += o.result.burned;
          void repo.saveEnemies(cur).catch(() => {});
        }
        setAutoReport({ from: head.from, outcome: o });
        setVersion((v) => v + 1);
        forceRender((v) => v + 1);
        try {
          const patch = await repo.applyBattle(
            cur,
            o.result,
            head.remote ? head.id : undefined,
            "" // некому было ни тушить, ни стрелять: запись пустая
          );
          if (head.remote) notifyBattle(head.id, "resolved");
          if (patch.credits !== undefined) cur.credits = patch.credits;
          forceRender((v) => v + 1);
        } catch (e) {
          setMessage(tRef.current("auto.notSaved", { error: (e as Error).message }));
          // Сервер не принял итог — значит налёт у него всё ещё в очереди.
          // Снимаем отметку, иначе опрос будет вечно выкидывать его из
          // списка, а очередь разбирается строго по одному: за ним встанут
          // все следующие и не сдвинутся до перезагрузки страницы.
          resolvedRef.current.delete(head.id);
          // урон не записался — не тащим сгоревшую карту дальше, иначе
          // отвергаться будет и ремонт, и всё остальное
          await resyncBase();
        }
      } finally {
        autoBusyRef.current = false;
      }
    };
    const timer = window.setInterval(() => void tick(), 1000);
    return () => window.clearInterval(timer);
    // Таймер один на всю игру. Всё, что он зовёт, он берёт через ref или из
    // playerRef, а resyncBase пересоздаётся каждым рендером — перезаводить
    // из-за него секундный интервал незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  /**
   * Пробные налёты по ссылке: ?raid=flower,sweep&n=220 кладёт в очередь по
   * налёту на каждый названный режим. Нужны, чтобы посмотреть новую раскладку
   * на своём складе, не дожидаясь бота. Параметр сразу убираем из адреса —
   * иначе обновление страницы сыпало бы новые рои.
   */
  useEffect(() => {
    const cur = playerRef.current;
    if (!ready || !cur) return;
    const q = new URLSearchParams(window.location.search);
    const list = (q.get("raid") ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => (PATTERNS as string[]).includes(name)) as Pattern[];
    if (!list.length) return;
    const size = Math.min(TEST_RAID_MAX, Math.max(30, Number(q.get("n")) || 200));
    for (const pattern of list) {
      cur.incoming.push(
        makeOrder(
          t(`bot.${(Math.random() * BOT_COUNT) | 0}` as Key),
          size,
          pattern,
          (Math.random() * 4) | 0
        )
      );
    }
    window.history.replaceState({}, "", window.location.pathname);
    touch();
    setMessage(t("raid.testQueued", { count: list.length, size }));
    // разовый запуск: как только игрок загрузился, налёты уже в очереди
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  const p = playerRef.current;
  /**
   * Всё, что требует прохода по десяти тысячам клеток. Пересчитываем только
   * когда склад менялся: рендер случается и от движения мыши, и раз в секунду
   * при идущей атаке, а таких проходов тут было пять на каждый.
   */
  const counts = useMemo(() => {
    if (!p) return { intact: 0, burnt: 0, free: 0, drones: 0, scouts: 0 };
    return {
      intact: intactCells(p),
      burnt: burntCells(p),
      free: countFreeCells(p.cells, p.guns, p.depots),
      drones: droneCount(p.depots, "basic"),
      scouts: droneCount(p.depots, "scout"),
    };
    // version меняется при любой правке склада — он и есть ключ кэша
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, version]);
  // Сцена собирается на каждом React-обновлении. Это важно для ремонта и
  // drag-and-drop: там массив клеток/контейнеров заменяется целиком, чтобы
  // canvas гарантированно получил новое состояние, а не старую ссылку.
  const scene = p
    ? { cells: p.cells, guns: p.guns, depots: p.depots }
    : { cells: new Uint8Array(0), guns: [], depots: [] };

  if (!ready || !p) {
    return <div className="p-6 text-sm text-neutral-500">{t("app.loading")}</div>;
  }

  const { intact, burnt, drones, scouts } = counts;
  /** Во что обходится дрон при нынешнем уровне: от него считается надбавка. */
  const droneCost = priceAt(DRONE_UNIT_COST, p.levels.drones);
  // то же самое, но под ключи кнопок: у каждой в углу своё число
  /** Во что обойдётся то, что ставит этот инструмент, с учётом прокачки. */
  const toolPrice = (item: (typeof TOOLS)[number]) => {
    if (item.id === "gun") return priceAt(GUN_COST, p.levels.guns);
    if (item.id === "spray") return priceAt(SPRAY_COST, p.levels.sprays);
    if (item.id === "trap") return priceAt(TRAP_COST, p.levels.traps);
    if (item.id === "drones") return priceAt(DRONE_UNIT_COST, p.levels.drones) * DRONES_PER_CELL;
    if (item.id === "scouts") return priceAt(SCOUT_UNIT_COST, p.levels.scouts) * DRONES_PER_CELL;
    return item.vars.cost;
  };

  /** Числа для подсказки: что прокачано, то показываем по уровню. */
  const toolVars = (item: (typeof TOOLS)[number]) => {
    if (item.id === "spray")
      return { ...item.vars, range: Math.round(sprayRange({ sprayLevel: p.levels.sprays })) };
    if (item.id === "trap")
      return { ...item.vars, range: Math.round(trapRange({ trapLevel: p.levels.traps })) };
    return item.vars;
  };

  const counters = {
    intact,
    burnt,
    guns: countKind(p.guns, "gun"),
    sprays: countKind(p.guns, "spray"),
    traps: countKind(p.guns, "trap"),
    drones,
    scouts,
    // у кредита в углу висит долг, а если долгов нет — ничего
    loan: p.loan || undefined,
  };
  const hasBuilding = intact + burnt > 0;
  const doomed = isDoomed(p, intact);
  // ---------- бой ----------

  if (battle) {
    return (
      <Battle
        cells={p.cells}
        guns={p.guns}
        depots={p.depots}
        order={battle}
        levels={{
          guns: p.levels.guns,
          sprays: p.levels.sprays,
          traps: p.levels.traps,
          mg: p.levels.mg,
          water: p.levels.water,
        }}
        insuranceLevel={p.levels.insurance}
        onFinish={async (o: BattleOutcome) => {
          const goodsBefore = goodsValue(p.depots);
          p.cells = o.cells;
          p.guns = o.guns;
          p.depots = o.depots;
          p.incoming = p.incoming.filter((a) => a.id !== battle.id);
          // Сервер узнает об исходе только из applyBattle ниже, а опрос идёт
          // раз в десять секунд и собирает очередь заново. Без этой отметки
          // только что отбитый рой успевал вернуться в список.
          resolvedRef.current.add(battle.id);
          p.stats.battles++;
          const killed = o.result.killedByGuns + o.result.killedByMg;
          p.stats.dronesKilled += killed;
          p.stats.cellsBurned += o.result.burned;
          p.credits += insurance(
            o.result.burned,
            goodsBefore - goodsValue(o.depots),
            o.result.gunsLost,
            p.levels.insurance,
            o.result.spraysLost,
            o.result.trapsLost
          );
          // Счёт вражды: записываем, сколько он у нас сжёг. Ищем по почте —
          // имя склада не уникально и меняется переименованием.
          const foe = findFoe(p, battle);
          if (foe) {
            foe.burnedByThem += o.result.burned;
            void repo.saveEnemies(p).catch(() => {});
          }
          setBattle(null);
          setMessage(
            o.won
              ? t("battle.repelled", { killed })
              : t("battle.burntDown", { from: battle.from })
          );
          setVersion((v) => v + 1);
          forceRender((v) => v + 1);
          try {
            // урон пишем отдельной операцией: она умеет только ухудшать карту
            const patch = await repo.applyBattle(
              p,
              o.result,
              battle.remote ? battle.id : undefined,
              o.trace
            );
            if (battle.remote) notifyBattle(battle.id, "resolved");
            if (patch.credits !== undefined) p.credits = patch.credits;
            forceRender((v) => v + 1);
          } catch (e) {
            setMessage(t("battle.notSaved", { error: (e as Error).message }));
            // Тот же случай: у сервера бой остался неотбитым, и показать его
            // снова надо — иначе отбиваться будет нечем, а очередь встанет.
            resolvedRef.current.delete(battle.id);
            await resyncBase();
          } finally {
            loadRaids();
          }
        }}
      />
    );
  }

  if (mapOf?.scout) {
    return (
      <ScoutMap
        name={mapOf.name}
        snapshot={mapOf.scout}
        stale={stale}
        onClose={() => setMapOf(null)}
      />
    );
  }

  if (scout) {
    const known = scout.enemy.scout
      ? fogPatches(decodeRle(scout.enemy.scout.seen), scout.stale)
      : null;
    return (
      <Scout
        name={scout.enemy.name}
        cells={scout.cells}
        guns={scout.guns}
        planes={scout.planes}
        level={p.levels.scouts}
        gunLevel={scout.gunLevel}
        known={known}
        onFinish={async (o: ScoutOutcome) => {
          const foe = p.enemies.find((e) => e.id === scout.enemy.id);
          if (foe) {
            foe.scout = {
              seen: encodeRle(o.seen),
              cells: encodeRle(o.cells),
              guns: o.guns.filter((g) => o.seen[g.cy * GRID + g.cx]),
              at: Date.now(),
            };
          }
          setScout(null);
          forceRender((v) => v + 1);
          try {
            await repo.saveEnemies(p);
          } catch (e) {
            setMessage(t("enemies.notSaved", { error: (e as Error).message }));
          }
        }}
      />
    );
  }

  // ---------- инструменты ----------

  // Рамкой работают и «Площадь», и «Ремонт»: выделил, подправил, утвердил.
  // Разница только в том, что считается внутри рамки и почём.
  const drafting = tool === "area" || tool === "repair" || tool === "scrap";
  const draft = draftRef.current;
  const draftRect = draft ? normRect(draft) : null;
  const draftCells = draftRect
    ? tool === "repair" || tool === "scrap"
      ? burntCellsIn(p.cells, draftRect)
      : newCellsIn(p.cells, draftRect)
    : 0;
  const draftCost =
    draftCells * (tool === "scrap" ? -SCRAP_REWARD : tool === "repair" ? REPAIR_COST : CELL_COST);
  // Снос не должен разваливать склад надвое: примеряем результат заранее.
  const scrapWhole =
    tool !== "scrap" || !draftRect || draftCells === 0
      ? true
      : (() => {
          const next = p.cells.slice();
          scrapRect(next, draftRect);
          return isWhole(next);
        })();
  // ремонт ничего не пристраивает, поэтому разрывов создать не может;
  // у сноса своя проверка — он их как раз создаёт
  const draftConnects =
    tool === "repair"
      ? true
      : tool === "scrap"
      ? scrapWhole
      : draftRect
      ? rectConnects(p.cells, draftRect, hasBuilding)
      : false;
  const draftAfford = draftCost <= p.credits;

  const commitDraft = () => {
    if (!draftRect || draftRect.w <= 0 || draftRect.h <= 0) return;
    if (!draftConnects) {
      setMessage(t("draft.mustBeSolid"));
      return;
    }
    if (!draftAfford) {
      setMessage(t("draft.needCredits", { cost: fmt(draftCost) }));
      return;
    }
    if (draftCells === 0) {
      draftRef.current = null;
      dragRef.current = null;
      forceRender((v) => v + 1);
      return;
    }

    const cells = p.cells.slice();
    if (tool === "scrap") {
      scrapRect(cells, draftRect);
      setMessage(t("scrap.done", { cells: draftCells, gain: fmt(draftCells * SCRAP_REWARD) }));
    } else if (tool === "repair") {
      repairRect(cells, draftRect);
      p.stats.cellsRepaired += draftCells;
      setMessage(t("repair.done", { cells: draftCells, cost: fmt(draftCost) }));
    } else {
      applyRect(cells, draftRect);
      setMessage(t("draft.built", { cells: draftCells, cost: fmt(draftCost) }));
    }
    p.cells = cells;
    p.credits -= draftCost;
    draftRef.current = null;
    dragRef.current = null;
    touch();
  };

  const buildOne = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    const i = idx(x, y);
    if (isBuilding(p.cells[i])) return;
    if (hasBuilding && !touchesBuilding(p.cells, x, y)) {
      setMessage(t("draft.mustBeSolid"));
      return;
    }
    const cost = CELL_COST;
    if (p.credits < cost) {
      setMessage(t("draft.noCredits"));
      return;
    }
    p.cells[i] = G_BASE;
    p.credits -= cost;
    touch();
  };

  /** Снос одной клетки. Если она держит склад вместе — не даём. */
  const scrapAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    const i = idx(x, y);
    if (p.cells[i] !== G_BURNT) return;
    const cells = p.cells.slice();
    cells[i] = G_GROUND;
    if (!isWhole(cells)) {
      setMessage(t("scrap.splits"));
      return;
    }
    p.cells = cells;
    p.credits += SCRAP_REWARD;
    showPrice(x, y, SCRAP_REWARD);
    touch();
  };

  const repairAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    const i = idx(x, y);
    if (p.cells[i] !== G_BURNT) return;
    if (p.credits < REPAIR_COST) {
      setMessage(t("repair.noCredits"));
      return;
    }
    const cells = p.cells.slice();
    cells[i] = G_BASE;
    p.cells = cells;
    p.credits -= REPAIR_COST;
    p.stats.cellsRepaired++;
    touch();
  };

  const gunAt = (x: number, y: number, kind: GunKind = "gun") => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    if (p.cells[idx(x, y)] !== G_BASE) {
      setMessage(t("gun.onlyIntact"));
      return;
    }
    if (p.depots.some((d) => d.cx === x && d.cy === y)) {
      setMessage(t("gun.cellBusy"));
      return;
    }
    const cost =
      kind === "spray"
        ? priceAt(SPRAY_COST, p.levels.sprays)
        : kind === "trap"
          ? priceAt(TRAP_COST, p.levels.traps)
          : priceAt(GUN_COST, p.levels.guns);
    if (p.credits < cost) {
      setMessage(t("gun.noCredits"));
      return;
    }
    p.guns.push(kind === "gun" ? { cx: x, cy: y } : { cx: x, cy: y, kind });
    p.credits -= cost;
    showPrice(x, y, -cost);
    touch();
  };

  /**
   * Контейнер покупается прямо на карте, как пушка: ткнул в свободную клетку —
   * появился ящик на десять дронов, деньги списались. Никаких окошек.
   */
  const buyDepotAt = async (x: number, y: number, kind: DroneKind) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    if (p.cells[idx(x, y)] !== G_BASE) {
      setMessage(t("depot.onlyIntact"));
      return;
    }
    if (p.guns.some((g) => g.cx === x && g.cy === y)) {
      setMessage(t("depot.gunThere"));
      return;
    }
    if (p.depots.some((d) => d.cx === x && d.cy === y)) return;
    const cost =
      priceAt(
        kind === "scout" ? SCOUT_UNIT_COST : DRONE_UNIT_COST,
        kind === "scout" ? p.levels.scouts : p.levels.drones
      ) * DRONES_PER_CELL;
    if (p.credits < cost) {
      setMessage(t("depot.noCredits", { cost: fmt(cost) }));
      return;
    }
    const previousDepots = p.depots;
    const previousCredits = p.credits;
    p.depots = [
      ...p.depots,
      kind === "scout"
        ? { cx: x, cy: y, n: DRONES_PER_CELL, kind }
        : { cx: x, cy: y, n: DRONES_PER_CELL },
    ];
    p.credits -= cost;
    showPrice(x, y, -cost);
    setVersion((v) => v + 1);
    forceRender((v) => v + 1);
    try {
      const patch = await repo.buyDrones(p, DRONES_PER_CELL, kind);
      if (patch.credits !== undefined) p.credits = patch.credits;
      forceRender((v) => v + 1);
    } catch (e) {
      p.depots = previousDepots;
      p.credits = previousCredits;
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
      setMessage(t("arsenal.buyFailed", { error: (e as Error).message }));
    }
  };

  /** Перетаскивание контейнера на свободную клетку. */
  const moveDepot = (from: { cx: number; cy: number }, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    if (p.cells[idx(x, y)] !== G_BASE) {
      setMessage(t("depot.onlyIntact"));
      return;
    }
    if (p.guns.some((g) => g.cx === x && g.cy === y)) {
      setMessage(t("depot.gunThere"));
      return;
    }
    if (
      p.depots.some(
        (d) =>
          (d.cx !== from.cx || d.cy !== from.cy) && d.cx === x && d.cy === y
      )
    ) {
      setMessage(t("depot.taken"));
      return;
    }
    const depotIndex = p.depots.findIndex((q) => q.cx === from.cx && q.cy === from.cy);
    if (depotIndex < 0) return;
    p.depots = p.depots.map((depot, index) =>
      index === depotIndex ? { ...depot, cx: x, cy: y } : depot
    );
    touch();
  };

  /** Перетаскивание пушки на другую целую клетку. Деньги при этом не трогаем. */
  const moveGun = (from: { cx: number; cy: number }, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    if (p.cells[idx(x, y)] !== G_BASE) {
      setMessage(t("gun.onlyIntact"));
      return;
    }
    if (p.guns.some((g) => (g.cx !== from.cx || g.cy !== from.cy) && g.cx === x && g.cy === y)) {
      setMessage(t("gun.gunThere"));
      return;
    }
    if (p.depots.some((d) => d.cx === x && d.cy === y)) {
      setMessage(t("gun.cellBusy"));
      return;
    }
    const at = p.guns.findIndex((g) => g.cx === from.cx && g.cy === from.cy);
    if (at < 0) return;
    p.guns = p.guns.map((g, i) => (i === at ? { ...g, cx: x, cy: y } : g));
    touch();
  };

  /** Основание идёт следом за именем: безымянных складов не заводим. */
  const found = async (rawName: string) => {
    if (intact < MIN_BASE_CELLS) return;
    const name = normName(rawName);
    if (!name) return;
    p.name = name;
    p.founded = true;
    p.lastIncomeAt = Date.now();
    setNaming(null);
    setMessage(t("base.founded", { name }));
    touch();
    try {
      await repo.rename(p, name);
    } catch (e) {
      setMessage(t("base.nameNotSaved", { error: (e as Error).message }));
    }
  };

  const rename = async (rawName: string) => {
    const name = normName(rawName);
    if (!name || name === p.name) {
      setNaming(null);
      return;
    }
    const prev = p.name;
    p.name = name;
    setNaming(null);
    forceRender((v) => v + 1);
    try {
      await repo.rename(p, name);
      setMessage(t("base.renamed", { name }));
    } catch (e) {
      p.name = prev; // сервер не принял — возвращаем как было
      setMessage(t("base.renameFailed", { error: (e as Error).message }));
      forceRender((v) => v + 1);
    }
  };

  const addEnemy = async (email: string): Promise<string | null> => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return t("enemies.notEmail");
    if (p.enemies.some((e) => e.email.toLowerCase() === email.toLowerCase())) {
      return t("enemies.already");
    }
    // Знакомство взаимное: он появляется у нас, мы — у него. Заодно сервер
    // отдаёт его настоящее имя склада.
    let name: string | undefined;
    try {
      name = (await repo.addRival(email)) ?? undefined;
    } catch (e) {
      return t("enemies.notSaved", { error: (e as Error).message });
    }
    // В облаке склад соперника живёт на сервере; выдумывать ему карту нужно
    // только локально, где настоящих противников нет и бой идёт с ботом.
    const enemy = repo.mode === "cloud" ? blankEnemy(email, name) : makeEnemy(email, name);
    p.enemies.push(enemy);
    forceRender((v) => v + 1);
    try {
      // Адрес должен оказаться в профиле до того, как поле очистится: тогда
      // даже немедленное обновление страницы не потеряет добавленного друга.
      await repo.saveEnemies(p);
      return null;
    } catch (e) {
      p.enemies = p.enemies.filter((item) => item.id !== enemy.id);
      forceRender((v) => v + 1);
      return t("enemies.notSaved", { error: (e as Error).message });
    }
  };

  const doScout = async (enemy: Enemy, planes: number): Promise<string | null> => {
    if (scouts < planes) return t("scout.needPlanes");
    try {
      await flushPersist();
      // Карта и списание самолётов приходят одной серверной операцией:
      // запросить настоящий склад бесплатно в обход вылета нельзя.
      const base = await repo.launchScout(p, enemy.email, planes);
      const outdated = enemy.scout
        ? await repo.stalePatches(enemy.email, enemy.scout.cells).catch(() => [])
        : [];
      setScout({
        enemy,
        cells: base.cells,
        guns: base.guns,
        planes,
        gunLevel: base.gunLevel,
        stale: outdated,
      });
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
      return null;
    } catch (e) {
      return t("scout.failed", { error: (e as Error).message });
    }
  };

  const doRaid = async (enemy: Enemy, waves: WavePlan[]): Promise<string | null> => {
    const n = raidTotal(waves);
    if (drones < n) return t("raid.notEnough");
    if (payloadCost(droneCost, waves) > p.credits) return t("raid.noCredits");
    const seed = (Math.random() * 1e9) | 0;
    try {
      // Склад должен лежать на сервере до вылета: дронов снимает он сам,
      // со своей копии, и обратно присылает уже новый склад. Надбавку за
      // начинку тоже считает и списывает он.
      await flushPersist();
      const id = await repo.sendAttack(p, enemy.email, waves, seed);
      if (id) notifyBattle(id, "sent");
      // счётчик налётов поднимает сам send_attack — второй раз здесь не нужно
      setMessage(t("raid.sent", { email: enemy.email }));
      loadRaids();
      setVersion((value) => value + 1);
      forceRender((value) => value + 1);
      return null;
    } catch (error) {
      return t("raid.sendFailed", { error: (error as Error).message });
    }
  };

  /**
   * Пробный налёт на свой же склад: та же панель, но ничего не стоит и
   * никуда не пишется. Заказ кладём прямо в свою очередь — сервер о нём не
   * знает, как и о ботах с кнопки «+ налёт».
   */
  const testRaid = (waves: WavePlan[], droneLevel: number): string | null => {
    const n = raidTotal(waves);
    if (n < 1) return t("raid.empty");
    const order = makeOrder(t("raid.testTitle"), n, waves[0].pattern, waves[0].direction);
    order.waves = waves;
    // Уровень дронов задаётся явно: от него зависит и скорость роя, и радиус
    // подавления, а без него пробный налёт всегда шёл первым уровнем.
    order.droneLevel = droneLevel;
    p.incoming.push(order);
    setTestRaid(false);
    setMessage(t("raid.testQueued", { count: 1, size: n }));
    touch();
    return null;
  };

  /**
   * С чего открывать планировщик пробного налёта: рой под нынешнюю оборону,
   * столько же, сколько прислал бы настоящий соперник.
   */
  const suggestedRaid = () =>
    Math.min(
      TEST_RAID_MAX,
      raidSize(
        countKind(p.guns, "gun") +
          countKind(p.guns, "spray") / 2 +
          countKind(p.guns, "trap"),
        intact,
        raidDifficulty(),
        p.levels
      )
    );

  // ---------- ввод по карте ----------

  const cellOf = (pt: Pt) => ({ x: Math.floor(pt.x), y: Math.floor(pt.y) });

  /** «−100 кр» над клеткой: видно, за что ушли деньги, и куда вернулись. */
  const showPrice = (x: number, y: number, amount: number) => {
    priceTags.current.push({
      x,
      y,
      text: `${amount < 0 ? "−" : "+"}${fmt(Math.abs(amount))} ${t("battle.creditsSuffix")}`,
      gain: amount > 0,
      at: performance.now(),
    });
  };

  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __lobby: unknown }).__lobby = {
      player: p,
      tool,
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

    // Уголок рамки главнее всего: он маленький, специально под курсором, и
    // рядом с ним вполне может стоять пушка.
    const rect = drafting && draftRef.current ? normRect(draftRef.current) : null;
    if (rect) {
      const corner = cornerNear(rect, pt);
      if (corner >= 0) {
        dragRef.current = {
          mode: "resize",
          corner,
          startX: pt.x,
          startY: pt.y,
          origin: rect,
          moved: false,
        };
        return;
      }
    }

    // Что стоит на складе, то и берётся мышкой — в любом режиме. Иначе
    // непонятно, почему пушка тащится при одной кнопке и не тащится при другой.
    const depot = p.depots.find((q) => q.cx === c.x && q.cy === c.y);
    if (depot) {
      dragDepotRef.current = { cx: depot.cx, cy: depot.cy };
      forceRender((v) => v + 1);
      return;
    }
    const gun = p.guns.find((q) => q.cx === c.x && q.cy === c.y);
    if (gun) {
      dragGunRef.current = { cx: gun.cx, cy: gun.cy };
      forceRender((v) => v + 1);
      return;
    }

    if (tool === "drones" || tool === "scouts") {
      void buyDepotAt(c.x, c.y, tool === "scouts" ? "scout" : "basic");
      return;
    }
    if (tool === "gun" || tool === "spray" || tool === "trap") {
      gunAt(c.x, c.y, tool);
      return;
    }
    if (!drafting) return;

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
    const drag = dragRef.current;
    if (!drag || !drafting) return;
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
    // Рамку каждый кадр рисует overlay прямо из ref. React нужен только
    // ради цифр в подсказке — а они меняются, лишь когда рамка сменила
    // клетки, а не на каждый пиксель мыши.
    const r = draftRef.current;
    const key = r ? `${r.x}|${r.y}|${r.w}|${r.h}` : "";
    if (key !== draftKey.current) {
      draftKey.current = key;
      forceRender((v) => v + 1);
    }
  };

  const onUp = (pt: Pt) => {
    paintingRef.current = false;

    const fromDepot = dragDepotRef.current;
    if (fromDepot) {
      dragDepotRef.current = null;
      const c = cellOf(pt);
      if (c.x !== fromDepot.cx || c.y !== fromDepot.cy) moveDepot(fromDepot, c.x, c.y);
      forceRender((v) => v + 1);
      return;
    }
    const fromGun = dragGunRef.current;
    if (fromGun) {
      dragGunRef.current = null;
      const c = cellOf(pt);
      // Отпустил там же, откуда взял — просто передумал тащить.
      if (c.x !== fromGun.cx || c.y !== fromGun.cy) moveGun(fromGun, c.x, c.y);
      forceRender((v) => v + 1);
      return;
    }
    const drag = dragRef.current;
    if (!drag || !drafting) return;
    dragRef.current = null;

    if (drag.mode === "create" && !drag.moved) {
      // одиночный тап: достраиваем или чиним ровно одну клетку
      draftRef.current = null;
      const c = cellOf(pt);
      if (tool === "repair") repairAt(c.x, c.y);
      else if (tool === "scrap") scrapAt(c.x, c.y);
      else buildOne(c.x, c.y);
      return;
    }
    if (drag.mode !== "create" && !drag.moved) {
      commitDraft(); // клик по заготовке утверждает её
      return;
    }
    forceRender((v) => v + 1);
  };

  const onRightClick = () => {
    if (drafting && draftRef.current) {
      draftRef.current = null;
      dragRef.current = null;
      forceRender((v) => v + 1);
    }
  };

  // ---------- отрисовка поверх карты ----------

  const overlay = (ctx: CanvasRenderingContext2D, frameNow: number, view?: View) => {
    const cell = 7;
    // круги рисуем по прокачанной дальности, иначе апгрейд не виден
    drawCoverage(
      ctx,
      p.guns,
      cell,
      gunRange({ gunLevel: p.levels.guns }),
      sprayRange({ sprayLevel: p.levels.sprays }),
      trapRange({ trapLevel: p.levels.traps })
    );

    const draggedDepot = dragDepotRef.current;
    drawDepots(
      ctx,
      draggedDepot
        ? p.depots.filter((item) => item.cx !== draggedDepot.cx || item.cy !== draggedDepot.cy)
        : p.depots,
      cell
    );

    const d = draftRef.current ? normRect(draftRef.current) : null;
    if (d) {
      drawDraft(ctx, cell, d, {
        cells: p.cells,
        burntOnly: tool === "repair" || tool === "scrap" ? tool : undefined,
        scrapWhole,
        afford: draftAfford,
        connects: draftConnects,
      });
    }

    const hover = hoverRef.current;
    const hx = hover ? Math.floor(hover.x) : -1;
    const hy = hover ? Math.floor(hover.y) : -1;

    // Установки и контейнеры переставляются одинаково: тянем и роняем. Видно
    // и куда можно, и куда нельзя.
    const placing =
      tool === "gun" || tool === "spray" || tool === "trap" || dragGunRef.current;
    const stacking = tool === "drones" || tool === "scouts" || draggedDepot;
    if (placing || stacking) {
      drawFreeCells(
        ctx,
        cell,
        p.cells,
        p.guns,
        p.depots,
        placing ? "rgba(140, 215, 255, 0.16)" : "rgba(214, 168, 92, 0.18)"
      );
    }

    const dragged = dragGunRef.current ?? draggedDepot;
    if (dragged && hover) {
      const ok = dropAllowed(p.cells, p.guns, p.depots, hx, hy, dragged);
      // контейнер тащим вместе с его содержимым: видно, что именно несёшь
      if (draggedDepot) {
        const source = p.depots.find(
          (item) => item.cx === draggedDepot.cx && item.cy === draggedDepot.cy
        );
        if (source) drawDepots(ctx, [{ ...source, cx: hx, cy: hy }], cell, !ok);
      }
      drawDropTarget(ctx, cell, hx, hy, ok, dragGunRef.current ? "#8ecae6" : "#f5c56f");
    }

    // Клетка под курсором — сработает тут инструмент или нет. При раскладке
    // контейнеров не рисуем: там уже подсвечены все свободные клетки.
    if (hover && !d && onMap(hx, hy) && tool !== "drones" && tool !== "scouts") {
      const v = p.cells[idx(hx, hy)];
      let ok = false;
      if (tool === "area") ok = !isBuilding(v) && (!hasBuilding || touchesBuilding(p.cells, hx, hy));
      else if (tool === "repair") ok = v === G_BURNT;
      else if (tool === "gun" || tool === "spray" || tool === "trap")
        ok = v === G_BASE && !p.depots.some((q) => q.cx === hx && q.cy === hy);
      drawHoverCell(ctx, cell, hx, hy, ok);
    }

    priceTags.current = drawPriceTags(ctx, cell, priceTags.current, frameNow);

    // Подпись только у установок и контейнеров: землю подписывать нечем.
    if (hover && onMap(hx, hy)) {
      const gun = p.guns.find((g) => g.cx === hx && g.cy === hy);
      const depot = p.depots.find((item) => item.cx === hx && item.cy === hy);
      let label: string | null = null;
      if (gun) {
        const kind = gunKind(gun);
        label = t(kind === "spray" ? "tool.spray" : kind === "trap" ? "tool.trap" : "tool.gun");
      } else if (depot) {
        label = t(depotKind(depot) === "scout" ? "map.hover.scouts" : "map.hover.drones", {
          n: depot.n,
        });
      }
      if (label) drawHoverLabel(ctx, cell, hx, hy, label, view?.zoom ?? 1);
    }
  };


  // ---------- экраны ----------

  if (doomed) {
    return (
      <div className="mx-auto max-w-md rounded-md border border-red-900/60 bg-neutral-900/70 p-6 text-center sm:p-8">
        <h2 className="mb-2 text-2xl font-bold text-red-400">{t("doomed.title")}</h2>
        <p className="mb-6 text-sm text-neutral-400">
          {t("doomed.text")}
        </p>
        <Button
          variant="neutral"
          size="lg"
          onClick={async () => {
            try {
              playerRef.current = await repo.wipe(p);
              setMessage(t("doomed.restarted"));
              setVersion((v) => v + 1);
              forceRender((v) => v + 1);
            } catch (e) {
              setMessage(t("doomed.failed", { error: (e as Error).message }));
            }
          }}
        >
          {t("doomed.restart")}
        </Button>
      </div>
    );
  }

  const razeBase = async () => {
    setConfirmWipe(false);
    try {
      playerRef.current = await repo.wipe(p);
      setMessage(t("burnt.razed", { side: STARTER_SIDE }));
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("burnt.razeFailed", { error: (e as Error).message }));
    }
  };

  /** Начать сначала: всё с нуля, кроме имени склада и списка соперников. */
  const restartGame = async () => {
    setConfirmRestart(false);
    try {
      playerRef.current = await repo.restart(p);
      resolvedRef.current.clear();
      setReports([]);
      setMessage(t("restart.done"));
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("restart.failed", { error: (e as Error).message }));
    }
  };

  const takeLoan = async () => {
    try {
      await repo.takeLoan(p, loanAmount);
      setMessage(t("loan.taken", { amount: fmt(loanAmount), debt: fmt(loanDebt(loanAmount)) }));
      setModal(null);
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("loan.failed", { error: (e as Error).message }));
    }
  };

  const repayLoan = async () => {
    try {
      await repo.repayLoan(p);
      setMessage(t("loan.repaid"));
      setModal(null);
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("loan.failed", { error: (e as Error).message }));
    }
  };

  /** Открыть повтор из журнала: сам бой подгружаем по одной атаке. */
  const openReplay = async (row: RaidLog) => {
    try {
      const data = await repo.replayOf(row.id);
      if (!data) {
        setMessage(t("replay.gone"));
        return;
      }
      // в шапке повтора стоит тот, чей склад отбивался
      setWatching({
        id: row.id,
        name: row.side === "attack" ? row.foe : p.name,
        replay: data,
      });
    } catch (e) {
      setMessage(t("replay.failed", { error: (e as Error).message }));
    }
  };

  const hideRaid = async (id: string) => {
    setRaids((rows) => rows.filter((r) => r.id !== id));
    try {
      await repo.hideRaid(id);
    } catch {
      loadRaids();
    }
  };

  const income = shiftIncome(p);
  const pickTool = (id: ToolId) => {
    // апгрейд ничего не рисует на карте — только открывает свою модалку
    if (id === "upgrade" || id === "insurance" || id === "loan") {
      setModal(id);
      return;
    }
    setTool(id);
    toolRef.current = id;
    savePanels(panelOrder, hidden, id);
    draftRef.current = null;
    setModal(null);
  };

  const doUpgrade = async (kind: UpgradeKind) => {
    const level = p.levels[kind];
    if (level >= maxLevel(kind)) return;
    const cost = upgradeCost(level);
    if (p.credits < cost) {
      setMessage(t("upgrade.cantAfford", { cost: fmt(cost) }));
      return;
    }
    try {
      const patch = await repo.upgrade(p, kind);
      if (patch.credits !== undefined) p.credits = patch.credits;
      p.levels = patch.levels ?? { ...p.levels, [kind]: level + 1 };
      setMessage(
        t("upgrade.done", { name: t(`upgrade.${kind}` as Key), level: p.levels[kind] })
      );
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("upgrade.failed", { error: (e as Error).message }));
      // Скорее всего наши уровни разошлись с серверными — берём его версию.
      await resyncBase();
    }
  };

  // ---------- содержимое панелей ----------
  // Одни и те же куски разметки идут и в боковую колонку (десктоп),
  // и в шторки (телефон), поэтому собраны здесь один раз.

  const foundBody = (
    <>
      <p className="mb-3 text-neutral-300">
        {t("base.starter", { side: STARTER_SIDE, cost: CELL_COST })}
      </p>
      <p className="mb-3 text-neutral-300">
        {t("base.drawHint")}
      </p>
      <div className="mb-3 flex items-center justify-between font-mono">
        <span className="text-neutral-400">{t("base.area")}</span>
        <span className={intact >= MIN_BASE_CELLS ? "text-emerald-300" : "text-neutral-100"}>
          {intact}/{MIN_BASE_CELLS}
        </span>
      </div>
      <Button
        variant="build"
        block
        onClick={() => setNaming("found")}
        disabled={intact < MIN_BASE_CELLS}
      >
        {t("base.found")}
      </Button>
    </>
  );

  const upgradeBody = (
    <>
      <div className="space-y-2">
        {UPGRADE_KINDS.map((kind) => {
          const level = p.levels[kind];
          const maxed = level >= maxLevel(kind);
          const cost = upgradeCost(level);
          return (
            <div key={kind} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-neutral-200">
                {t(`upgrade.${kind}` as Key)}
                <span className="ml-2 font-mono text-xs text-amber-300">
                  {t("upgrade.level", { level })}
                </span>
              </span>
              <Button
                variant="build"
                size="sm"
                disabled={maxed || p.credits < cost}
                onClick={() => doUpgrade(kind)}
              >
                {maxed ? t("upgrade.max") : t("upgrade.buy", { cost: fmt(cost) })}
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );

  const insuranceFooter = (
    <div className="flex gap-2">
      {p.levels.insurance < MAX_INSURANCE_LEVEL && (
        <Button
          variant="build"
          className="flex-1"
          disabled={p.credits < upgradeCost(p.levels.insurance)}
          onClick={() => doUpgrade("insurance")}
        >
          {t("upgrade.buy", { cost: fmt(upgradeCost(p.levels.insurance)) })}
        </Button>
      )}
      <Button
        className={p.levels.insurance < MAX_INSURANCE_LEVEL ? "" : "flex-1"}
        onClick={() => setModal(null)}
      >
        {t("common.ok")}
      </Button>
    </div>
  );

  const insuranceBody = (
    <>
      <div className="space-y-2 text-sm text-neutral-300">
        <p>{t("insurance.cells", { cost: INSURANCE_CELL })}</p>
        <p>
          {p.levels.insurance > 1
            ? t("insurance.covers", {
                share: Math.round(insuranceShare(p.levels.insurance) * 100),
              })
            : t("insurance.basic")}
        </p>
        <p className="text-neutral-500">
          {p.levels.insurance >= MAX_INSURANCE_LEVEL
            ? t("insurance.full")
            : t("insurance.next", {
                share: Math.round(insuranceShare(p.levels.insurance + 1) * 100),
                cost: fmt(upgradeCost(p.levels.insurance)),
              })}
        </p>
      </div>
    </>
  );

  const activeTool = TOOLS.find((item) => item.id === tool) ?? TOOLS[0];

  /** Сколько осталось до возврата — часами и минутами. */
  const loanLeft = p.loanDue ? p.loanDue - now : 0;
  const hoursLeft = () => {
    const total = Math.max(0, Math.ceil(loanLeft / 60000));
    return t("loan.left", {
      h: Math.floor(total / 60),
      m: String(total % 60).padStart(2, "0"),
    });
  };

  const loanFooter = p.loan > 0 ? (
    <div className="flex gap-2">
      <Button
        variant="build"
        className="flex-1"
        disabled={p.credits < p.loan}
        onClick={repayLoan}
      >
        {t("loan.repay", { debt: fmt(p.loan) })}
      </Button>
      <Button onClick={() => setModal(null)}>{t("common.ok")}</Button>
    </div>
  ) : (
    <div className="flex gap-2">
      <Button variant="build" className="flex-1" onClick={takeLoan}>
        {t("loan.take", { amount: fmt(loanAmount) })}
      </Button>
      <Button onClick={() => setModal(null)}>{t("common.cancel")}</Button>
    </div>
  );

  const loanBody =
    p.loan > 0 ? (
      <div className="space-y-2 text-sm text-neutral-300">
        <p>{t("loan.owed", { debt: fmt(p.loan) })}</p>
        <p className="font-mono text-neutral-400">{hoursLeft()}</p>
        <p className="text-neutral-500">{t("loan.overdue", { rate: LOAN_RATE })}</p>
      </div>
    ) : (
      <div className="space-y-3 text-sm text-neutral-300">
        <p className="text-neutral-400">
          {t("loan.explain", { hours: LOAN_HOURS, rate: LOAN_RATE })}
        </p>
        <input
          type="range"
          min={LOAN_MIN}
          max={LOAN_MAX}
          step={LOAN_STEP}
          value={loanAmount}
          onChange={(e) => setLoanAmount(Number(e.target.value))}
          className="h-8 w-full cursor-pointer accent-emerald-500"
          aria-label={t("loan.amount")}
        />
        <dl className="space-y-1 font-mono">
          <Row label={t("loan.amount")} value={fmt(loanAmount)} />
          <Row label={t("loan.debt")} value={fmt(loanDebt(loanAmount))} />
        </dl>
      </div>
    );

  const head = p.incoming[0] ?? null;
  const headLeft = head?.activatedAt ? head.activatedAt + RAID.ttlMs - now : null;
  const countdown = (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  const incomingRows = (
    <>
      {p.incoming.map((a, i) => {
        const first = i === 0;
        const edge = a.pattern === "lines" ? ` ${t(`edge.${a.direction}` as Key)}` : "";
        return (
          <li
            key={a.id}
            className={`flex items-center justify-between gap-2 ${first ? "" : "opacity-60"}`}
          >
            <div className="min-w-0">
              <div className="truncate text-neutral-200">
                <span className="text-red-300">{t("replays.incoming")}</span> {a.from}
              </div>
              <div className="font-mono text-[11px] text-neutral-500">
                {t("attacks.dronesPattern", {
                  drones: a.drones,
                  pattern: t(`pattern.${a.pattern}` as Key).toLowerCase(),
                })}
                {edge}
                {" · "}
                {first
                  ? headLeft !== null
                    ? t("attacks.timeLeft", { time: countdown(headLeft) })
                    : t("attacks.starting")
                  : t("attacks.queued", { position: i + 1 })}
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              className="shrink-0"
              disabled={!first || intact === 0}
              title={first ? undefined : t("attacks.defendFirst")}
              onClick={() => void defend(a)}
            >
              {t("attacks.defend")}
            </Button>
          </li>
        );
      })}
    </>
  );

  /**
   * Пойти отбиваться. Сперва досохраняем склад: итог настоящего боя считает
   * сервер по своей копии, и если она отстала от нашей, он посчитает не тот
   * бой, который увидит игрок, — а верным окажется его счёт, не наш.
   */
  const defend = async (order: AttackOrder) => {
    setSheet(null);
    await flushPersist();
    setBattle(order);
  };

  const summonButton = (
    <Button size="sm" onClick={() => setTestRaid(true)}>
      {t("attacks.summon")}
    </Button>
  );

  const enemiesBody = (
    <Enemies
      enemies={p.enemies}
      drones={drones}
      scouts={scouts}
      credits={p.credits}
      droneCost={droneCost}
      onAdd={addEnemy}
      onRaid={doRaid}
      onScout={doScout}
      onShowMap={(enemy) => {
        setSheet(null);
        setStale([]);
        setMapOf(enemy);
        // сверяем снимок с тем, что у врага сейчас: изменённое затянет туманом
        if (enemy.scout) {
          void repo
            .stalePatches(enemy.email, enemy.scout.cells)
            .then(setStale)
            .catch(() => setStale([]));
        }
      }}
      onChanged={() => forceRender((v) => v + 1)}
    />
  );

  const raidsBody =
    raids.length === 0 && p.incoming.length === 0 ? (
      <p className="text-neutral-500">{t("replays.empty")}</p>
    ) : (
      // Показываем три боя, остальное — прокруткой: журнал не должен
      // выдавливать список врагов за край экрана.
      <ul className="max-h-[10.5rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
        {incomingRows}
        {raids.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className={`truncate ${r.pending ? "text-neutral-400" : "text-neutral-200"}`}>
                <span className={r.side === "attack" ? "text-red-300" : "text-sky-300"}>
                  {t(r.side === "attack" ? "replays.attack" : "replays.defence")}
                </span>{" "}
                {r.foe}
              </div>
              <div className="font-mono text-[11px] text-neutral-500">
                {r.pending
                  ? t("replays.pending", { drones: r.drones })
                  : t("replays.line", { drones: r.drones, burned: fmt(r.burned) })}
                {!r.pending && r.side === "attack" && r.loot > 0
                  ? ` · +${fmt(r.loot)} ${t("battle.creditsSuffix")}`
                  : ""}
              </div>
            </div>
            {/* пока налёт в пути, смотреть и убирать нечего */}
            {!r.pending && (
              <div className="flex shrink-0 gap-1">
                {r.hasReplay && (
                  <IconButton
                    label={t("replay.watch")}
                    title={t("replay.watch")}
                    className="h-8 w-8"
                    onClick={() => void openReplay(r)}
                  >
                    <Play className="h-4 w-4" />
                  </IconButton>
                )}
                <IconButton
                  label={t("replays.hide")}
                  title={t("replays.hide")}
                  className="h-8 w-8"
                  onClick={() => void hideRaid(r.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    );

  const statsBody = (
    <div className="space-y-1 font-mono text-xs text-neutral-400">
      <StatRow label={t("stats.battles")} value={p.stats.battles} />
      <StatRow label={t("stats.dronesKilled")} value={p.stats.dronesKilled} />
      <StatRow label={t("stats.cellsBurned")} value={p.stats.cellsBurned} />
      <StatRow label={t("stats.cellsRepaired")} value={p.stats.cellsRepaired} />
      <StatRow label={t("stats.wipes")} value={p.stats.wipes} />
      <StatRow label={t("stats.raids")} value={p.stats.raids} />
      <StatRow label={t("stats.looted")} value={p.stats.looted} />
    </div>
  );

  const SIDE_PANELS: Record<
    string,
    { title: Key; action?: ReactNode; body: ReactNode }
  > = {
    enemies: { title: "panel.enemies", body: enemiesBody },
    replays: { title: "panel.replays", action: summonButton, body: raidsBody },
    stats: { title: "panel.stats", body: statsBody },
  };

  const baseNameBody = (
    <BaseName
      value={p.name}
      placeholder={t("base.unnamed")}
      title={t("base.rename")}
      className="w-full font-semibold"
      onCommit={rename}
    />
  );

  // ---------- полоса сообщений ----------
  // Всё, что игра говорит игроку, идёт одной строкой под кнопками: и рамка
  // с подтверждением, и тревога, и обычные сообщения. Порядок — по тому,
  // что сейчас важнее для рук.
  const draftOpen = drafting && draftRect && draftRect.w > 0 && draftRect.h > 0;
  let barTone = "border-neutral-800 bg-neutral-900/40 text-neutral-500";
  let barBody: ReactNode = (
    <span className="min-w-0 truncate">{t(activeTool.hint, activeTool.vars)}</span>
  );

  if (draftOpen && draftRect) {
    barTone = "border-amber-700/60 bg-amber-950/30 text-amber-100";
    barBody = (
      <>
        <span className="font-mono">
          {t(
            tool === "scrap"
              ? "scrap.summary"
              : tool === "repair"
              ? "repair.summary"
              : "draft.summary",
            {
              w: draftRect.w,
              h: draftRect.h,
              cells: draftCells,
              cost: fmt(Math.abs(draftCost)),
            }
          )}
        </span>
        {!draftConnects && (
          <span className="text-red-400">
            {t(tool === "scrap" ? "scrap.splits" : "draft.gap")}
          </span>
        )}
        {draftConnects && !draftAfford && (
          <span className="text-red-400">{t("draft.tooExpensive")}</span>
        )}
        {(tool === "repair" || tool === "scrap") && draftCells === 0 && (
          <span className="text-neutral-400">{t("repair.nothing")}</span>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="build"
            size="sm"
            onClick={commitDraft}
            disabled={!draftConnects || !draftAfford || draftCells === 0}
          >
            {t("draft.confirm")}
          </Button>
          <Button size="sm" onClick={onRightClick}>
            {t("draft.remove")}
          </Button>
        </div>
      </>
    );
  } else if (message) {
    barTone = "border-neutral-700 bg-neutral-900 text-neutral-200";
    barBody = <span className="min-w-0">{message}</span>;
  } else if (p.founded && intact === 0) {
    barTone = "border-red-900/70 bg-red-950/30 text-red-100";
    barBody = (
      <>
        <span className="min-w-0">{t("burnt.notice", { cost: REPAIR_COST, side: STARTER_SIDE })}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" active={tool === "repair"} onClick={() => pickTool("repair")}>
            {t("tool.repair")}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmWipe(true)}>
            {t("burnt.raze")}
          </Button>
        </div>
      </>
    );
  } else if (!p.founded) {
    barTone = "border-neutral-700 bg-neutral-900 text-neutral-200";
    barBody = (
      <>
        <span className="font-mono">
          <span className="text-neutral-400">{t("base.areaShort")} </span>
          <span className={intact >= MIN_BASE_CELLS ? "text-emerald-300" : "text-neutral-100"}>
            {intact}/{MIN_BASE_CELLS}
          </span>
        </span>
        <span className="min-w-0 truncate text-neutral-400">{t("base.drawHint")}</span>
        <Button
          variant="build"
          size="sm"
          className="ml-auto"
          onClick={() => setNaming("found")}
          disabled={intact < MIN_BASE_CELLS}
        >
          {t("base.foundShort")}
        </Button>
      </>
    );
  } else if (p.incoming.length > 0) {
    barTone = "border-red-900/70 bg-red-950/30 text-red-100";
    barBody = (
      <>
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
        <span className="min-w-0 truncate">
          {t("attacks.incoming", { from: p.incoming[0].from, drones: p.incoming[0].drones })}
          {headLeft !== null ? ` · ${countdown(headLeft)}` : ""}
        </span>
        <Button
          variant="danger"
          size="sm"
          className="ml-auto"
          onClick={() =>
            window.innerWidth < 1024 ? setSheet("attacks") : void defend(p.incoming[0])
          }
          disabled={intact === 0}
        >
          {p.incoming.length > 1
            ? t("attacks.defendCount", { count: p.incoming.length })
            : t("attacks.defend")}
        </Button>
      </>
    );
  }

  const accountLine = (
    <AccountMenu
      name={account?.name ?? null}
      email={account?.email ?? null}
      onTelegram={() => {
        setModal("telegram");
        void repo.telegram().then(setTelegram).catch(() => setTelegram(null));
      }}
      onRules={() => setShowRules(true)}
      onRestart={() => setConfirmRestart(true)}
      onSignOut={account ? onSignOut : undefined}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:gap-3">
      {/* шапка телефона: счётчики одной строкой плюс кнопки панелей */}
      <div className="order-1 flex shrink-0 items-center gap-2 lg:hidden">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-emerald-300">
          {t("stat.creditsLine", { credits: fmt(p.credits), income: fmt(income) })}
        </span>
        <IconButton label={t("panel.replays")} badge={p.incoming.length} onClick={() => toggleSheet("attacks")}>
          <IconTarget />
        </IconButton>
        <IconButton label={t("panel.enemies")} onClick={() => toggleSheet("enemies")}>
          <IconUsers />
        </IconButton>
        <IconButton label={t("panel.base")} onClick={() => toggleSheet("menu")}>
          <IconMenu />
        </IconButton>
      </div>

      {/* шапка десктопа: логотип, счётчики и аккаунт одной строкой */}
      <div className="order-1 hidden items-center gap-3 lg:flex">
        <BaseName
          value={p.name}
          placeholder={t("base.unnamed")}
          title={t("base.rename")}
          className="max-w-[14rem] shrink-0 text-xl font-black uppercase leading-none tracking-tight"
          onCommit={rename}
        />
        <span className="shrink-0 font-mono text-sm text-emerald-300">
          {t("stat.creditsLine", { credits: fmt(p.credits), income: fmt(income) })}
        </span>
        {/* остальная строка — поле для всего, что игра говорит игроку */}
        <div
          className={`flex min-h-[2.25rem] min-w-0 flex-1 items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1 text-sm ${barTone}`}
        >
          {barBody}
        </div>
        {accountLine}
      </div>

      {/*
        Инструменты — отдельная строка во всю ширину, кнопки прижаты влево.
        На телефоне она уезжает под карту, под большой палец, и складывается
        в два ряда по пять.
      */}
      <div className="order-3 grid shrink-0 grid-cols-5 gap-1.5 lg:order-2 lg:grid-cols-[repeat(auto-fill,5rem)] lg:gap-2">
        {TOOLS.map((item) => (
          <ToolButton
            key={item.id}
            icon={item.icon}
            label={t(item.label)}
            price={t(item.priceKey ?? "tool.price", {
              ...item.vars,
              cost: toolPrice(item),
            })}
            hint={t(item.hint, toolVars(item))}
            level={item.levelKind ? p.levels[item.levelKind] : undefined}
            count={item.countKind ? counters[item.countKind] : undefined}
            active={tool === item.id}
            disabled={!p.founded && item.id !== "area"}
            onClick={() => pickTool(item.id)}
          />
        ))}
      </div>

      <div className="order-2 flex min-h-0 flex-1 flex-col gap-2 lg:order-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4">
        {/* Левая колонка: карта забирает всю свободную высоту. */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:min-h-0 lg:gap-3">

          {/*
            Одна полоса на все разговоры игры: и подтверждение рамки, и
            тревога о налёте, и обычные сообщения. Высота у неё есть всегда,
            даже пустой, — иначе карта дёргалась бы на каждое слово.
          */}
          <div
            className={`order-2 flex min-h-[2.75rem] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 text-sm lg:hidden ${barTone}`}
          >
            {barBody}
          </div>

          <MapCanvas
            idle
            className="order-1 min-h-0 flex-1 lg:order-3"
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
            cursor={dragDepotRef.current || dragGunRef.current ? "grabbing" : "crosshair"}
          />

        </div>

        {/* боковая колонка десктопа */}
        <aside className="hidden min-h-0 space-y-4 overflow-y-auto text-sm lg:block [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!p.founded ? (
            <Panel title={t("panel.layout")}>{foundBody}</Panel>
          ) : (
            <>
              {panelOrder.map((id) => {
                const panel = SIDE_PANELS[id];
                if (!panel) return null;
                return (
                  <Panel
                    key={id}
                    title={t(panel.title)}
                    action={panel.action}
                    collapsed={hidden[id]}
                    dragging={dragPanel === id}
                    onToggle={() => togglePanel(id)}
                    onGrab={() => setDragPanel(id)}
                    onDrop={() => setDragPanel(null)}
                    onOver={() => movePanel(id)}
                  >
                    {panel.body}
                  </Panel>
                );
              })}
            </>
          )}
        </aside>
      </div>

      {/* мобильные шторки */}
      {autoReport && (
        <Modal
          title={
            autoReport.outcome.won
              ? t("auto.wonTitle", { from: autoReport.from })
              : t("auto.lostTitle", { from: autoReport.from })
          }
          subtitle={t("auto.subtitle")}
          onClose={() => setAutoReport(null)}
          footer={
            <Button variant="neutral" block onClick={() => setAutoReport(null)}>
              {t("common.ok")}
            </Button>
          }
        >
          <dl className="mb-4 space-y-1 font-mono text-sm">
            <Row
              label={t("battle.killedByGuns")}
              value={String(autoReport.outcome.result.killedByGuns)}
            />
            <Row label={t("battle.leaked")} value={String(autoReport.outcome.result.leaked)} />
            <Row label={t("battle.burned")} value={String(autoReport.outcome.result.burned)} />
            <Row label={t("battle.dronesLost")} value={String(autoReport.outcome.result.dronesLost)} />
            <Row label={t("battle.gunsLost")} value={String(autoReport.outcome.result.gunsLost)} />
          </dl>
        </Modal>
      )}

      {showRules && <Rules onClose={() => setShowRules(false)} />}

      {confirmRestart && (
        <ConfirmDialog
          title={t("restart.title")}
          subtitle={t("restart.hint")}
          confirm={t("restart.confirm")}
          onCancel={() => setConfirmRestart(false)}
          onConfirm={restartGame}
        />
      )}

      {confirmWipe && (
        <ConfirmDialog
          title={t("burnt.razeTitle")}
          subtitle={t("burnt.razeHint", { side: STARTER_SIDE })}
          confirm={t("burnt.raze")}
          onCancel={() => setConfirmWipe(false)}
          onConfirm={razeBase}
        />
      )}

      {testRaidOpen && (
        <TestRaidDialog
          initial={suggestedRaid()}
          level={p.levels.drones}
          onCancel={() => setTestRaid(false)}
          onSend={testRaid}
        />
      )}

      {watching && (
        // Повтор — почти во весь экран: смотреть бой в полоске внизу нечего.
        <div
          className="fixed inset-0 z-40 flex bg-black/80 p-2 sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setWatching(null);
          }}
        >
          <div className="m-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 p-3 shadow-2xl">
            <Replay
              name={watching.name}
              replay={watching.replay}
              shareId={watching.id}
              onClose={() => setWatching(null)}
            />
          </div>
        </div>
      )}

      {reports[0] && !watching && (
        <AttackReportDialog
          report={reports[0]}
          onWatch={
            reports[0].replay
              ? () =>
                  setWatching({
                    id: reports[0].id,
                    name: reports[0].target,
                    replay: reports[0].replay!,
                  })
              : undefined
          }
          onClose={async () => {
            const report = reports[0];
            try {
              await repo.acknowledgeReport(report.id);
              setReports((current) => current.filter((item) => item.id !== report.id));
              loadRaids();
            } catch (error) {
              setMessage(t("report.closeFailed", { error: (error as Error).message }));
            }
          }}
        />
      )}

      {naming && (
        <NameDialog
          title={t("base.namePrompt")}
          subtitle={t("base.namePromptHint")}
          confirm={t("base.foundShort")}
          initial={p.name}
          maxLength={MAX_BASE_NAME}
          onCancel={() => setNaming(null)}
          onSubmit={found}
        />
      )}

      {modal === "telegram" && (
        <Modal
          title={t("tg.title")}
          onClose={() => setModal(null)}
          footer={
            <div className="flex gap-2">
              {telegram?.linked ? (
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    void repo.telegramUnlink().then(() => setTelegram({ code: telegram.code, linked: false }));
                  }}
                >
                  {t("tg.unlink")}
                </Button>
              ) : (
                telegram &&
                TG_BOT && (
                  <a
                    className="flex-1"
                    href={`https://t.me/${TG_BOT}?start=${encodeURIComponent(telegram.code)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="build" block>
                      {t("tg.link")}
                    </Button>
                  </a>
                )
              )}
              <Button onClick={() => setModal(null)}>{t("common.ok")}</Button>
            </div>
          }
        >
          <p className="text-sm text-neutral-300">
            {telegram?.linked ? t("tg.linked") : t("tg.explain")}
          </p>
          {!TG_BOT && <p className="mt-2 text-xs text-neutral-500">{t("tg.noBot")}</p>}
        </Modal>
      )}
      {modal === "loan" && (
        <Modal
          title={t("loan.title")}
          footer={loanFooter}
          onClose={() => setModal(null)}
        >
          {loanBody}
        </Modal>
      )}
      {modal === "insurance" && (
        <Modal
          title={`${t("tool.insurance")} · ${t("upgrade.level", { level: p.levels.insurance })}`}
          footer={insuranceFooter}
          onClose={() => setModal(null)}
        >
          {insuranceBody}
        </Modal>
      )}
      {modal === "upgrade" && (
        <Modal
          title={t("tool.upgrade")}
          onClose={() => setModal(null)}
          footer={
            <Button variant="neutral" block onClick={() => setModal(null)}>
              {t("common.ok")}
            </Button>
          }
        >
          {p.founded ? upgradeBody : <p className="text-neutral-500">{t("base.foundFirst")}</p>}
        </Modal>
      )}

      <Sheet open={sheet === "attacks"} title={t("panel.replays")} onClose={() => setSheet(null)}>
        <div className="mb-3 flex justify-end">{summonButton}</div>
        {raidsBody}
      </Sheet>
      <Sheet open={sheet === "enemies"} title={t("panel.enemies")} onClose={() => setSheet(null)}>
        {enemiesBody}
      </Sheet>
      <Sheet open={sheet === "menu"} title={t("panel.base")} onClose={() => setSheet(null)}>
        <div className="space-y-5">
          {p.founded && (
            <div>
              <div className="mb-2">
                <SectionTitle>{t("panel.base")}</SectionTitle>
              </div>
              {baseNameBody}
            </div>
          )}
          <div>
            <div className="mb-2">
              <SectionTitle>{t("panel.stats")}</SectionTitle>
            </div>
            {statsBody}
          </div>
          <div>
            <div className="mb-2">
              <SectionTitle>{t("panel.controls")}</SectionTitle>
            </div>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-neutral-400">
              <li>{t("controls.tapCell")}</li>
              <li>{t("controls.dragDraft")}</li>
              <li>{t("gun.dragTip")}</li>
              <li>{t("controls.zoomTouch")}</li>
            </ul>
          </div>
          <div>
            <div className="mb-2">
              <SectionTitle>{t("panel.account")}</SectionTitle>
            </div>
            <div className="truncate px-2 text-sm font-semibold text-neutral-100">
              {account?.name ?? account?.email ?? t("app.localMode")}
            </div>
            <SettingsList
              onRules={() => {
                setSheet(null);
                setShowRules(true);
              }}
              onRestart={() => {
                setSheet(null);
                setConfirmRestart(true);
              }}
              onSignOut={account ? onSignOut : undefined}
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * Пробный налёт на свой склад. Панель та же, что и у настоящего налёта, но
 * складом и кошельком он не ограничен: это песочница, чтобы посмотреть, как
 * выглядит волна на своей карте.
 */
