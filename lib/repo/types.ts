// Хранилище состояния игрока: что Lobby может у него попросить. Одна и та
// же игра работает поверх localStorage (local.ts) и поверх Supabase
// (cloud.ts) — Lobby знает только этот интерфейс.

import type { Gun } from "../base";
import type { Avatar } from "../avatar";
import type { AttackOrder, AttackReport, Message, RaidLog, WavePlan } from "../attack";
import type { ReplayData } from "@/components/battle/Replay";
import type { BattleResult } from "../engine";
import type { UpgradeKind } from "../economy";
import type { Player } from "../player";
import type { Blueprint } from "../blueprint";

export interface Income {
  credits: number;
  days: number;
  /** Что ушло с отгрузкой: склад продаёт остатки раз в сутки. */
  sold?: { drones: number } | null;
}

export interface Repo {
  mode: "local" | "cloud";
  /** Профиль плюс доход, начисленный при входе. */
  load(): Promise<{ player: Player; income: Income; reports: AttackReport[] }>;
  /**
   * Наступили новые лондонские сутки, а вкладка открыта с вечера: начислить
   * смену (если ещё не начислена) и подтянуть склад — отгрузка увезла дронов.
   */
  collectShift(p: Player): Promise<Income>;
  syncAttacks(): Promise<{
    incoming: AttackOrder[];
    reports: AttackReport[];
    credits?: number;
    stats?: Player["stats"];
    loan?: number;
    loanDue?: number | null;
  }>;
  /** Склад после правок в лобби. Возвращает авторитетные цифры сервера. */
  saveBase(p: Player): Promise<Partial<Player>>;
  /** Список добавленных по e-mail соперников и их текущее состояние. */
  saveEnemies(p: Player): Promise<void>;
  /**
   * Как называются склады по этим адресам. Врага зовут именем его склада,
   * а не выдумкой клиента, поэтому имя всегда спрашиваем у сервера.
   */
  baseNames(emails: string[]): Promise<Map<string, { name: string; avatar: Avatar; level: number }>>;
  /** Сменить своё лицо: номер готового, адрес своей картинки или null. */
  setAvatar(p: Player, value: Avatar): Promise<void>;
  /**
   * Вылет разведки одной операцией: сервер одновременно списывает самолёты
   * и отдаёт карту, чтобы карту нельзя было запросить бесплатно.
   */
  launchScout(
    p: Player,
    email: string,
    n: number
  ): Promise<{ cells: Uint8Array; guns: Gun[]; gunLevel: number }>;
  /**
   * Заносит нас в список соперника: знакомство должно быть взаимным, иначе
   * ему нечем ответить. Возвращает его настоящее имя склада.
   */
  addRival(email: string): Promise<string | null>;
  /** Взять заём: деньги сразу, долг с процентом и срок — на сутки. */
  takeLoan(p: Player, amount: number): Promise<void>;
  /** Отдать заём целиком и досрочно. */
  repayLoan(p: Player): Promise<void>;
  /**
   * Что на чужом складе изменилось с нашей прошлой разведки. Отдаются
   * квадраты, а не карта: знать чужую раскладку клиенту не положено.
   */
  stalePatches(email: string, snapCells: string): Promise<number[]>;
  /** Апгрейд класса на уровень выше. Цену считает сервер. */
  upgrade(p: Player, kind: UpgradeKind): Promise<Partial<Player>>;
  /**
   * Перечитывает склад с сервера. Нужен, когда сервер отверг правку: значит
   * наша копия разъехалась с его, и правда — на сервере.
   */
  reloadBase(p: Player): Promise<void>;
  /** Докупка в контейнеры: дроны или шары, счёт в штуках. */
  buyDepot(p: Player, amount: number): Promise<Partial<Player>>;
  /**
   * Состязание на свой склад: сервер ставит его в очередь как налёт на
   * самого себя, и бой идёт той же дорогой, что живой. Возвращает id налёта.
   */
  queueCompetition(
    stage: number,
    waves: WavePlan[],
    seed: number,
    droneLevel: number
  ): Promise<string>;
  /**
   * Налёт волнами. Дронов снимает сервер со своей копии склада, надбавку за
   * начинку списывает кредитами, обратно приходит id и новый склад.
   */
  sendAttack(
    p: Player,
    targetEmail: string,
    waves: WavePlan[],
    seed: number,
    opener?: string
  ): Promise<string | null>;
  /** Весь разговор с этим соперником, старые сверху. */
  messages(email: string): Promise<Message[]>;
  /** Пишет сопернику. Отдаёт ошибку строкой, если писать нельзя. */
  sendMessage(email: string, body: string): Promise<string | null>;
  /** Правит своё сообщение. Отдаёт ошибку строкой, если нельзя. */
  editMessage(id: string, body: string): Promise<string | null>;
  /** Отмечает прочитанным всё, что пришло от этого соперника. */
  readMessages(email: string): Promise<void>;
  /** Язык игры — на нём бот пишет в телеграм. */
  setLocale(locale: string): Promise<void>;
  /** Сохранённые чертежи, старые сверху. */
  blueprints(): Promise<Blueprint[]>;
  /** Сохранить раскладку под именем. Денег не берёт. */
  saveBlueprint(name: string, plan: Pick<Blueprint, "cells" | "guns" | "depots">): Promise<Blueprint>;
  deleteBlueprint(id: string): Promise<void>;
  /** Снести склад и построить чертёж на его месте; p обновляется. */
  buildBlueprint(p: Player, b: Blueprint): Promise<void>;
  /** Продать контейнер, который уже снят с p.depots. Вернёт кошелёк сервера. */
  sellDepot(p: Player, x: number, y: number): Promise<Partial<Player>>;
  /** Сколько непрочитанного и от кого: по этому в списке горит счётчик. */
  unread(): Promise<Record<string, number>>;
  /** Код привязки телеграма и то, привязан ли он уже. */
  telegram(): Promise<{ code: string; linked: boolean } | null>;
  telegramUnlink(): Promise<void>;
  acknowledgeReport(id: string): Promise<void>;
  /** Журнал боёв — и своих налётов, и чужих: из него открываются повторы. */
  raidLog(): Promise<RaidLog[]>;
  /** Убрать бой из своего журнала. У второй стороны он остаётся. */
  hideRaid(id: string): Promise<void>;
  /** Повтор одного боя целиком: карта, пушки, запись действий. */
  replayOf(id: string): Promise<ReplayData | null>;
  /** Переименование склада — отдельная операция, карты не касается. */
  rename(p: Player, name: string): Promise<void>;
  applyBattle(
    p: Player,
    result: BattleResult,
    attackId?: string,
    /** Запись боя: её увидит нападавший в отчёте о налёте. */
    trace?: string
  ): Promise<Partial<Player>>;
  wipe(p: Player): Promise<Player>;
  /** Начать сначала: пустой стартовый склад, стартовые деньги, всё с нуля. */
  restart(p: Player): Promise<Player>;
}
