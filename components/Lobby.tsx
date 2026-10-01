"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  GRID,
  G_BASE,
  G_BURNT,
  balloonCount,
  depotKind,
  type DepotKind,
  type Rect,
  droneCount,
  countFreeCells,
  countKind,
  gunKind,
  type GunKind,
  idx,
  isBuilding,
  normRect,
  touchesBuilding,
} from "@/lib/base";
import {
  CELL_COST,
  STARTER_SIDE,
  DRONE_UNIT_COST,
  LOAN_MIN,
  SALE_MULTIPLIER,
  SHIFT_HOURS,
  SCRAP_REWARD,
  priceAt,
  loanDebt,
  MIN_BASE_CELLS,
  REPAIR_COST,
  maxLevel,
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
import {
  buildCompetition,
  titleCompetitions,
} from "@/lib/competition";
import { getRepo } from "@/lib/repo";
import {
  type Enemy,
  blankEnemy,
  makeEnemy,
} from "@/lib/enemy";
import type { Account } from "./AuthGate";
import Enemies, { EnemyProfile } from "./lobby/Enemies";
import {
  drawCoverage,
  drawDepots,
  drawRocket,
  drawSpray,
  drawTrap,
  drawTurret,
  type CoverageKind,
  type View,
} from "@/lib/render";
import { gunRange, rocketRange, rocketTempo, sprayRange, trapRange } from "@/lib/engine";
import { ROCKET } from "@/lib/tuning";
import {
  applyDraft,
  buildOne as buildCell,
  depotCost,
  depotSize,
  draftPlan,
  gunCost,
  moveDepot as shiftDepot,
  moveGun as shiftGun,
  placeDepot,
  placeGun,
  repairAt as repairCell,
  scrapAt as scrapCell,
  type BuildResult,
} from "@/lib/build";
import Battle from "./battle/Battle";
import { applyOutcome, type BattleOutcome } from "@/lib/outcome";
import CompetitionsPanel from "./lobby/CompetitionsPanel";
import { useJournal } from "./lobby/useJournal";
import SummonRaidDialog from "./lobby/SummonRaidDialog";
import AttackReportDialog from "./lobby/AttackReportDialog";
import MessageDialog from "./lobby/MessageDialog";
import BaseName from "./lobby/BaseName";
import { TEST_RAID_MAX } from "./lobby/limits";
import { useAttacks } from "./lobby/useAttacks";
import { InsuranceDialog, LoanDialog, UpgradeDialog } from "./lobby/MoneyDialogs";
import RaidsPanel, { StatsPanel } from "./lobby/RaidsPanel";
import AvatarPicker from "./lobby/AvatarPicker";
import {
  drawDraft,
  drawDropTarget,
  drawFreeCells,
  drawHoverCell,
  drawHoverLabel,
  drawPicked,
  drawPriceTags,
  dropAllowed,
  onMap,
} from "./lobby/overlay";
import {
  BOT_COUNT,
  DEFAULT_PANELS,
  PANELS_KEY,
  TOOLS,
  isBuildKind,
  readPanels,
  type ModalId,
  type SheetId,
  type Tool,
  type ToolId,
} from "./lobby/tools";
import Scout, { type ScoutOutcome } from "./scout/Scout";
import Replay from "./battle/Replay";
import Rules from "./Rules";
import { postRaidComment } from "@/lib/comments";
import {
  notifyBattle,
  notifyComment,
  notifyRivalAdded,
  notifyTestRaid,
} from "@/lib/notify";
import { PostRaidCommentModal, RaidOpenerModal } from "./lobby/RaidCommentModals";

/** Имя бота из настроек сборки: без него привязывать некуда. */
const TG_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT;
import MapCanvas, { type Pt } from "./MapCanvas";
import AccountMenu, { SettingsList } from "./AccountMenu";
import AvatarView from "./Avatar";
import { useT } from "@/lib/i18n";
import { explain, explainAlone } from "@/lib/errors";
import type { Key } from "@/lib/i18n/dict";
import { Trophy } from "lucide-react";
import {
  decodeRle,
  encodeRle,
  fogPatches,
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
  SectionTitle,
  MESSAGE_MS,
  Sheet,
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
  /** Налёт с запиской нападающего — сначала показываем её, потом бой. */
  const [openerGate, setOpenerGate] = useState<AttackOrder | null>(null);
  /** После отбитого удалённого налёта — необязательная реплика. */
  const [postCommentRaid, setPostCommentRaid] = useState<string | null>(null);
  /** Открыт ли планировщик пробного налёта на себя. */
  const [summonRaidOpen, setSummonRaid] = useState(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [modal, setModal] = useState<ModalId | null>(null);
  const [naming, setNaming] = useState<"found" | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [loanAmount, setLoanAmount] = useState(LOAN_MIN);
  /** С кем открыт разговор и сколько непрочитанного от кого. */
  const [writeTo, setWriteTo] = useState<Enemy | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  /** Где враг менял склад после разведки: карточка затягивает это туманом. */
  const fetchStale = useCallback(
    (enemy: Enemy) =>
      enemy.scout ? repo.stalePatches(enemy.email, enemy.scout.cells) : Promise.resolve([]),
    [repo]
  );
  const [showRules, setShowRules] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [telegram, setTelegram] = useState<{ code: string; linked: boolean } | null>(null);
  const [panelOrder, setPanelOrder] = useState(DEFAULT_PANELS);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [dragPanel, setDragPanel] = useState<string | null>(null);
  /** Журнал боёв: и свои налёты, и те, где отбивался. */
  const { raids, loadRaids, hideRaid, openReplay, watching, setWatching } = useJournal(
    repo,
    t,
    setMessage
  );
  /** Карточка врага, открытая по нику из журнала боёв. */
  const [foeCard, setFoeCard] = useState<Enemy | null>(null);
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
  const [now, setNow] = useState(() => Date.now());
  /** Когда последний раз сверяли имена чужих складов. */
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
  const dragGunRef = useRef<{ cx: number; cy: number; kind: GunKind } | null>(null);

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

  /**
   * Опрос сервера и очередь налётов: обе заботы живут в своём хуке, а лобби
   * только даёт ему, чем перерисоваться и куда сказать.
   */
  const attacks = useAttacks({
    repo,
    player: playerRef,
    t: tRef,
    refresh: () => forceRender((v) => v + 1),
    refreshMap: () => setVersion((v) => v + 1),
    say: setMessage,
    setReports,
    setNow,
    setUnread,
    reloadBase: resyncBase,
    loadRaids,
  });

  const saveNow = async () => {
    const cur = playerRef.current;
    if (!cur) return;
    try {
      const patch = await repo.saveBase(cur);
      if (patch.credits !== undefined) cur.credits = patch.credits;
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("save.rejected", { error: explain(e, t) }));
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
        titleCompetitions(player.incoming, t);
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
              (sold && sold.drones
                ? t("income.sold", {
                    drones: sold.drones,
                    dronesValue: fmt(
                      sold.drones *
                        priceAt(DRONE_UNIT_COST, player.levels.drones) *
                        SALE_MULTIPLIER
                    ),
                  })
                : "")
          );
        }
      })
      .catch((e) => {
        if (!alive) return;
        setMessage(t("load.failed", { error: explain(e, t) }));
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
        makeOrder(t(`bot.${(Math.random() * BOT_COUNT) | 0}` as Key), [
          {
            pattern,
            direction: (Math.random() * 4) | 0,
            delay: 0,
            groups: [{ payload: "plain", n: size }],
          },
        ])
      );
    }
    window.history.replaceState({}, "", window.location.pathname);
    touch();
    setMessage(t("raid.testQueued", { count: list.length, size }));
    notifyTestRaid(size * list.length);
    // разовый запуск: как только игрок загрузился, налёты уже в очереди
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  // Пока открыто окно телеграма — периодически и по возврату во вкладку
  // спрашиваем статус: Start в боте бывает в другом окне, без опроса кнопка
  // так и останется «Привязать».
  useEffect(() => {
    if (modal !== "telegram") return;
    let alive = true;
    const pull = () => {
      void repo
        .telegram()
        .then((row) => {
          if (alive) setTelegram(row);
        })
        .catch(() => {
          if (alive) setTelegram(null);
        });
    };
    pull();
    const tick = window.setInterval(pull, 2500);
    const onShow = () => {
      if (!document.hidden) pull();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      alive = false;
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [modal, repo]);

  const p = playerRef.current;
  /**
   * Всё, что требует прохода по десяти тысячам клеток. Пересчитываем только
   * когда склад менялся: рендер случается и от движения мыши, и раз в секунду
   * при идущей атаке, а таких проходов тут было пять на каждый.
   */
  const counts = useMemo(() => {
    if (!p) return { intact: 0, burnt: 0, free: 0, drones: 0 };
    return {
      intact: intactCells(p),
      burnt: burntCells(p),
      free: countFreeCells(p.cells, p.guns, p.depots),
      drones: droneCount(p.depots),
    };
    // version меняется при любой правке склада — он и есть ключ кэша
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, version]);
  // Сцена собирается на каждом React-обновлении. Это важно для ремонта и
  // drag-and-drop: там массив клеток/контейнеров заменяется целиком, чтобы
  // canvas гарантированно получил новое состояние, а не старую ссылку.
  const dragGun = dragGunRef.current;
  const scene = p
    ? {
        cells: p.cells,
        guns: dragGun
          ? p.guns.filter((g) => g.cx !== dragGun.cx || g.cy !== dragGun.cy)
          : p.guns,
        depots: p.depots,
      }
    : { cells: new Uint8Array(0), guns: [], depots: [] };

  if (!ready || !p) {
    return <div className="p-6 text-sm text-neutral-500">{t("app.loading")}</div>;
  }

  const { intact, burnt, drones } = counts;
  /** Во что обходится дрон при нынешнем уровне: от него считается надбавка. */
  const droneCost = priceAt(DRONE_UNIT_COST, p.levels.drones);
  // то же самое, но под ключи кнопок: у каждой в углу своё число
  /** Во что обойдётся то, что ставит этот инструмент, с учётом прокачки. */
  /** Секунды показываем с одним знаком и без хвостового нуля. */
  const round1 = (v: number) => Math.round(v * 10) / 10;

  /**
   * Цену спрашиваем у стройки — у той самой, что потом и спишет. Раньше
   * тут стоял свой такой же перебор по видам, и ценник на кнопке мог
   * разойтись с тем, что снимут с кошелька.
   */
  const toolPrice = (item: (typeof TOOLS)[number]) => {
    if (isBuildKind(item.id)) return gunCost(p.levels, item.id);
    if (item.id === "drones") return depotCost(p.levels, "basic");
    if (item.id === "balloons") return depotCost(p.levels, "balloon");
    return item.vars.cost;
  };

  /** Числа для подсказки: что прокачано, то показываем по уровню. */
  const toolVars = (item: (typeof TOOLS)[number]) => {
    if (item.id === "rocket")
      return {
        ...item.vars,
        range: Math.round(rocketRange({ rocketLevel: p.levels.rockets })),
        // Перезарядку показываем прокачанную, как и дальность: одна цифра
        // по уровню, другая по первому — это читалось бы как опечатка.
        reload: round1(ROCKET.cooldown / rocketTempo({ rocketLevel: p.levels.rockets })),
      };
    if (item.id === "spray")
      return { ...item.vars, range: Math.round(sprayRange({ sprayLevel: p.levels.sprays })) };
    if (item.id === "trap")
      return { ...item.vars, range: Math.round(trapRange({ trapLevel: p.levels.traps })) };
    if (item.id === "drones") return { ...item.vars, cost: toolPrice(item) };
    return item.vars;
  };

  const counters = {
    intact,
    burnt,
    guns: countKind(p.guns, "gun"),
    rockets: countKind(p.guns, "rocket"),
    sprays: countKind(p.guns, "spray"),
    traps: countKind(p.guns, "trap"),
    drones,
    balloons: balloonCount(p.depots),
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
          rockets: p.levels.rockets,
          sprays: p.levels.sprays,
          traps: p.levels.traps,
          mg: p.levels.mg,
          water: p.levels.water,
        }}
        insuranceLevel={p.levels.insurance}
        onFinish={async (o: BattleOutcome) => {
          const { killed, mission, foeChanged } = applyOutcome(p, battle, o);
          // Сервер узнает об исходе только из applyBattle ниже, а опрос идёт
          // раз в десять секунд и собирает очередь заново. Без этой отметки
          // только что отбитый рой успевал вернуться в список.
          attacks.markResolved(battle.id);
          if (foeChanged) void repo.saveEnemies(p).catch(() => {});
          setBattle(null);
          setMessage(
            mission
              ? t(mission.record ? "competition.record" : "competition.result", {
                  n: mission.stage,
                  pct: mission.pct,
                  score: mission.score,
                })
              : o.won
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
            // в миссии писать некому: второй стороны нет
            if (battle.remote && !mission) {
              notifyBattle(battle.id, "resolved");
              setPostCommentRaid(battle.id);
            }
            if (patch.credits !== undefined) p.credits = patch.credits;
            forceRender((v) => v + 1);
          } catch (e) {
            setMessage(t("battle.notSaved", { error: explain(e, t) }));
            // Тот же случай: у сервера бой остался неотбитым, и показать его
            // снова надо — иначе отбиваться будет нечем, а очередь встанет.
            attacks.unmarkResolved(battle.id);
            await resyncBase();
          } finally {
            loadRaids();
          }
        }}
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
        level={p.levels.drones}
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
            setMessage(t("enemies.notSaved", { error: explain(e, t) }));
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
  // Сколько клеток, почём и можно ли — считает стройка; лобби только
  // рисует по этому ценник и решает, красить ли рамку красным.
  const plan = draftPlan(p, drafting ? tool : "area", draftRect, hasBuilding);
  const draftCells = plan.cells;
  const draftCost = plan.cost;
  const draftConnects = plan.connects;
  const draftAfford = draftCost <= p.credits;

  /**
   * Делает то, что сказала стройка: отказ показывает словами, согласие
   * сохраняет. Дальше в лобби остаётся только то, чего стройка не знает, —
   * всплывающий ценник над клеткой да перерисовка.
   */
  const act = (r: BuildResult, at?: { x: number; y: number }) => {
    if (!r.ok) {
      setMessage(t(r.why, r.vars));
      return false;
    }
    if (r.spent === 0) return true;
    if (at) showPrice(at.x, at.y, -r.spent);
    touch();
    return true;
  };

  const commitDraft = () => {
    if (!draftRect || draftRect.w <= 0 || draftRect.h <= 0) return;
    const before = draftCells;
    const r = applyDraft(p, drafting ? tool : "area", draftRect, hasBuilding);
    if (!r.ok) {
      setMessage(t(r.why, r.vars ? { cost: fmt(Number(r.vars.cost)) } : undefined));
      return;
    }
    if (before > 0) {
      setMessage(
        tool === "scrap"
          ? t("scrap.done", { cells: before, gain: fmt(before * SCRAP_REWARD) })
          : tool === "repair"
            ? t("repair.done", { cells: before, cost: fmt(r.spent) })
            : t("draft.built", { cells: before, cost: fmt(r.spent) })
      );
    }
    draftRef.current = null;
    dragRef.current = null;
    if (before > 0) touch();
    else forceRender((v) => v + 1);
  };

  const buildOne = (x: number, y: number) => {
    act(buildCell(p, x, y, hasBuilding));
  };

  const scrapAt = (x: number, y: number) => {
    act(scrapCell(p, x, y), { x, y });
  };

  const repairAt = (x: number, y: number) => {
    act(repairCell(p, x, y));
  };

  const gunAt = (x: number, y: number, kind: GunKind = "gun") => {
    act(placeGun(p, x, y, kind), { x, y });
  };

  /**
   * Контейнер покупается прямо на карте, как пушка: ткнул в свободную клетку —
   * появился ящик, деньги списались. Ставим сразу, не дожидаясь сервера, а
   * откажет — возвращаем как было.
   */
  const buyDepotAt = async (x: number, y: number, kind: DepotKind = "basic") => {
    const previousDepots = p.depots;
    const previousCredits = p.credits;
    if (!act(placeDepot(p, x, y, kind), { x, y })) return;
    if (p.depots === previousDepots) return; // клетка уже занята своим же ящиком

    setVersion((v) => v + 1);
    forceRender((v) => v + 1);
    try {
      const patch = await repo.buyDepot(p, depotSize(kind), kind);
      if (patch.credits !== undefined) p.credits = patch.credits;
      forceRender((v) => v + 1);
    } catch (e) {
      p.depots = previousDepots;
      p.credits = previousCredits;
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
      setMessage(t("arsenal.buyFailed", { error: explain(e, t) }));
    }
  };

  /** Перетаскивание контейнера на свободную клетку. Ничего не стоит. */
  const moveDepot = (from: { cx: number; cy: number }, x: number, y: number) => {
    if (act(shiftDepot(p, from, x, y))) touch();
  };

  /** Перетаскивание установки на другую целую клетку. Тоже даром. */
  const moveGun = (from: { cx: number; cy: number; kind: GunKind }, x: number, y: number) => {
    if (act(shiftGun(p, from, x, y))) touch();
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
      setMessage(t("base.nameNotSaved", { error: explain(e, t) }));
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
      setMessage(t("base.renameFailed", { error: explain(e, t) }));
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
      // Знакомство взаимное, и вторая сторона о нём пока не знает: пусть
      // узнает от бота, а не по первому прилетевшему рою.
      notifyRivalAdded(email);
    } catch (e) {
      // Тут сервер решает, можно ли добавить (есть ли такой игрок, не ты ли
      // это), — ничего не сохранялось, так что «не удалось сохранить» врало бы.
      return explainAlone(e, t);
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
      return t("enemies.notSaved", { error: explain(e, t) });
    }
  };

  /** Разведка всегда одним дроном: снимает, что успеет, и возвращается. */
  const doScout = async (enemy: Enemy): Promise<string | null> => {
    const planes = 1;
    if (drones < planes) return t("scout.needPlanes");
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
      return t("scout.failed", { error: explain(e, t) });
    }
  };

  const doRaid = async (
    enemy: Enemy,
    waves: WavePlan[],
    comment?: string
  ): Promise<string | null> => {
    const n = raidTotal(waves);
    if (drones < n) return t("raid.notEnough");
    if (payloadCost(droneCost, waves) > p.credits) return t("raid.noCredits");
    const seed = (Math.random() * 1e9) | 0;
    try {
      // Склад должен лежать на сервере до вылета: дронов снимает он сам,
      // со своей копии, и обратно присылает уже новый склад. Надбавку за
      // начинку тоже считает и списывает он.
      await flushPersist();
      const id = await repo.sendAttack(p, enemy.email, waves, seed, comment);
      if (id) {
        notifyBattle(id, "sent");
        if (comment?.trim()) notifyComment(id);
      }
      // счётчик налётов поднимает сам send_attack — второй раз здесь не нужно
      setMessage(t("raid.sent", { email: enemy.email }));
      loadRaids();
      setVersion((value) => value + 1);
      forceRender((value) => value + 1);
      return null;
    } catch (error) {
      return t("raid.sendFailed", { error: explain(error, t) });
    }
  };

  /**
   * Состязание на свой склад: постоянный состав и зерно по номеру,
   * бесплатно. Вошедшему ставит в очередь сервер — бой идёт той же дорогой,
   * что живой, с повтором и журналом; без входа очередь своя, в браузере.
   */
  /**
   * Сыграть состязание: сразу в бой, мимо очереди налётов. Если этот номер
   * уже стоит в очереди — бой прервали на полпути, — играем его, а не
   * ставим второй.
   */
  const playCompetition = async (stage: number) => {
    const queued = p.incoming.find((a) => a.competitionStage === stage);
    if (queued) {
      await defend(queued);
      return;
    }
    // сервер убирает прежние неотыгранные миссии — убираем и мы
    p.incoming = p.incoming.filter((a) => !a.competitionStage);
    const plan = buildCompetition(stage);
    const order = makeOrder(
      t("competition.title", { n: stage }),
      plan.waves,
      plan.droneLevel,
      plan.seed
    );
    order.competitionStage = stage;
    if (repo.mode === "cloud") {
      try {
        // Серверный id вместо своего: следующий опрос узнает этот же налёт
        // и не задвоит его в очереди.
        order.id = await repo.queueCompetition(stage, plan.waves, plan.seed, plan.droneLevel);
        order.remote = true;
      } catch (e) {
        setMessage(explainAlone(e, t));
        return;
      }
    }
    p.incoming.push(order);
    touch();
    await defend(order);
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
          // Ракетница сбивает примерно в полтора раза больше зенитки: ракета
          // сама доворачивает на цель. В прикидке силы склада так и весит.
          Math.round(countKind(p.guns, "rocket") * 1.5) +
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
      dragGunRef.current = { cx: gun.cx, cy: gun.cy, kind: gunKind(gun) };
      forceRender((v) => v + 1);
      return;
    }

    if (tool === "drones" || tool === "balloons") {
      void buyDepotAt(c.x, c.y, tool === "balloons" ? "balloon" : "basic");
      return;
    }
    if (isBuildKind(tool)) {
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

    switch (drag.mode) {
      case "create":
        draftRef.current = {
          x: drag.origin.x,
          y: drag.origin.y,
          w: Math.round(pt.x - drag.origin.x),
          h: Math.round(pt.y - drag.origin.y),
        };
        break;
      case "move":
        draftRef.current = {
          x: drag.origin.x + Math.round(dx),
          y: drag.origin.y + Math.round(dy),
          w: drag.origin.w,
          h: drag.origin.h,
        };
        break;
      default: {
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
        break;
      }
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

  /**
   * Чьи круги покрытия сейчас уместны. Выбран инструмент установки — её и
   * показываем; тащим готовую — показываем круги её рода. В остальное время
   * ничьи: втроём они закрывают склад так, что на нём ничего не разобрать.
   */
  /**
   * Где на складе уже стоит то, что сейчас выбрано. Подсвечиваем только
   * предметы: у площади, ремонта и сноса подсвечивать нечего — они работают
   * по клеткам, а не по объектам.
   */
  const pickedSpots = (): { cx: number; cy: number }[] => {
    if (isBuildKind(tool)) {
      return p.guns.filter((g) => gunKind(g) === tool);
    }
    if (tool === "drones" || tool === "balloons") {
      const want = tool === "balloons" ? "balloon" : "basic";
      return p.depots.filter((d) => depotKind(d) === want);
    }
    return [];
  };

  const coverageFor = (): CoverageKind[] => {
    if (isBuildKind(tool)) return [tool];
    const from = dragGunRef.current;
    if (!from) return [];
    const g = p.guns.find((item) => item.cx === from.cx && item.cy === from.cy);
    return g ? [gunKind(g)] : [];
  };

  const overlay = (ctx: CanvasRenderingContext2D, frameNow: number, view?: View) => {
    const cell = 7;
    // Круги показываем только у того, что сейчас ставят: втроём они
    // закрывают склад так, что на нём уже ничего не разобрать. Дальность
    // берём прокачанную, иначе не видно, что дал апгрейд.
    drawCoverage(
      ctx,
      p.guns,
      cell,
      gunRange({ gunLevel: p.levels.guns }),
      sprayRange({ sprayLevel: p.levels.sprays }),
      trapRange({ trapLevel: p.levels.traps }),
      rocketRange({ rocketLevel: p.levels.rockets }),
      coverageFor()
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
        // У сноса «соединяет» и значит «не разорвёт склад» — одна и та же
        // проверка, второй флаг ей не нужен.
        scrapWhole: tool !== "scrap" || draftConnects,
        afford: draftAfford,
        connects: draftConnects,
      });
    }

    const hover = hoverRef.current;
    const hx = hover ? Math.floor(hover.x) : -1;
    const hy = hover ? Math.floor(hover.y) : -1;

    // Установки и контейнеры переставляются одинаково: тянем и роняем. Видно
    // и куда можно, и куда нельзя.
    const placing = isBuildKind(tool) || dragGunRef.current;
    const stacking = tool === "drones" || tool === "balloons" || draggedDepot;
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
      if (dragGunRef.current) {
        const from = dragGunRef.current;
        const source = p.guns.find(
          (g) => g.cx === from.cx && g.cy === from.cy && gunKind(g) === from.kind
        );
        if (source) {
          const kind = gunKind(source);
          const px = onMap(hx, hy) ? hx : from.cx;
          const py = onMap(hx, hy) ? hy : from.cy;
          const angle = Math.atan2(py + 0.5 - GRID / 2, px + 0.5 - GRID / 2);
          switch (kind) {
            case "spray":
              drawSpray(ctx, px, py, cell, angle, 0, ok);
              break;
            case "trap":
              drawTrap(ctx, px, py, cell, ok);
              break;
            case "rocket":
              drawRocket(ctx, px, py, cell, angle, ok);
              break;
            default:
              drawTurret(ctx, px, py, cell, angle, ok);
              break;
          }
        }
      }
      drawDropTarget(ctx, cell, hx, hy, ok, dragGunRef.current ? "#8ecae6" : "#f5c56f");
    }

    // Клетка под курсором — сработает тут инструмент или нет. При раскладке
    // контейнеров не рисуем: там уже подсвечены все свободные клетки.
    if (hover && !d && onMap(hx, hy) && tool !== "drones") {
      const v = p.cells[idx(hx, hy)];
      let ok = false;
      switch (tool) {
        case "area":
          ok = !isBuilding(v) && (!hasBuilding || touchesBuilding(p.cells, hx, hy));
          break;
        case "repair":
          ok = v === G_BURNT;
          break;
        case "gun":
        case "spray":
        case "trap":
        case "rocket":
          ok = v === G_BASE && !p.depots.some((q) => q.cx === hx && q.cy === hy);
          break;
      }
      drawHoverCell(ctx, cell, hx, hy, ok);
    }

    // Выбранную категорию обводим: иначе среди пёстрой карты не найти, есть
    // ли у тебя разведка и где она стоит.
    drawPicked(ctx, cell, pickedSpots(), frameNow);

    priceTags.current = drawPriceTags(ctx, cell, priceTags.current, frameNow);

    // Подпись только у установок и контейнеров: землю подписывать нечем.
    if (hover && onMap(hx, hy)) {
      const gun = p.guns.find((g) => g.cx === hx && g.cy === hy);
      const depot = p.depots.find((item) => item.cx === hx && item.cy === hy);
      let label: string | null = null;
      if (gun) {
        const kind = gunKind(gun);
        switch (kind) {
          case "spray":
            label = t("tool.spray");
            break;
          case "trap":
            label = t("tool.trap");
            break;
          case "rocket":
            label = t("tool.rocket");
            break;
          default:
            label = t("tool.gun");
            break;
        }
      } else if (depot) {
        // Подпись по виду контейнера: на ящике с шарами «Дроны» — ровно та
        // ошибка, которую подпись и должна была снимать.
        label = t(
          depotKind(depot) === "balloon" ? "map.hover.balloons" : "map.hover.drones",
          { n: depot.n }
        );
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
          variant="build"
          size="lg"
          onClick={async () => {
            try {
              playerRef.current = await repo.wipe(p);
              setMessage(t("doomed.restarted"));
              setVersion((v) => v + 1);
              forceRender((v) => v + 1);
            } catch (e) {
              setMessage(t("doomed.failed", { error: explain(e, t) }));
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
      setMessage(t("burnt.razeFailed", { error: explain(e, t) }));
    }
  };

  /** Начать сначала: всё с нуля, кроме имени склада и списка соперников. */
  const restartGame = async () => {
    setConfirmRestart(false);
    try {
      playerRef.current = await repo.restart(p);
      attacks.forget();
      setReports([]);
      setMessage(t("restart.done"));
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("restart.failed", { error: explain(e, t) }));
    }
  };

  const takeLoan = async () => {
    try {
      await repo.takeLoan(p, loanAmount);
      setMessage(t("loan.taken", { amount: fmt(loanAmount), debt: fmt(loanDebt(loanAmount)) }));
      setModal(null);
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("loan.failed", { error: explain(e, t) }));
    }
  };

  const repayLoan = async () => {
    try {
      await repo.repayLoan(p);
      setMessage(t("loan.repaid"));
      setModal(null);
      forceRender((v) => v + 1);
    } catch (e) {
      setMessage(t("loan.failed", { error: explain(e, t) }));
    }
  };

  /** Открыть повтор из журнала: сам бой подгружаем по одной атаке. */
  /** Убрать соперника из списка. Счёт вражды уходит вместе с ним. */
  const removeEnemy = (enemy: Enemy) => {
    p.enemies = p.enemies.filter((e) => e.email.toLowerCase() !== enemy.email.toLowerCase());
    forceRender((v) => v + 1);
    void repo.saveEnemies(p).catch((e: unknown) => setMessage(t("enemies.notSaved", { error: explain(e, t) })));
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
      setMessage(t("upgrade.failed", { error: explain(e, t) }));
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

  const activeTool = TOOLS.find((item) => item.id === tool) ?? TOOLS[0];

  const defend = async (order: AttackOrder) => {
    setSheet(null);
    await flushPersist();
    const note = order.opener?.trim();
    if (order.remote && note) {
      setOpenerGate(order);
      return;
    }
    setBattle(order);
  };

  const enterBattleAfterOpener = async (order: AttackOrder, reply: string) => {
    setOpenerGate(null);
    if (reply && order.remote) {
      try {
        await postRaidComment(order.id, reply);
      } catch {
        // реплика — мелочь, бой важнее
      }
    }
    setBattle(order);
  };

  // Журналы собираем один раз: они идут и в боковую колонку, и в шторку.
  // Состязания в журнал боёв не попадают: у них свой, по номерам.
  const raidsBody = (
    <RaidsPanel
      incoming={p.incoming.filter((a) => !a.competitionStage)}
      raids={raids}
      onDefend={(order) => void defend(order)}
      onWatch={(r) => void openReplay(r.id, r.side === "attack" ? r.foe : p.name)}
      onHide={(id) => void hideRaid(id)}
      onFoe={(email) => {
        const enemy = email
          ? p.enemies.find((e) => e.email.toLowerCase() === email.toLowerCase())
          : undefined;
        return enemy
          ? () => {
              setSheet(null);
              setFoeCard(enemy);
            }
          : undefined;
      }}
    />
  );
  const competitionsBody = (
    <CompetitionsPanel
      competitionAt={p.competitionAt}
      best={p.competitionBest}
      onPlay={(stage) => void playCompetition(stage)}
      onWatch={(_stage, id) => void openReplay(id, p.name)}
    />
  );

  const summonButton = (
    <Button size="sm" onClick={() => setSummonRaid(true)}>
      {t("attacks.summon")}
    </Button>
  );

  const enemiesBody = (
    <Enemies
      onRemove={removeEnemy}
      enemies={p.enemies}
      drones={drones}
      credits={p.credits}
      droneCost={droneCost}
      onAdd={addEnemy}
      onRaid={doRaid}
      onScout={doScout}
      fetchStale={fetchStale}
      onWrite={(enemy) => {
        setSheet(null);
        setWriteTo(enemy);
        // Окно на экране — значит увидел: гасим счётчик, не дожидаясь
        // следующего опроса, иначе он висел бы ещё полминуты.
        setUnread((was) => {
          const next = { ...was };
          delete next[enemy.email.toLowerCase()];
          return next;
        });
        void repo.readMessages(enemy.email).catch(() => {});
      }}
      unread={unread}
      onChanged={() => forceRender((v) => v + 1)}
    />
  );

  const SIDE_PANELS: Record<
    string,
    { title: Key; action?: ReactNode; body: ReactNode }
  > = {
    enemies: { title: "panel.enemies", body: enemiesBody },
    replays: { title: "panel.replays", action: summonButton, body: raidsBody },
    competitions: { title: "panel.competitions", body: competitionsBody },
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
  // Тревога — только о чужих налётах: миссию игрок запускает сам, а
  // недоигранная висит в очереди до следующего «играть» в журнале миссий.
  const raidsIn = p.incoming.filter((a) => !a.competitionStage);
  let barTone = "border-neutral-800 bg-neutral-900/40 text-neutral-500";
  let barBody: ReactNode = (
    // Те же числа, что и на самой кнопке: сырые vars не знают ни цены по
    // уровню, ни прокачанной дальности, и в строке оставались «{cost}».
    <span className="min-w-0 truncate">{t(activeTool.hint, toolVars(activeTool))}</span>
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
  } else if (raidsIn.length > 0) {
    barTone = "border-red-900/70 bg-red-950/30 text-red-100";
    barBody = (
      <>
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
        <span className="min-w-0 truncate">
          {t("attacks.incoming", { from: raidsIn[0].from, drones: raidsIn[0].drones })}
        </span>
        <Button
          variant="danger"
          size="sm"
          className="ml-auto"
          onClick={() => void defend(raidsIn[0])}
          disabled={intact === 0}
        >
          {raidsIn.length > 1
            ? t("attacks.defendCount", { count: raidsIn.length })
            : t("attacks.defend")}
        </Button>
      </>
    );
  }

  const accountLine = (
    <AccountMenu
      name={account?.name ?? null}
      email={account?.email ?? null}
      avatar={p.avatar}
      onAvatar={() => setModal("avatar")}
      onTelegram={() => {
        setModal("telegram");
        setTelegram(null);
        void repo.telegram().then(setTelegram).catch(() => setTelegram(null));
      }}
      onRules={() => setShowRules(true)}
      onStats={() => setShowStats(true)}
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
        <IconButton
          label={t("panel.replays")}
          badge={p.incoming.filter((a) => !a.competitionStage).length}
          onClick={() => toggleSheet("attacks")}
        >
          <IconTarget />
        </IconButton>
        <IconButton
          label={t("panel.competitions")}
          onClick={() => toggleSheet("competitions")}
        >
          <Trophy className="h-5 w-5" />
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
      {/*
        Ширина кнопки плывёт: на узком десктопе она ужимается до трёх
        четвертей, и ряд инструментов не съедает высоту, отведённую карте.
      */}
      {/*
        На десктопе ряд занимает строку целиком: колонок ровно столько,
        сколько инструментов, и каждая тянется на равную долю. Число берём
        из самого списка — добавится инструмент, ряд пересчитается сам, а
        классом это не задать: Tailwind собирает их чтением исходника и
        вычисленного имени не найдёт.

        На телефоне по-прежнему пять в ряд и не шире 384 точек: там кнопку
        растягивать некуда, её и так хватает под палец.
      */}
      <div
        style={{ "--tools": TOOLS.length } as CSSProperties}
        className="order-3 mx-auto grid w-full max-w-96 shrink-0 grid-cols-5 gap-1.5 lg:order-2 lg:mx-0 lg:max-w-none lg:gap-2 lg:[grid-template-columns:repeat(var(--tools),minmax(0,1fr))]"
      >
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

      {/*
        Правая колонка не фиксированная, а сжимается вместе с окном: на
        восьмистах точках прежние 24rem не оставляли карте ничего.
      */}
      <div className="order-2 flex min-h-0 flex-1 flex-col gap-2 lg:order-3 lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(14rem,26vw,24rem)] lg:gap-4">
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
      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {showStats && (
        <Modal
          title={t("panel.stats")}
          onClose={() => setShowStats(false)}
          footer={
            <Button variant="build" onClick={() => setShowStats(false)}>
              {t("common.ok")}
            </Button>
          }
        >
          <StatsPanel stats={p.stats} />
        </Modal>
      )}

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

      {summonRaidOpen && (
        <SummonRaidDialog
          initial={suggestedRaid()}
          enemies={p.enemies}
          drones={drones}
          credits={p.credits}
          droneCost={droneCost}
          onCancel={() => setSummonRaid(false)}
          onSend={async (enemy, waves, comment) => {
            const err = await doRaid(enemy, waves, comment);
            if (!err) setSummonRaid(false);
            return err;
          }}
        />
      )}

      {foeCard && (
        <EnemyProfile
          enemy={foeCard}
          onClose={() => setFoeCard(null)}
          onRemove={() => {
            setFoeCard(null);
            removeEnemy(foeCard);
          }}
          fetchStale={fetchStale}
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

      {openerGate && (
        <RaidOpenerModal
          order={openerGate}
          onDone={(reply) => void enterBattleAfterOpener(openerGate, reply)}
        />
      )}

      {postCommentRaid && (
        <PostRaidCommentModal
          onDone={(body) => {
            const id = postCommentRaid;
            setPostCommentRaid(null);
            if (body && id) void postRaidComment(id, body).catch(() => {});
          }}
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
              setMessage(t("report.closeFailed", { error: explain(error, t) }));
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
            <div className="flex flex-wrap justify-center gap-2">
              {telegram?.linked ? (
                <Button
                  variant="danger"
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
                    href={`https://t.me/${TG_BOT}?start=${encodeURIComponent(telegram.code)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="build">{t("tg.link")}</Button>
                  </a>
                )
              )}
              <Button
                variant={telegram?.linked || !TG_BOT ? "build" : "outline"}
                onClick={() => setModal(null)}
              >
                {t("common.ok")}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-neutral-300">
            {telegram?.linked ? t("tg.linked") : t("tg.explain")}
          </p>
          {!telegram?.linked && TG_BOT && (
            <p className="mt-2 text-xs text-neutral-500">{t("tg.afterStart")}</p>
          )}
          {!TG_BOT && <p className="mt-2 text-xs text-neutral-500">{t("tg.noBot")}</p>}
        </Modal>
      )}
      {writeTo && (
        <MessageDialog
          enemy={writeTo}
          load={(email) => repo.messages(email)}
          onSend={(email, body) => repo.sendMessage(email, body)}
          onClose={() => setWriteTo(null)}
        />
      )}

      {modal === "avatar" && (
        <AvatarPicker
          avatar={p.avatar}
          name={p.name || (account?.name ?? null)}
          email={account?.email ?? null}
          onPick={async (value) => {
            try {
              await repo.setAvatar(p, value);
              forceRender((v) => v + 1);
            } catch (e) {
              setMessage(t("save.rejected", { error: explain(e, t) }));
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "loan" && (
        <LoanDialog
          player={p}
          now={now}
          amount={loanAmount}
          onAmount={setLoanAmount}
          onTake={takeLoan}
          onRepay={repayLoan}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "insurance" && (
        <InsuranceDialog player={p} onUpgrade={doUpgrade} onClose={() => setModal(null)} />
      )}
      {modal === "upgrade" && (
        <UpgradeDialog player={p} onUpgrade={doUpgrade} onClose={() => setModal(null)} />
      )}

      <Sheet open={sheet === "attacks"} title={t("panel.replays")} onClose={() => setSheet(null)}>
        <div className="mb-3 flex justify-end">{summonButton}</div>
        {raidsBody}
      </Sheet>
      <Sheet
        open={sheet === "competitions"}
        title={t("panel.competitions")}
        onClose={() => setSheet(null)}
      >
        {competitionsBody}
      </Sheet>
      <Sheet open={sheet === "enemies"} title={t("panel.enemies")} onClose={() => setSheet(null)}>
        {enemiesBody}
      </Sheet>
      <Sheet open={sheet === "menu"} title={t("panel.base")} onClose={() => setSheet(null)}>
        <div className="space-y-5">
          {p.founded && (
            <div>
              {/*
                Шторка и так зовётся «Склад» — повторять это над полем
                незачем: там стоит имя, о том и заголовок.
              */}
              <div className="mb-2">
                <SectionTitle>{t("panel.baseName")}</SectionTitle>
              </div>
              {baseNameBody}
            </div>
          )}
          <div>
            <div className="mb-2">
              <SectionTitle>{t("panel.account")}</SectionTitle>
            </div>
            {/*
              Лицо здесь же, рядом с именем: на телефоне шапки с аккаунтом
              нет, и увидеть своё лицо больше негде. По тычку открывается
              та же выбиралка, что и на десктопе.
            */}
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                setModal("avatar");
              }}
              className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded px-2 py-1 text-left transition hover:bg-neutral-800"
            >
              <AvatarView
                avatar={p.avatar}
                name={account?.name ?? null}
                email={account?.email ?? null}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-neutral-100">
                  {account?.name ?? account?.email ?? t("app.localMode")}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {t("avatar.change")}
                </span>
              </span>
            </button>
            {/* Пункта «выбрать аватар» тут нет: он уже кнопкой выше. */}
            <SettingsList
              onTelegram={() => {
                setSheet(null);
                setModal("telegram");
                setTelegram(null);
                void repo.telegram().then(setTelegram).catch(() => setTelegram(null));
              }}
              onRules={() => {
                setSheet(null);
                setShowRules(true);
              }}
              onStats={() => {
                setSheet(null);
                setShowStats(true);
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
