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
  droneCount,
  countFreeCells,
  isWhole,
  scrapRect,
  freeCells,
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
  SCRAP_REWARD,
  loanDebt,
  goodsValue,
  insurance,
  insuranceShare,
  GUN_COST,
  MIN_BASE_CELLS,
  REPAIR_COST,
  SCOUT_UNIT_COST,
  maxLevel,
  UPGRADE_KINDS,
  UPGRADE_STEP,
  upgradeCost,
  type UpgradeKind,
  fmt,
} from "@/lib/economy";
import {
  PATTERNS,
  RAID_TTL_MS,
  raidDifficulty,
  raidSize,
  type AttackOrder,
  type AttackReport,
  type Pattern,
  type RaidLog,
  makeOrder,
} from "@/lib/attack";
import {
  MAX_BASE_NAME,
  burntCells,
  dailyIncome,
  intactCells,
  isDoomed,
  normName,
  type Player,
} from "@/lib/player";
import { getRepo } from "@/lib/repo";
import {
  type Enemy,
  makeEnemy,
} from "@/lib/enemy";
import type { Account } from "./AuthGate";
import Enemies from "./Enemies";
import { drawCoverage, drawDepots } from "@/lib/render";
import { gunRange } from "@/lib/engine";
import Battle, { type BattleOutcome } from "./Battle";
import Scout, { type ScoutOutcome } from "./Scout";
import ScoutMap from "./ScoutMap";
import Replay, { type ReplayData } from "./Replay";
import Rules from "./Rules";
import MapCanvas, { type Pt } from "./MapCanvas";
import AccountMenu, { SettingsList } from "./AccountMenu";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";
import {
  Banknote,
  Play,
  Trash2,
  ChevronsUp,
  LayoutGrid,
  Plane,
  Hammer,
  Rocket,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { autoDefend, type UnattendedOutcome } from "@/lib/unattended";
import { decodeCells, decodeRle, encodeRle, type DroneKind, type Gun } from "@/lib/base";
import {
  Button,
  Card,
  Chip,
  ChipBar,
  IconButton,
  IconMenu,
  IconTarget,
  IconUsers,
  ConfirmDialog,
  NameDialog,
  Notice,
  Modal,
  Panel,
  Row,
  SectionTitle,
  TOAST_MS,
  Sheet,
  StatRow,
  ToolButton,
  IconDrone,
} from "./ui";

type Tool = "area" | "repair" | "scrap" | "gun" | "drones" | "scouts";
/** Кнопка «Апгрейд» карты не касается: она только открывает модалку. */
type ToolId = Tool | "upgrade" | "insurance";
/** Панели, которые на телефоне открываются шторкой снизу. */
type SheetId = "found" | "attacks" | "enemies" | "menu";
/** Панели инструментов: они всплывают модалкой и вёрстку не разрывают. */
type ModalId = "upgrade" | "insurance" | "loan";

const ICON = "h-5 w-5";

/** Подпись и цена берутся из словаря, глиф — из lucide. */
const TOOLS: {
  id: ToolId;
  label: Key;
  hint: Key;
  vars: Record<string, number>;
  icon: ReactNode;
  /** Цена этого инструмента — не фиксированная, а «от». */
  priceKey?: Key;
  /** Какой класс он показывает уровнем. */
  levelKind?: UpgradeKind;
  /** Что считать в уголке кнопки: этого добра столько-то на складе. */
  countKind?: "intact" | "burnt" | "guns" | "drones" | "scouts";
}[] = [
  {
    id: "area",
    label: "tool.area",
    hint: "tool.areaHint",
    vars: { cost: CELL_COST },
    icon: <LayoutGrid className={ICON} />,
    countKind: "intact",
  },
  {
    id: "repair",
    label: "tool.repair",
    hint: "tool.repairHint",
    vars: { cost: REPAIR_COST },
    icon: <Wrench className={ICON} />,
    countKind: "burnt",
  },
  {
    id: "scrap",
    label: "tool.scrap",
    hint: "tool.scrapHint",
    vars: { cost: SCRAP_REWARD },
    priceKey: "tool.priceScrap",
    icon: <Hammer className={ICON} />,
    countKind: "burnt",
  },
  {
    id: "gun",
    label: "tool.gun",
    hint: "tool.gunHint",
    vars: { cost: GUN_COST },
    icon: <Rocket className={ICON} />,
    levelKind: "guns",
    countKind: "guns",
  },
  {
    id: "drones",
    label: "tool.drones",
    hint: "tool.dronesHint",
    vars: { cost: DRONE_UNIT_COST * DRONES_PER_CELL, perCell: DRONES_PER_CELL },
    icon: <IconDrone />,
    levelKind: "drones",
    countKind: "drones",
  },
  {
    id: "scouts",
    label: "tool.scouts",
    hint: "tool.scoutsHint",
    vars: { cost: SCOUT_UNIT_COST * DRONES_PER_CELL, perCell: DRONES_PER_CELL },
    icon: <Plane className={ICON} />,
    levelKind: "scouts",
    countKind: "scouts",
  },
  {
    id: "insurance",
    label: "tool.insurance",
    hint: "tool.insuranceHint",
    vars: { cost: INSURANCE_CELL },
    priceKey: "tool.priceCell",
    icon: <ShieldCheck className={ICON} />,
    levelKind: "insurance",
  },
  {
    id: "upgrade",
    label: "tool.upgrade",
    hint: "tool.upgradeHint",
    vars: { cost: UPGRADE_STEP },
    priceKey: "tool.priceFrom",
    icon: <ChevronsUp className={ICON} />,
  },
];

/** Имена ботов для отладочной кнопки «+ налёт»: настоящие атаки приходят с именем склада. */
const BOT_COUNT = 4;

export default function Lobby({
  account,
  onSignOut,
}: {
  account: Account | null;
  onSignOut: () => void;
}) {
  const t = useT();
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
  const [modal, setModal] = useState<ModalId | null>(null);
  const [naming, setNaming] = useState<"found" | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [loanAmount, setLoanAmount] = useState(LOAN_MIN);
  /** Чью снятую карту сейчас смотрим. */
  const [mapOf, setMapOf] = useState<Enemy | null>(null);
  /** Что сейчас крутим: чей бой и сама запись. */
  const [watching, setWatching] = useState<
    { id: string; name: string; replay: ReplayData } | null
  >(null);
  const [showRules, setShowRules] = useState(false);
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
            t("income.collected", { days: income.days, credits: fmt(income.credits) }) +
              (sold && (sold.drones || sold.scouts)
                ? t("income.sold", {
                    drones: sold.drones,
                    dronesValue: fmt(sold.drones * DRONE_UNIT_COST * SALE_MULTIPLIER),
                    scouts: sold.scouts,
                    scoutsValue: fmt(sold.scouts * SCOUT_UNIT_COST * SALE_MULTIPLIER),
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
          cur.enemies.push(makeEnemy(mail, a.from));
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
   * за RAID_TTL_MS — налёт проходит сам, без брандспойта и пулемёта, и очередь
   * двигается дальше. Тикаем раз в секунду, но только когда есть что считать.
   */
  useEffect(() => {
    const tick = async () => {
      const cur = playerRef.current;
      const head = cur?.incoming[0];
      if (!cur || !head) return;
      if (!head.activatedAt) {
        // сервер отметит своим временем при ближайшем опросе, а бот-атаки
        // живут только на клиенте — часы им заводим здесь
        head.activatedAt = Date.now();
        forceRender((v) => v + 1);
        return;
      }
      setNow(Date.now());
      if (Date.now() < head.activatedAt + RAID_TTL_MS) return;
      if (autoBusyRef.current) return;

      autoBusyRef.current = true;
      try {
        const o = autoDefend(cur.cells, cur.guns, cur.depots, head, cur.levels.guns);
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
          cur.levels.insurance
        );
        const foe = cur.enemies.find((e) => e.name === head.from);
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
          if (patch.credits !== undefined) cur.credits = patch.credits;
          forceRender((v) => v + 1);
        } catch (e) {
          setMessage(t("auto.notSaved", { error: (e as Error).message }));
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
  }, [repo]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), TOAST_MS);
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

  const { intact, burnt, free, drones, scouts } = counts;
  // то же самое, но под ключи кнопок: у каждой в углу своё число
  const counters = { intact, burnt, guns: p.guns.length, drones, scouts };
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
        levels={{ guns: p.levels.guns, mg: p.levels.mg, water: p.levels.water }}
        insuranceLevel={p.levels.insurance}
        onFinish={async (o: BattleOutcome) => {
          const goodsBefore = goodsValue(p.depots);
          p.cells = o.cells;
          p.guns = o.guns;
          p.depots = o.depots;
          p.incoming = p.incoming.filter((a) => a.id !== battle.id);
          p.stats.battles++;
          const killed = o.result.killedByGuns + o.result.killedByMg;
          p.stats.dronesKilled += killed;
          p.stats.cellsBurned += o.result.burned;
          p.credits += insurance(
            o.result.burned,
            goodsBefore - goodsValue(o.depots),
            o.result.gunsLost,
            p.levels.insurance
          );
          // счёт вражды: записываем, сколько он у нас сжёг
          const foe = p.enemies.find((e) => e.name === battle.from);
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
            if (patch.credits !== undefined) p.credits = patch.credits;
            forceRender((v) => v + 1);
          } catch (e) {
            setMessage(t("battle.notSaved", { error: (e as Error).message }));
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
      <ScoutMap name={mapOf.name} snapshot={mapOf.scout} onClose={() => setMapOf(null)} />
    );
  }

  if (scout) {
    const known = scout.enemy.scout ? decodeRle(scout.enemy.scout.seen) : null;
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

  const gunAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    if (p.cells[idx(x, y)] !== G_BASE) {
      setMessage(t("gun.onlyIntact"));
      return;
    }
    if (p.depots.some((d) => d.cx === x && d.cy === y)) {
      setMessage(t("gun.cellBusy"));
      return;
    }
    if (p.credits < GUN_COST) {
      setMessage(t("gun.noCredits"));
      return;
    }
    p.guns.push({ cx: x, cy: y });
    p.credits -= GUN_COST;
    showPrice(x, y, -GUN_COST);
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
    const cost = (kind === "scout" ? SCOUT_UNIT_COST : DRONE_UNIT_COST) * DRONES_PER_CELL;
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
    p.guns = p.guns.map((g, i) => (i === at ? { cx: x, cy: y } : g));
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
    const enemy = makeEnemy(email, name);
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
      const base =
        repo.mode === "cloud"
          ? await repo.enemyBase(enemy.email)
          : { cells: decodeCells(enemy.cells), guns: enemy.guns, gunLevel: 1 };
      // разведчиков снимает со склада сервер: взлетели — значит потрачены
      await repo.spendScouts(p, planes);
      setScout({ enemy, cells: base.cells, guns: base.guns, planes, gunLevel: base.gunLevel });
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
      return null;
    } catch (e) {
      return t("scout.failed", { error: (e as Error).message });
    }
  };

  const doRaid = async (
    enemy: Enemy,
    n: number,
    pattern: Pattern,
    direction: number
  ): Promise<string | null> => {
    if (drones < n) return t("raid.notEnough");
    const seed = (Math.random() * 1e9) | 0;
    try {
      // Склад должен лежать на сервере до вылета: дронов снимает он сам,
      // со своей копии, и обратно присылает уже новый склад.
      await flushPersist();
      await repo.sendAttack(p, enemy.email, n, pattern, direction, seed);
      // счётчик налётов поднимает сам send_attack — второй раз здесь не нужно
      setMessage(t("raid.sent", { email: enemy.email }));
      setVersion((value) => value + 1);
      forceRender((value) => value + 1);
      return null;
    } catch (error) {
      return t("raid.sendFailed", { error: (error as Error).message });
    }
  };

  const summonAttack = () => {
    const pattern = PATTERNS[(Math.random() * PATTERNS.length) | 0];
    // рой подбираем под оборону: сколько пушек и сколько склада прикрывать
    const size = raidSize(p.guns.length, intact, raidDifficulty(), p.levels);
    const order = makeOrder(
      t(`bot.${(Math.random() * BOT_COUNT) | 0}` as Key),
      size,
      pattern,
      (Math.random() * 4) | 0
    );
    p.incoming.push(order);
    touch();
  };

  // ---------- ввод по карте ----------

  const cellOf = (pt: Pt) => ({ x: Math.floor(pt.x), y: Math.floor(pt.y) });

  /** Сколько живёт всплывающая цена, мс. */
  const TAG_MS = 1000;

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
    if (tool === "gun") {
      gunAt(c.x, c.y);
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

  const overlay = (ctx: CanvasRenderingContext2D, frameNow: number) => {
    const cell = 7;
    // круг ПВО рисуем по прокачанной дальности, иначе апгрейд не виден
    drawCoverage(ctx, p.guns, cell, gunRange({ gunLevel: p.levels.guns }));
    const dragged = dragDepotRef.current;
    drawDepots(
      ctx,
      dragged
        ? p.depots.filter((item) => item.cx !== dragged.cx || item.cy !== dragged.cy)
        : p.depots,
      cell
    );

    const d = draftRef.current ? normRect(draftRef.current) : null;
    if (d && d.w > 0 && d.h > 0 && (tool === "repair" || tool === "scrap")) {
      // закрашиваем именно те клетки, за которые спишутся деньги
      ctx.fillStyle =
        tool === "scrap"
          ? scrapWhole
            ? "rgba(214, 168, 92, 0.55)"
            : "rgba(229, 56, 59, 0.55)"
          : draftAfford
          ? "rgba(140, 215, 255, 0.55)"
          : "rgba(229, 56, 59, 0.5)";
      for (let y = d.y; y < d.y + d.h; y++) {
        for (let x = d.x; x < d.x + d.w; x++) {
          if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
          if (p.cells[idx(x, y)] === G_BURNT) ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
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

    // пушки переставляются так же, как контейнеры: тянем и роняем
    if (tool === "gun" || dragGunRef.current) {
      ctx.fillStyle = "rgba(140, 215, 255, 0.16)";
      for (const i of freeCells(p.cells, p.guns, p.depots)) {
        ctx.fillRect((i % GRID) * cell, ((i / GRID) | 0) * cell, cell, cell);
      }
      const from = dragGunRef.current;
      const hg = hoverRef.current;
      if (from && hg) {
        const cx = Math.floor(hg.x);
        const cy = Math.floor(hg.y);
        const sameCell = cx === from.cx && cy === from.cy;
        const targetOk =
          sameCell ||
          (cx >= 0 &&
            cy >= 0 &&
            cx < GRID &&
            cy < GRID &&
            p.cells[idx(cx, cy)] === G_BASE &&
            !p.guns.some((g) => (g.cx !== from.cx || g.cy !== from.cy) && g.cx === cx && g.cy === cy) &&
            !p.depots.some((d) => d.cx === cx && d.cy === cy));
        ctx.strokeStyle = targetOk ? "#8ecae6" : "#ff6b6b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx * cell, cy * cell, cell, cell);
      }
    }

    // раскладка: подсвечиваем свободные клетки и тащим контейнер за курсором
    if (tool === "drones" || tool === "scouts" || dragDepotRef.current) {
      ctx.fillStyle = "rgba(214, 168, 92, 0.18)";
      for (const i of freeCells(p.cells, p.guns, p.depots)) {
        ctx.fillRect((i % GRID) * cell, ((i / GRID) | 0) * cell, cell, cell);
      }
      const from = dragDepotRef.current;
      const h2 = hoverRef.current;
      if (from && h2) {
        const cx = Math.floor(h2.x);
        const cy = Math.floor(h2.y);
        const targetOk =
          cx >= 0 &&
          cy >= 0 &&
          cx < GRID &&
          cy < GRID &&
          p.cells[idx(cx, cy)] === G_BASE &&
          !p.guns.some((g) => g.cx === cx && g.cy === cy) &&
          !p.depots.some(
            (item) =>
              (item.cx !== from.cx || item.cy !== from.cy) && item.cx === cx && item.cy === cy
          );
        const source = p.depots.find((item) => item.cx === from.cx && item.cy === from.cy);
        if (source) drawDepots(ctx, [{ ...source, cx, cy }], cell, !targetOk);
        ctx.strokeStyle = targetOk ? "#f5c56f" : "#ff6b6b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          cx * cell,
          cy * cell,
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
        if (tool !== "drones" && tool !== "scouts") {
          ctx.fillStyle = ok ? "rgba(140, 215, 255, 0.6)" : "rgba(229, 56, 59, 0.55)";
          ctx.fillRect(cx * cell, cy * cell, cell, cell);
        }
      }
    }

    // ценники: всплывают над клеткой, поднимаются и гаснут
    if (priceTags.current.length) {
      priceTags.current = priceTags.current.filter((tag) => frameNow - tag.at < TAG_MS);
      ctx.save();
      ctx.font = `600 ${cell * 1.7}px ui-monospace, SFMono-Regular, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = cell * 0.22;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
      for (const tag of priceTags.current) {
        const k = (frameNow - tag.at) / TAG_MS;
        const px = (tag.x + 0.5) * cell;
        const py = (tag.y - k * 1.6) * cell;
        ctx.globalAlpha = 1 - k * k;
        ctx.strokeText(tag.text, px, py);
        ctx.fillStyle = tag.gain ? "#7ee787" : "#ffb454";
        ctx.fillText(tag.text, px, py);
      }
      ctx.restore();
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
      setWatching({ id: row.id, name: row.foe, replay: data });
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

  const income = dailyIncome(p);
  const pickTool = (id: ToolId) => {
    // апгрейд ничего не рисует на карте — только открывает свою модалку
    if (id === "upgrade" || id === "insurance") {
      setModal(id);
      return;
    }
    setTool(id);
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
      setModal(null);
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
        <span className={intact >= MIN_BASE_CELLS ? "text-emerald-400" : "text-neutral-100"}>
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
  const headLeft = head?.activatedAt ? head.activatedAt + RAID_TTL_MS - now : null;
  const countdown = (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  const attacksBody =
    p.incoming.length === 0 ? (
      <p className="text-neutral-500">
        {t("attacks.quiet")}
      </p>
    ) : (
      <ul className="space-y-2">
        {p.incoming.map((a, i) => {
          const first = i === 0;
          const edge = a.pattern === "lines" ? ` ${t(`edge.${a.direction}` as Key)}` : "";
          return (
            <Card
              key={a.id}
              className={`flex items-center justify-between gap-2 ${first ? "" : "opacity-60"}`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-neutral-200">{a.from}</div>
                <div className="font-mono text-xs text-neutral-500">
                  {t("attacks.dronesPattern", {
                    drones: a.drones,
                    pattern: t(`pattern.${a.pattern}` as Key).toLowerCase(),
                  })}
                  {edge}
                </div>
                <div className="font-mono text-xs text-neutral-500">
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
                disabled={!first || intact === 0}
                title={first ? undefined : t("attacks.defendFirst")}
                onClick={() => {
                  setSheet(null);
                  setBattle(a);
                }}
              >
                {t("attacks.defend")}
              </Button>
            </Card>
          );
        })}
      </ul>
    );

  const summonButton = (
    <Button size="sm" onClick={summonAttack}>
      {t("attacks.summon")}
    </Button>
  );

  const enemiesBody = (
    <Enemies
      enemies={p.enemies}
      drones={drones}
      scouts={scouts}
      onAdd={addEnemy}
      onRaid={doRaid}
      onScout={doScout}
      onShowMap={(enemy) => {
        setSheet(null);
        setMapOf(enemy);
      }}
      onChanged={() => forceRender((v) => v + 1)}
    />
  );

  const raidsBody =
    raids.length === 0 ? (
      <p className="text-neutral-500">{t("replays.empty")}</p>
    ) : (
      // Показываем три боя, остальное — прокруткой: журнал не должен
      // выдавливать список врагов за край экрана.
      <ul className="max-h-[10.5rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
        {raids.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-neutral-200">
                <span className={r.side === "attack" ? "text-red-300" : "text-sky-300"}>
                  {t(r.side === "attack" ? "replays.attack" : "replays.defence")}
                </span>{" "}
                {r.foe}
              </div>
              <div className="font-mono text-[11px] text-neutral-500">
                {t("replays.line", { drones: r.drones, burned: fmt(r.burned) })}
                {r.side === "attack" && r.loot > 0
                  ? ` · +${fmt(r.loot)} ${t("battle.creditsSuffix")}`
                  : ""}
              </div>
            </div>
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
  } else if (message) {
    barTone = "border-neutral-700 bg-neutral-900 text-neutral-200";
    barBody = (
      <>
        <span className="min-w-0">{message}</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("common.close")}
          className="-mr-2 ml-auto shrink-0"
          onClick={() => setMessage(null)}
        >
          ✕
        </Button>
      </>
    );
  } else if (!p.founded) {
    barTone = "border-neutral-700 bg-neutral-900 text-neutral-200";
    barBody = (
      <>
        <span className="font-mono">
          <span className="text-neutral-400">{t("base.areaShort")} </span>
          <span className={intact >= MIN_BASE_CELLS ? "text-emerald-400" : "text-neutral-100"}>
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
          onClick={() => (window.innerWidth < 1024 ? setSheet("attacks") : setBattle(p.incoming[0]))}
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
      onRules={() => setShowRules(true)}
      onRestart={() => setConfirmRestart(true)}
      onSignOut={account ? onSignOut : undefined}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:gap-3">
      {/* шапка телефона: счётчики одной строкой плюс кнопки панелей */}
      <div className="flex shrink-0 items-center gap-2 lg:hidden">
        <ChipBar className="min-w-0 flex-1">
          <Chip label={t("stat.creditsShort")} value={fmt(p.credits)} tone="text-emerald-300" />
          <Chip label={t("stat.incomeShort")} value={`+${fmt(income)}`} tone="text-emerald-300" />
        </ChipBar>
        <IconButton label={t("loan.title")} onClick={() => setModal("loan")}>
          <Banknote className={ICON} />
        </IconButton>
        <IconButton label={t("panel.attacks")} badge={p.incoming.length} onClick={() => toggleSheet("attacks")}>
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
      <div className="hidden items-center gap-3 lg:flex">
        <BaseName
          value={p.name}
          placeholder={t("base.unnamed")}
          title={t("base.rename")}
          className="w-56 shrink-0 text-xl font-black uppercase leading-none tracking-tight"
          onCommit={rename}
        />
        <ChipBar bare className="min-w-0 flex-1 flex-wrap px-0 py-0 text-sm">
          <Chip label={t("stat.credits")} value={fmt(p.credits)} tone="text-emerald-300" />
          <Chip label={t("stat.income")} value={`+${fmt(income)}`} tone="text-emerald-300" />
        </ChipBar>
        <Button size="sm" tone={p.loan > 0 ? "red" : undefined} onClick={() => setModal("loan")}>
          {p.loan > 0 ? t("loan.owedShort", { debt: fmt(p.loan) }) : t("loan.title")}
        </Button>
        {accountLine}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4">
        {/*
          Левая колонка. На телефоне порядок задаём через order-*: карта наверху
          забирает всю свободную высоту, инструменты прижаты к низу под большой палец.
        */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:min-h-0 lg:gap-3">

          <div className="order-4 grid shrink-0 grid-cols-8 gap-1.5 lg:order-1 lg:w-fit lg:grid-cols-[repeat(8,5.5rem)] lg:gap-2">
            {TOOLS.map((item) => (
              <ToolButton
                key={item.id}
                icon={item.icon}
                label={t(item.label)}
                price={t(item.priceKey ?? "tool.price", { cost: item.vars.cost })}
                hint={t(item.hint, item.vars)}
                level={item.levelKind ? p.levels[item.levelKind] : undefined}
                count={item.countKind ? counters[item.countKind] : undefined}
                active={tool === item.id}
                disabled={!p.founded && item.id !== "area"}
                onClick={() => pickTool(item.id)}
              />
            ))}
          </div>

          {/*
            Одна полоса на все разговоры игры: и подтверждение рамки, и
            тревога о налёте, и обычные сообщения. Высота у неё есть всегда,
            даже пустой, — иначе карта дёргалась бы на каждое слово.
          */}
          <div
            className={`order-2 flex min-h-[2.75rem] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 text-sm ${barTone}`}
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
              <Panel title={t("panel.attacks")} action={summonButton}>
                {attacksBody}
              </Panel>
              <Panel title={t("panel.replays")}>{raidsBody}</Panel>
              <Panel title={t("panel.enemies")}>{enemiesBody}</Panel>
              <Panel title={t("panel.stats")}>{statsBody}</Panel>
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

      {watching && (
        <Replay
          name={watching.name}
          replay={watching.replay}
          shareId={watching.id}
          onClose={() => setWatching(null)}
        />
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

      <Sheet open={sheet === "found"} title={t("panel.layout")} onClose={() => setSheet(null)}>
        {foundBody}
      </Sheet>
      <Sheet open={sheet === "attacks"} title={t("panel.attacks")} onClose={() => setSheet(null)}>
        <div className="mb-3 flex justify-end">{summonButton}</div>
        {attacksBody}
        <div className="mt-5 mb-2">
          <SectionTitle>{t("panel.replays")}</SectionTitle>
        </div>
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

function AttackReportDialog({
  report,
  onWatch,
  onClose,
}: {
  report: AttackReport;
  /** Есть запись боя — можно посмотреть, как всё было. */
  onWatch?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const result = report.result;
  return (
    <Modal
      title={
        report.destroyed
          ? t("report.destroyed", { target: report.target })
          : t("report.title", { target: report.target })
      }
      subtitle={t("report.subtitle")}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {onWatch && (
            <Button variant="build" className="flex-1" onClick={onWatch}>
              {t("replay.watch")}
            </Button>
          )}
          <Button variant="neutral" className={onWatch ? "" : "flex-1"} onClick={onClose}>
            {t("common.ok")}
          </Button>
        </div>
      }
    >
      <dl className="mb-4 space-y-1 font-mono text-sm">
        <Row label={t("battle.sent")} value={String(result.dronesSent)} />
        <Row label={t("battle.killedByGuns")} value={String(result.killedByGuns)} />
        <Row label={t("battle.killedByMg")} value={String(result.killedByMg)} />
        <Row label={t("battle.leaked")} value={String(result.leaked)} />
        <Row label={t("battle.burned")} value={String(result.burned)} />
        <Row label={t("battle.dronesLost")} value={String(result.dronesLost)} />
        <Row label={t("battle.gunsLost")} value={String(result.gunsLost)} />
        <Row
          label={t("report.leakReward")}
          value={`+${fmt(report.loot)} ${t("battle.creditsSuffix")}`}
        />
      </dl>
    </Modal>
  );
}

/**
 * Имя склада прямо в шапке. Кнопки «переименовать» нет: щёлкнул по имени —
 * поле стало инпутом, Enter сохраняет, Escape отменяет.
 */
function BaseName({
  value,
  placeholder,
  title,
  className = "",
  onCommit,
}: {
  value: string;
  placeholder: string;
  title: string;
  className?: string;
  onCommit: (name: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== value) void onCommit(name);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={MAX_BASE_NAME}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        className={`min-w-0 truncate rounded border border-amber-500 bg-neutral-950 px-2 py-0.5 text-neutral-100 outline-none ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={start}
      className={`min-w-0 truncate rounded border border-transparent px-2 py-0.5 text-left transition hover:border-neutral-700 hover:bg-neutral-800/60 ${
        value ? "text-neutral-100" : "text-neutral-500"
      } ${className}`}
    >
      {value || placeholder}
    </button>
  );
}
