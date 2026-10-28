// Игра без сервера: всё в localStorage этого браузера.

import { CELLS, decodeCells, sanitizeGuns, G_BASE, decodeRle } from "../base";
import { LOAN_HOURS, maxLevel, STARTER_CELLS, loanDebt, upgradeCost, type UpgradeKind } from "../economy";
import { normalizeAvatarForStorage, type Avatar } from "../avatar";
import type { RaidLog } from "../attack";
import { collectIncome as localIncome, load as localLoad, newPlayer, save as localSave, wipe as localWipe, type Player } from "../player";
import { takeDrones } from "../enemy";
import { MAX_BLUEPRINTS, rebuildCost, type Blueprint } from "../blueprint";
import type { Income, Repo } from "./types";

const BLUEPRINTS_KEY = "wb.blueprints";

export class LocalRepo implements Repo {
  mode = "local" as const;

  async load() {
    const player = localLoad();
    const income = localIncome(player, Date.now()) as Income;
    localSave(player);
    return { player, income, reports: [] };
  }

  async collectShift(p: Player) {
    const income = localIncome(p, Date.now()) as Income;
    localSave(p);
    return income;
  }

  async beginBattle() {
    // локально отгрузку проводит сама вкладка, и в бою она уже ждёт
  }

  async syncAttacks() {
    return { incoming: [], reports: [] };
  }

  async saveBase(p: Player) {
    p.guns = sanitizeGuns(p.guns);
    localSave(p);
    return {};
  }

  async saveEnemies(p: Player) {
    localSave(p);
  }

  async baseNames(_emails: string[]) {
    return new Map<string, { name: string; avatar: Avatar; level: number }>();
  }

  async setAvatar(p: Player, value: Avatar) {
    p.avatar = normalizeAvatarForStorage(value);
    localSave(p);
  }

  async launchScout(p: Player, email: string, n: number) {
    takeDrones(p.depots, n);
    localSave(p);
    const enemy = p.enemies.find((item) => item.email.toLowerCase() === email.toLowerCase());
    return {
      cells: enemy ? decodeCells(enemy.cells) : new Uint8Array(CELLS),
      guns: enemy?.guns ?? [],
      gunLevel: 1,
    };
  }

  async reloadBase() {
    // локальная копия и есть единственная
  }

  async addRival(_email: string) {
    return null; // локально соперник живёт только у нас
  }

  async stalePatches() {
    return [] as number[];
  }

  async takeLoan(p: Player, amount: number) {
    p.credits += amount;
    p.loan = loanDebt(amount);
    p.loanDue = Date.now() + LOAN_HOURS * 3600_000;
    localSave(p);
  }

  async repayLoan(p: Player) {
    if (p.credits < p.loan) throw new Error("not enough credits");
    p.credits -= p.loan;
    p.loan = 0;
    p.loanDue = null;
    localSave(p);
  }

  async upgrade(p: Player, kind: UpgradeKind) {
    if (p.levels[kind] >= maxLevel(kind)) throw new Error("already at max level");
    const cost = upgradeCost(p.levels[kind], kind);
    if (p.credits < cost) throw new Error("not enough credits");
    p.credits -= cost;
    p.levels = { ...p.levels, [kind]: p.levels[kind] + 1 };
    localSave(p);
    return { credits: p.credits, levels: p.levels };
  }

  async buyDepot(p: Player) {
    localSave(p);
    return {};
  }

  async sendAttack(): Promise<string | null> {
    throw new Error("not authenticated");
  }

  async queueCompetition(): Promise<string> {
    // Без входа сервера нет: лобби ставит состязание в очередь у себя.
    throw new Error("offline");
  }

  // Локальная игра идёт без сервера, а разговаривать не с кем: соперники
  // тут выдуманные. Отдаём пустоту, чтобы окно открывалось и не падало.
  async messages() {
    return [];
  }

  async sendMessage() {
    return "not authenticated";
  }

  async editMessage() {
    return "not authenticated";
  }

  async readMessages() {}

  // без сервера и бота нет — язык сообщать некому
  async setLocale() {}

  // Без входа чертежи живут в браузере, как и сам склад.
  private readBlueprints(): Blueprint[] {
    try {
      const list = JSON.parse(window.localStorage.getItem(BLUEPRINTS_KEY) ?? "[]") as Blueprint[];
      // чертежи, сохранённые до контейнеров, — без них
      return list.map((b) => ({ ...b, depots: b.depots ?? [] }));
    } catch {
      return [];
    }
  }

  private writeBlueprints(list: Blueprint[]) {
    try {
      window.localStorage.setItem(BLUEPRINTS_KEY, JSON.stringify(list));
    } catch {
      // не сохранилось — живём до конца сессии
    }
  }

  async blueprints() {
    return this.readBlueprints();
  }

  async saveBlueprint(name: string, plan: Pick<Blueprint, "cells" | "guns" | "depots">) {
    const list = this.readBlueprints();
    if (list.length >= MAX_BLUEPRINTS) throw new Error("too many blueprints");
    const b: Blueprint = { id: `${Date.now().toString(36)}`, name, ...plan, createdAt: Date.now() };
    this.writeBlueprints([...list, b]);
    return b;
  }

  async deleteBlueprint(id: string) {
    this.writeBlueprints(this.readBlueprints().filter((b) => b.id !== id));
  }

  async sellDepot(p: Player) {
    localSave(p);
    return {};
  }

  async buildBlueprint(p: Player, b: Blueprint) {
    const { delta } = rebuildCost(p, b);
    if (p.credits < delta) throw new Error("not enough credits");
    const cells = decodeRle(b.cells);
    p.credits -= delta;
    p.cells = cells;
    p.guns = b.guns.map((g) => ({ ...g }));
    p.depots = b.depots.map((d) => ({ ...d }));
    let intact = 0;
    for (const v of cells) if (v === G_BASE) intact++;
    if (intact >= STARTER_CELLS) p.founded = true;
    localSave(p);
  }

  async unread() {
    return {};
  }

  async telegram() {
    return null;
  }

  async telegramUnlink() {}

  async acknowledgeReport() {}

  async raidLog() {
    return [] as RaidLog[];
  }

  async hideRaid(_id: string) {}

  async replayOf(_id: string) {
    return null;
  }

  async applyBattle(p: Player) {
    localSave(p);
    return {};
  }

  async rename(p: Player, _name: string) {
    localSave(p);
  }

  async wipe(p: Player) {
    const fresh = localWipe(p);
    localSave(fresh);
    return fresh;
  }

  async restart(p: Player) {
    const fresh = newPlayer();
    fresh.name = p.name;
    fresh.enemies = p.enemies;
    fresh.founded = p.founded;
    localSave(fresh);
    return fresh;
  }
}
