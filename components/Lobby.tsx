"use client";

// Лобби: карта склада с инструментами, боковые панели и все окна. Само оно
// только собирает части: склад и его запись — useBaseSync, стройка —
// mapActions, кошелёк — baseActions, соперники — rivalActions, бой —
// battleFlow, чертежи — useBlueprints.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { countFreeCells, countKind, decodeRle, droneCount, fogPatches, normRect } from "@/lib/base";
import { LOAN_MIN, STARTER_SIDE, dronePrice, fmt } from "@/lib/economy";
import type { AttackOrder, AttackReport } from "@/lib/attack";
import { MAX_BASE_NAME, burntCells, intactCells, isDoomed, type Player } from "@/lib/player";
import { titleCompetitions } from "@/lib/competition";
import { getRepo } from "@/lib/repo";
import type { Enemy } from "@/lib/enemy";
import { draftPlan } from "@/lib/build";
import { MAX_BLUEPRINT_NAME, blueprintOf, rebuildCost } from "@/lib/blueprint";
import { postRaidComment } from "@/lib/comments";
import { type View } from "@/lib/render";
import { useSettings, useT } from "@/lib/i18n";
import { explain } from "@/lib/errors";
import type { Key } from "@/lib/i18n/dict";
import { DraftingCompass, Trophy } from "lucide-react";
import type { Account } from "./AuthGate";
import Enemies, { EnemyProfile } from "./lobby/Enemies";
import Battle from "./battle/Battle";
import Replay from "./battle/Replay";
import Scout from "./scout/Scout";
import CompetitionsPanel from "./lobby/CompetitionsPanel";
import { useJournal } from "./lobby/useJournal";
import { mapHandlers, useMapRefs } from "./lobby/mapInput";
import { drawLobbyOverlay } from "./lobby/drawLobby";
import { statusBar } from "./lobby/statusBar";
import TelegramDialog from "./lobby/TelegramDialog";
import SummonRaidDialog from "./lobby/SummonRaidDialog";
import NeedDrones from "./lobby/NeedDrones";
import IncomeLine from "./lobby/IncomeLine";
import BlueprintsPanel, { BlueprintDialog, NewBlueprintDialog } from "./lobby/BlueprintsPanel";
import AttackReportDialog from "./lobby/AttackReportDialog";
import MessageDialog from "./lobby/MessageDialog";
import BaseName from "./lobby/BaseName";
import { useAttacks } from "./lobby/useAttacks";
import { InsuranceDialog, LoanDialog, UpgradeDialog } from "./lobby/MoneyDialogs";
import RaidsPanel, { StatsPanel } from "./lobby/RaidsPanel";
import AvatarPicker from "./lobby/AvatarPicker";
import { TOOLS, type ModalId, type SheetId, type ToolId } from "./lobby/tools";
import { toolPrice, toolVars } from "./lobby/toolNumbers";
import { useBaseSync } from "./lobby/useBaseSync";
import { usePanels } from "./lobby/usePanels";
import { useBlueprints } from "./lobby/useBlueprints";
import { useTestRaids } from "./lobby/useTestRaids";
import { incomeMessage, useShift } from "./lobby/useShift";
import { mapActions } from "./lobby/mapActions";
import { baseActions } from "./lobby/baseActions";
import { rivalActions, suggestedRaid, type ScoutRun } from "./lobby/rivalActions";
import { battleFlow } from "./lobby/battleFlow";
import { DoomedScreen, FoundPanel } from "./lobby/BasePanels";
import MenuSheet from "./lobby/MenuSheet";
import { PostRaidCommentModal, RaidOpenerModal } from "./lobby/RaidCommentModals";
import { useZones } from "./ZonesToggle";
import Rules from "./Rules";
import MapCanvas from "./MapCanvas";
import AccountMenu from "./AccountMenu";
import {
  Button,
  ConfirmDialog,
  IconButton,
  IconMenu,
  IconTarget,
  IconUsers,
  MESSAGE_MS,
  Modal,
  NameDialog,
  Panel,
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
  const [message, setMessage] = useState<string | null>(null);
  const { version, core } = useBaseSync(repo, playerRef, t, setMessage);
  const { tool, chooseTool, panelOrder, hidden, dragPanel, setDragPanel, togglePanel, movePanel } =
    usePanels();
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
  const [ready, setReady] = useState(false);
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
  /** Журнал боёв: и свои налёты, и те, где отбивался. */
  const { raids, loadRaids, hideRaid, openReplay, watching, setWatching } = useJournal(
    repo,
    t,
    setMessage
  );
  /** Карточка врага, открытая по нику из журнала боёв. */
  const [foeCard, setFoeCard] = useState<Enemy | null>(null);
  const [scout, setScout] = useState<ScoutRun | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reports, setReports] = useState<AttackReport[]>([]);
  const toggleSheet = (id: SheetId) => setSheet((cur) => (cur === id ? null : id));

  /** Руки на карте: рамка, перетаскивание, ценники — всё в refs. */
  const map = useMapRefs();
  const blueprints = useBlueprints(core, playerRef, ready, () => {
    map.draft.current = null;
  });

  /**
   * Опрос сервера и очередь налётов: обе заботы живут в своём хуке, а лобби
   * только даёт ему, чем перерисоваться и куда сказать.
   */
  const attacks = useAttacks({
    repo,
    player: playerRef,
    t: tRef,
    refresh: core.rerender,
    refreshMap: core.refreshMap,
    say: setMessage,
    setReports,
    setNow,
    setUnread,
    reloadBase: core.resyncBase,
    loadRaids,
  });

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
        if (income.credits > 0) setMessage(incomeMessage(t, income, player.levels.drones));
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

  useTestRaids(core, playerRef, ready);
  // Полночь по Лондону при открытой вкладке: смена приходит без перезагрузки.
  // В бою и на разведке ждём — их исход пишется поверх нынешнего склада.
  useShift(core, playerRef, ready && !battle && !scout);

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

  const base = baseActions(core, playerRef, p);
  const rivals = rivalActions(core, p, {
    drones,
    droneCost,
    loadRaids,
    startScout: setScout,
  });
  const flow = battleFlow(core, p, {
    saving,
    setSaving,
    setBattle,
    setOpenerGate,
    setPostCommentRaid,
    setScout,
    closeSheet: () => setSheet(null),
    attacks,
    loadRaids,
  });

  // ---------- бой и разведка ----------

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
        missionBest={battle.competitionStage ? p.competitionBest[battle.competitionStage] : undefined}
        onFinish={(o) => flow.finishBattle(battle, o)}
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
        onFinish={(o) => flow.finishScout(scout, o)}
      />
    );
  }

  // ---------- инструменты и карта ----------

  // Рамкой работают и «Площадь», и «Ремонт»: выделил, подправил, утвердил.
  // Разница только в том, что считается внутри рамки и почём.
  const drafting = tool === "area" || tool === "repair" || tool === "scrap";
  const draft = map.draft.current;
  const draftRect = draft ? normRect(draft) : null;
  // Сколько клеток, почём и можно ли — считает стройка; лобби только
  // рисует по этому ценник и решает, красить ли рамку красным.
  const plan = draftPlan(p, drafting ? tool : "area", draftRect, hasBuilding);
  const draftAfford = plan.cost <= p.credits;

  const build = mapActions(core, p, map, {
    tool,
    draftRect,
    draftCells: plan.cells,
    hasBuilding,
  });

  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __lobby: unknown }).__lobby = {
      player: p,
      tool,
      dragDepot: map.dragDepot,
      moveDepot: build.moveDepot,
    };
  }

  const hand = mapHandlers(map, {
    p,
    tool,
    drafting,
    rerender: core.rerender,
    ...build,
  });

  const overlay = (ctx: CanvasRenderingContext2D, frameNow: number, view?: View) =>
    drawLobbyOverlay(ctx, frameNow, view, {
      p,
      tool,
      m: map,
      zones,
      draftAfford,
      draftConnects: plan.connects,
      hasBuilding,
      t,
    });

  // ---------- экраны ----------

  if (isDoomed(p, intact)) {
    return <DoomedScreen onRestart={() => void base.wipe("doomed.restarted", "doomed.failed")} />;
  }

  const pickTool = (id: ToolId) => {
    // апгрейд ничего не рисует на карте — только открывает свою модалку
    if (id === "upgrade" || id === "insurance" || id === "loan") {
      setModal(id);
      return;
    }
    chooseTool(id);
    map.draft.current = null;
    setModal(null);
  };

  /** Дронов не хватило на налёт или разведку — к их покупке на карте. */
  const buyDrones = () => {
    setSheet(null);
    pickTool("drones");
  };

  const renameBase = (name: string) => {
    setNaming(null);
    void base.rename(name);
  };

  const openChat = (enemy: Enemy) => {
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
  };

  // ---------- содержимое панелей ----------
  // Одни и те же куски разметки идут и в боковую колонку (десктоп),
  // и в шторки (телефон), поэтому собраны здесь один раз.

  const activeTool = TOOLS.find((item) => item.id === tool) ?? TOOLS[0];

  // Журналы собираем один раз: они идут и в боковую колонку, и в шторку.
  // Состязания в журнал боёв не попадают: у них свой, по номерам.
  const raidsBody = (
    <RaidsPanel
      incoming={p.incoming.filter((a) => !a.competitionStage)}
      raids={raids}
      onDefend={(order) => void flow.defend(order)}
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
      onPlay={(stage) => void flow.playCompetition(stage)}
      onWatch={(_stage, id) => void openReplay(id, p.name)}
    />
  );

  const summonButton = (
    <Button size="sm" onClick={() => (drones < 1 ? setNeedDrones(true) : setSummonRaid(true))}>
      {t("attacks.summon")}
    </Button>
  );

  const blueprintButton = (
    <Button size="sm" onClick={() => blueprints.setNaming(true)}>
      {t("blueprint.add")}
    </Button>
  );

  const blueprintsBody = (
    <BlueprintsPanel
      list={blueprints.list}
      player={p}
      onOpen={blueprints.setOpen}
      onBuild={blueprints.setBuildAsk}
    />
  );

  const enemiesBody = (
    <Enemies
      onRemove={rivals.remove}
      enemies={p.enemies}
      drones={drones}
      credits={p.credits}
      droneCost={droneCost}
      onAdd={rivals.add}
      onRaid={rivals.raid}
      onScout={rivals.scout}
      fetchStale={fetchStale}
      onWrite={openChat}
      unread={unread}
      onChanged={core.rerender}
      onBuyDrones={buyDrones}
    />
  );

  const SIDE_PANELS: Record<string, { title: Key; action?: ReactNode; body: ReactNode }> = {
    enemies: { title: "panel.enemies", body: enemiesBody },
    replays: { title: "panel.replays", action: summonButton, body: raidsBody },
    competitions: { title: "panel.competitions", body: competitionsBody },
    blueprints: { title: "panel.blueprints", action: blueprintButton, body: blueprintsBody },
  };

  const foundBody = <FoundPanel intact={intact} onFound={() => setNaming("found")} />;

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
    hint: t(activeTool.hint, toolVars(p.levels, activeTool)),
    draft:
      draftOpen && draftRect
        ? {
            rect: draftRect,
            cells: plan.cells,
            cost: plan.cost,
            connects: plan.connects,
            afford: draftAfford,
          }
        : null,
    message,
    founded: p.founded,
    intact,
    raidsIn,
    commitDraft: build.commitDraft,
    cancelDraft: hand.onRightClick,
    pickRepair: () => pickTool("repair"),
    askRaze: () => setConfirmWipe(true),
    askFound: () => setNaming("found"),
    defend: (order) => void flow.defend(order),
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
          onCommit={renameBase}
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
              cost: toolPrice(p.levels, item),
            })}
            hint={t(item.hint, toolVars(p.levels, item))}
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
          onConfirm={() => {
            setConfirmRestart(false);
            void base.restart(() => {
              attacks.forget();
              setReports([]);
            });
          }}
        />
      )}

      {confirmWipe && (
        <ConfirmDialog
          title={t("burnt.razeTitle")}
          subtitle={t("burnt.razeHint", { side: STARTER_SIDE })}
          confirm={t("burnt.raze")}
          onCancel={() => setConfirmWipe(false)}
          onConfirm={() => {
            setConfirmWipe(false);
            void base.wipe("burnt.razed", "burnt.razeFailed");
          }}
        />
      )}

      {blueprints.naming && (
        <NewBlueprintDialog
          plan={blueprintOf(p)}
          player={p}
          defaultName={t("blueprint.defaultName", { n: blueprints.list.length + 1 })}
          maxLength={MAX_BLUEPRINT_NAME}
          onClose={() => blueprints.setNaming(false)}
          onAdd={(name) => void blueprints.save(name)}
        />
      )}

      {blueprints.open && (
        <BlueprintDialog
          blueprint={blueprints.open}
          player={p}
          onBuild={() => blueprints.setBuildAsk(blueprints.open)}
          onDelete={() => blueprints.open && void blueprints.remove(blueprints.open)}
          onClose={() => blueprints.setOpen(null)}
        />
      )}

      {blueprints.buildAsk && (
        <ConfirmDialog
          title={t("blueprint.confirm", { name: blueprints.buildAsk.name })}
          subtitle={(() => {
            const { delta } = rebuildCost(p, blueprints.buildAsk);
            return `${t("blueprint.hint")} ${t(delta > 0 ? "blueprint.pay" : "blueprint.refund", {
              cost: fmt(Math.abs(delta)),
            })}.`;
          })()}
          confirm={t("blueprint.build")}
          onCancel={() => blueprints.setBuildAsk(null)}
          onConfirm={() => blueprints.buildAsk && void blueprints.build(blueprints.buildAsk)}
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
          initial={Math.max(1, Math.min(suggestedRaid(p, intact), drones))}
          enemies={p.enemies}
          drones={drones}
          credits={p.credits}
          droneCost={droneCost}
          onCancel={() => setSummonRaid(false)}
          onSend={async (enemy, waves, comment) => {
            const err = await rivals.raid(enemy, waves, comment);
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
            rivals.remove(foeCard);
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
          onDone={(reply) => void flow.afterOpener(openerGate, reply)}
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
          onSubmit={(name) => void base.found(name, intact, () => setNaming(null))}
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
          google={account?.google ?? null}
          onPick={async (value) => {
            try {
              await repo.setAvatar(p, value);
              core.rerender();
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
          onTake={async () => {
            if (await base.takeLoan(loanAmount)) setModal(null);
          }}
          onRepay={async () => {
            if (await base.repayLoan()) setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "insurance" && (
        <InsuranceDialog player={p} onUpgrade={base.upgrade} onClose={() => setModal(null)} />
      )}
      {modal === "upgrade" && (
        <UpgradeDialog player={p} onUpgrade={base.upgrade} onClose={() => setModal(null)} />
      )}

      <Sheet
        open={sheet === "attacks"}
        title={t("panel.replays")}
        action={summonButton}
        onClose={() => setSheet(null)}
      >
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
        <MenuSheet
          p={p}
          account={account}
          onRename={renameBase}
          onAvatar={() => {
            setSheet(null);
            setModal("avatar");
          }}
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
      </Sheet>
    </div>
  );
}
