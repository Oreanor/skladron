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
  DRONES_PER_CELL,
  GRID,
  droneCount,
  countFreeCells,
  countKind,
  type GunKind,
  normRect,
} from "@/lib/base";
import {
  CELL_COST,
  STARTER_SIDE,
  LOAN_MIN,
  saleValue,
  SHIFT_HOURS,
  SCRAP_REWARD,
  dronePrice,
  shownLevel,
  loanDebt,
  MIN_BASE_CELLS,
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
import { type View } from "@/lib/render";
import {
  balloonCount,
  balloonRange,
  rocketRange,
  rocketTempo,
  sprayRange,
  trapRange,
} from "@/lib/engine";
import { RAID, ROCKET } from "@/lib/tuning";
import {
  applyDraft,
  buildOne as buildCell,
  depotCost,
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
import { mapHandlers, pushPriceTag, useMapRefs } from "./lobby/mapInput";
import { drawLobbyOverlay } from "./lobby/drawLobby";
import { statusBar } from "./lobby/statusBar";
import TelegramDialog from "./lobby/TelegramDialog";
import SummonRaidDialog from "./lobby/SummonRaidDialog";
import NeedDrones from "./lobby/NeedDrones";
import IncomeLine from "./lobby/IncomeLine";
import BlueprintsPanel, { BlueprintDialog, NewBlueprintDialog } from "./lobby/BlueprintsPanel";
import {
  MAX_BLUEPRINT_NAME,
  blueprintOf,
  goodsValue,
  installValue,
  rebuildCost,
  type Blueprint,
} from "@/lib/blueprint";
import AttackReportDialog from "./lobby/AttackReportDialog";
import MessageDialog from "./lobby/MessageDialog";
import BaseName from "./lobby/BaseName";
import { useAttacks } from "./lobby/useAttacks";
import { InsuranceDialog, LoanDialog, UpgradeDialog } from "./lobby/MoneyDialogs";
import RaidsPanel, { StatsPanel } from "./lobby/RaidsPanel";
import AvatarPicker from "./lobby/AvatarPicker";
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
import { useZones } from "./ZonesToggle";
import Rules from "./Rules";
import { postRaidComment } from "@/lib/comments";
import {
  notifyBattle,
  notifyComment,
  notifyRivalAdded,
  notifyTestRaid,
} from "@/lib/notify";
import { PostRaidCommentModal, RaidOpenerModal } from "./lobby/RaidCommentModals";

import MapCanvas from "./MapCanvas";
import AccountMenu, { SettingsList } from "./AccountMenu";
import AvatarView from "./Avatar";
import { useSettings, useT } from "@/lib/i18n";
import { explain, explainAlone } from "@/lib/errors";
import type { Key } from "@/lib/i18n/dict";
import { DraftingCompass, Trophy } from "lucide-react";
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
  const { locale } = useSettings();
  /**
   * Опросы заводятся один раз на всю игру, а переводчик меняется вместе с
   * языком. Читаем его через ref, иначе интервалы замыкают самый первый t
   * и до перезагрузки говорят на языке, с которого игрок уже ушёл.
   */
  const tRef = useRef(t);
  tRef.current = t;
  const repo = getRepo();
  // Бот пишет на языке игры: сообщаем его серверу при входе и при смене.
  useEffect(() => {
    void repo.setLocale(locale).catch(() => {});
  }, [repo, locale]);
  const playerRef = useRef<Player | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useState(0);
  const [tool, setTool] = useState<Tool>("area");
  /** Выбранный инструмент помним между заходами — он тоже настройка. */
  const toolRef = useRef<Tool>("area");
  toolRef.current = tool;
  const [message, setMessage] = useState<string | null>(null);
  const [battle, setBattle] = useState<AttackOrder | null>(null);
  /** Исход боя ещё пишется на сервер: следующую миссию он пока не открыл. */
  const [saving, setSaving] = useState(false);
  /** Налёт с запиской нападающего — сначала показываем её, потом бой. */
  const [openerGate, setOpenerGate] = useState<AttackOrder | null>(null);
  /** После отбитого удалённого налёта — необязательная реплика. */
  const [postCommentRaid, setPostCommentRaid] = useState<string | null>(null);
  /** Открыт ли планировщик пробного налёта на себя. */
  const [summonRaidOpen, setSummonRaid] = useState(false);
  // дронов нет — вместо окна налёта предложение купить их
  const [needDrones, setNeedDrones] = useState(false);
  // круги того, что ставят или тащат, — их можно убрать галочкой в углу карты
  const [zones, setZones] = useZones("wb.lobbyZones", true);
  /** Чертежи: список, открытый в большом окне, ждущий подтверждения стройки и окно имени. */
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [openBlueprint, setOpenBlueprint] = useState<Blueprint | null>(null);
  const [buildAsk, setBuildAsk] = useState<Blueprint | null>(null);
  const [namingBlueprint, setNamingBlueprint] = useState(false);
  const [ready, setReady] = useState(false);
  // чертежи грузим, когда склад уже на месте
  useEffect(() => {
    if (!ready) return;
    void repo
      .blueprints()
      .then(setBlueprints)
      .catch(() => {
        // без списка чертежей играть можно
      });
  }, [repo, ready]);
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

  /** Руки на карте: рамка, перетаскивание, ценники — всё в refs. */
  const map = useMapRefs();

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
                    dronesValue: fmt(saleValue(sold.drones, player.levels.drones)),
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
    const size = Math.min(RAID.suggestMax, Math.max(30, Number(q.get("n")) || 200));
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
  const dragGun = map.dragGun.current;
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
  const droneCost = dronePrice(p.levels.drones);
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
    if (item.id === "drones") return depotCost(p.levels);
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
    if (item.id === "balloon")
      return {
        ...item.vars,
        range: Math.round(balloonRange({ balloonLevel: p.levels.balloons })),
        count: balloonCount(p.levels.balloons),
      };
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
    balloons: countKind(p.guns, "balloon"),
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
          balloons: p.levels.balloons,
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
          setSaving(true);
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
            setSaving(false);
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
  const draft = map.draft.current;
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
    map.draft.current = null;
    map.drag.current = null;
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
  const buyDepotAt = async (x: number, y: number) => {
    const previousDepots = p.depots;
    const previousCredits = p.credits;
    if (!act(placeDepot(p, x, y), { x, y })) return;
    if (p.depots === previousDepots) return; // клетка уже занята своим же ящиком

    setVersion((v) => v + 1);
    forceRender((v) => v + 1);
    try {
      const patch = await repo.buyDepot(p, DRONES_PER_CELL);
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

  /**
   * Двойной тап по установке или ящику — продать по номиналу, то есть по
   * нынешней цене закупки. Установка уходит обычным сохранением склада:
   * сервер сам видит, что её не стало, и возвращает цену. Ящик продаётся
   * отдельно: вне покупки число дронов сохранением менять нельзя.
   */
  const sellAt = async (x: number, y: number) => {
    const gun = p.guns.find((g) => g.cx === x && g.cy === y);
    if (gun) {
      const gain = installValue([gun], p.levels);
      p.guns = p.guns.filter((g) => g !== gun);
      p.credits += gain;
      pushPriceTag(map, t, x, y, gain);
      touch();
      return;
    }
    const depot = p.depots.find((d) => d.cx === x && d.cy === y);
    if (!depot) return;
    await flushPersist();
    const previousDepots = p.depots;
    const previousCredits = p.credits;
    const gain = goodsValue([depot], p.levels);
    p.depots = p.depots.filter((d) => d !== depot);
    p.credits += gain;
    pushPriceTag(map, t, x, y, gain);
    setVersion((v) => v + 1);
    forceRender((v) => v + 1);
    try {
      const patch = await repo.sellDepot(p, x, y);
      if (patch.credits !== undefined) p.credits = patch.credits;
      forceRender((v) => v + 1);
    } catch (e) {
      p.depots = previousDepots;
      p.credits = previousCredits;
      setVersion((v) => v + 1);
      setMessage(t("sell.failed", { error: explain(e, t) }));
    }
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
    if (saving) return;
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
      RAID.suggestMax,
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

  // ---------- ввод и отрисовка по карте ----------

  /** «−100 кр» над клеткой: видно, за что ушли деньги, и куда вернулись. */
  const showPrice = (x: number, y: number, amount: number) => pushPriceTag(map, t, x, y, amount);

  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __lobby: unknown }).__lobby = {
      player: p,
      tool,
      dragDepot: map.dragDepot,
      moveDepot,
    };
  }

  const hand = mapHandlers(map, {
    p,
    tool,
    drafting,
    rerender: () => forceRender((v) => v + 1),
    buildOne,
    repairAt,
    scrapAt,
    gunAt,
    buyDepotAt,
    moveDepot,
    moveGun,
    sellAt,
    commitDraft,
  });

  const overlay = (ctx: CanvasRenderingContext2D, frameNow: number, view?: View) =>
    drawLobbyOverlay(ctx, frameNow, view, {
      p,
      tool,
      m: map,
      zones,
      draftAfford,
      draftConnects,
      hasBuilding,
      t,
    });

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



  // ---------- чертежи ----------

  const saveBlueprint = async (name: string) => {
    setNamingBlueprint(false);
    try {
      const b = await repo.saveBlueprint(name.trim(), blueprintOf(p));
      setBlueprints((list) => [...list, b]);
      setMessage(t("blueprint.saved", { name: b.name }));
    } catch (e) {
      setMessage(t("blueprint.failed", { error: explain(e, t) }));
    }
  };

  const deleteBlueprint = async (b: Blueprint) => {
    setOpenBlueprint(null);
    setBlueprints((list) => list.filter((x) => x.id !== b.id));
    try {
      await repo.deleteBlueprint(b.id);
    } catch (e) {
      setMessage(t("blueprint.failed", { error: explain(e, t) }));
      void repo.blueprints().then(setBlueprints).catch(() => {});
    }
  };

  /** Снести склад и построить чертёж: сначала досохраняем правки, иначе они легли бы поверх. */
  const buildBlueprint = async (b: Blueprint) => {
    setBuildAsk(null);
    setOpenBlueprint(null);
    try {
      await flushPersist();
      await repo.buildBlueprint(p, b);
      map.draft.current = null;
      setVersion((v) => v + 1);
      forceRender((v) => v + 1);
      setMessage(t("blueprint.built", { name: b.name }));
    } catch (e) {
      setMessage(t("blueprint.failed", { error: explain(e, t) }));
      await resyncBase();
    }
  };

  /** Дронов не хватило на налёт или разведку — к их покупке на карте. */
  const buyDrones = () => {
    setSheet(null);
    pickTool("drones");
  };
  const pickTool = (id: ToolId) => {
    // апгрейд ничего не рисует на карте — только открывает свою модалку
    if (id === "upgrade" || id === "insurance" || id === "loan") {
      setModal(id);
      return;
    }
    setTool(id);
    toolRef.current = id;
    savePanels(panelOrder, hidden, id);
    map.draft.current = null;
    setModal(null);
  };

  const doUpgrade = async (kind: UpgradeKind) => {
    const level = p.levels[kind];
    if (level >= maxLevel(kind)) return;
    const cost = upgradeCost(level, kind);
    if (p.credits < cost) {
      setMessage(t("upgrade.cantAfford", { cost: fmt(cost) }));
      return;
    }
    try {
      const patch = await repo.upgrade(p, kind);
      if (patch.credits !== undefined) p.credits = patch.credits;
      p.levels = patch.levels ?? { ...p.levels, [kind]: level + 1 };
      setMessage(
        t("upgrade.done", { name: t(`upgrade.${kind}` as Key), level: shownLevel(p.levels[kind]) })
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
      busy={saving}
      onPlay={(stage) => void playCompetition(stage)}
      onWatch={(_stage, id) => void openReplay(id, p.name)}
    />
  );

  const summonButton = (
    <Button size="sm" onClick={() => (drones < 1 ? setNeedDrones(true) : setSummonRaid(true))}>
      {t("attacks.summon")}
    </Button>
  );

  const blueprintButton = (
    <Button size="sm" onClick={() => setNamingBlueprint(true)}>
      {t("blueprint.add")}
    </Button>
  );

  const blueprintsBody = (
    <BlueprintsPanel
      list={blueprints}
      player={p}
      onOpen={setOpenBlueprint}
      onBuild={setBuildAsk}
    />
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
      onBuyDrones={buyDrones}
    />
  );

  const SIDE_PANELS: Record<
    string,
    { title: Key; action?: ReactNode; body: ReactNode }
  > = {
    enemies: { title: "panel.enemies", body: enemiesBody },
    replays: { title: "panel.replays", action: summonButton, body: raidsBody },
    competitions: { title: "panel.competitions", body: competitionsBody },
    blueprints: { title: "panel.blueprints", action: blueprintButton, body: blueprintsBody },
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
  const draftOpen = drafting && draftRect && draftRect.w > 0 && draftRect.h > 0;
  // Тревога — только о чужих налётах: миссию игрок запускает сам, а
  // недоигранная висит в очереди до следующего «играть» в журнале миссий.
  const raidsIn = p.incoming.filter((a) => !a.competitionStage);
  const { tone: barTone, body: barBody } = statusBar({
    t,
    tool,
    // Те же числа, что и на самой кнопке: сырые vars не знают ни цены по
    // уровню, ни прокачанной дальности, и в строке оставались «{cost}».
    hint: t(activeTool.hint, toolVars(activeTool)),
    draft:
      draftOpen && draftRect
        ? {
            rect: draftRect,
            cells: draftCells,
            cost: draftCost,
            connects: draftConnects,
            afford: draftAfford,
          }
        : null,
    message,
    founded: p.founded,
    intact,
    raidsIn,
    commitDraft,
    cancelDraft: hand.onRightClick,
    pickRepair: () => pickTool("repair"),
    askRaze: () => setConfirmWipe(true),
    askFound: () => setNaming("found"),
    defend: (order) => void defend(order),
  });

  const accountLine = (
    <AccountMenu
      name={account?.name ?? null}
      email={account?.email ?? null}
      avatar={p.avatar}
      onAvatar={() => setModal("avatar")}
      onTelegram={() => setModal("telegram")}
      onRules={() => setShowRules(true)}
      onStats={() => setShowStats(true)}
      onRestart={() => setConfirmRestart(true)}
      onSignOut={account ? onSignOut : undefined}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:gap-3">
      {/* шапка телефона: наличные и доход в две строки плюс кнопки панелей */}
      <div className="order-1 flex shrink-0 items-center gap-2 lg:hidden">
        <IncomeLine p={p} className="flex-1" />
        {/* налёт — прямо в шапке, не открывая журнал */}
        <div className="shrink-0 whitespace-nowrap">{summonButton}</div>
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
        <IconButton label={t("panel.blueprints")} onClick={() => toggleSheet("blueprints")}>
          <DraftingCompass className="h-5 w-5" />
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
        <IncomeLine p={p} className="shrink-0" />
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

        На телефоне четыре в ряд и не шире 384 точек: двенадцать кнопок
        ложатся ровно в три ряда, без огрызка в последнем.
      */}
      <div
        style={{ "--tools": TOOLS.length } as CSSProperties}
        className="order-3 mx-auto grid w-full max-w-96 shrink-0 grid-cols-4 gap-1.5 lg:order-2 lg:mx-0 lg:max-w-none lg:gap-2 lg:[grid-template-columns:repeat(var(--tools),minmax(0,1fr))]"
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
            onDown={hand.onDown}
            onMove={hand.onMove}
            onUp={hand.onUp}
            onRightClick={hand.onRightClick}
            onLeave={hand.onLeave}
            cursor={map.dragDepot.current || map.dragGun.current ? "grabbing" : "crosshair"}
            zones={{ on: zones, onChange: setZones }}
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

      {namingBlueprint && (
        <NewBlueprintDialog
          plan={blueprintOf(p)}
          player={p}
          defaultName={t("blueprint.defaultName", { n: blueprints.length + 1 })}
          maxLength={MAX_BLUEPRINT_NAME}
          onClose={() => setNamingBlueprint(false)}
          onAdd={(name) => void saveBlueprint(name)}
        />
      )}

      {openBlueprint && (
        <BlueprintDialog
          blueprint={openBlueprint}
          player={p}
          onBuild={() => setBuildAsk(openBlueprint)}
          onDelete={() => void deleteBlueprint(openBlueprint)}
          onClose={() => setOpenBlueprint(null)}
        />
      )}

      {buildAsk && (
        <ConfirmDialog
          title={t("blueprint.confirm", { name: buildAsk.name })}
          subtitle={(() => {
            const { delta } = rebuildCost(p, buildAsk);
            return `${t("blueprint.hint")} ${t(delta > 0 ? "blueprint.pay" : "blueprint.refund", {
              cost: fmt(Math.abs(delta)),
            })}.`;
          })()}
          confirm={t("blueprint.build")}
          onCancel={() => setBuildAsk(null)}
          onConfirm={() => void buildBlueprint(buildAsk)}
        />
      )}

      {needDrones && (
        <NeedDrones
          what="raid"
          onClose={() => setNeedDrones(false)}
          onBuy={() => {
            setNeedDrones(false);
            buyDrones();
          }}
        />
      )}

      {summonRaidOpen && (
        <SummonRaidDialog
          // не больше, чем лежит на складе
          initial={Math.max(1, Math.min(suggestedRaid(), drones))}
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
        // Повтор открывается в том же окне, что и бой (BattleFrame).
        <Replay
          name={watching.name}
          replay={watching.replay}
          shareId={watching.id}
          onClose={() => setWatching(null)}
        />
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

      {modal === "telegram" && <TelegramDialog repo={repo} onClose={() => setModal(null)} />}
      {writeTo && (
        <MessageDialog
          enemy={writeTo}
          load={(email) => repo.messages(email)}
          onSend={(email, body) => repo.sendMessage(email, body)}
          onEdit={(id, body) => repo.editMessage(id, body)}
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
        {raidsBody}
      </Sheet>
      <Sheet
        open={sheet === "competitions"}
        title={t("panel.competitions")}
        onClose={() => setSheet(null)}
      >
        {competitionsBody}
      </Sheet>
      <Sheet
        open={sheet === "blueprints"}
        title={t("panel.blueprints")}
        onClose={() => setSheet(null)}
      >
        <div className="mb-3 flex justify-end">{blueprintButton}</div>
        {blueprintsBody}
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

