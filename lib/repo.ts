// Хранилище состояния игрока. Одна и та же игра работает поверх localStorage
// и поверх Supabase — Lobby знает только этот интерфейс.

import { type DroneKind, CELLS, type Depot, decodeCells, encodeRle, regrowGround, type Gun } from "./base";

import { CREDITS_START, MAX_LEVEL, upgradeCost } from "./economy";
import type { AttackOrder, AttackReport, Pattern } from "./attack";
import type { BattleResult } from "./engine";
import type { UpgradeKind } from "./economy";
import {
  collectIncome as localIncome,
  insure,
  load as localLoad,
  newPlayer,
  save as localSave,
  wipe as localWipe,
  type Player,
} from "./player";
import { cloudEnabled, supabase } from "./supabase";

export interface Income {
  credits: number;
  days: number;
}

export interface Repo {
  mode: "local" | "cloud";
  /** Профиль плюс доход, начисленный при входе. */
  load(): Promise<{ player: Player; income: Income; reports: AttackReport[] }>;
  syncAttacks(): Promise<{
    incoming: AttackOrder[];
    reports: AttackReport[];
    credits?: number;
    stats?: Player["stats"];
  }>;
  /** Склад после правок в лобби. Возвращает авторитетные цифры сервера. */
  saveBase(p: Player): Promise<Partial<Player>>;
  /** Список добавленных по e-mail соперников и их текущее состояние. */
  saveEnemies(p: Player): Promise<void>;
  /**
   * Как называются склады по этим адресам. Врага зовут именем его склада,
   * а не выдумкой клиента, поэтому имя всегда спрашиваем у сервера.
   */
  baseNames(emails: string[]): Promise<Map<string, string>>;
  /** Карта противника для разведывательного вылета — с уровнем его пушек. */
  enemyBase(email: string): Promise<{ cells: Uint8Array; guns: Gun[]; gunLevel: number }>;
  /** Апгрейд класса на уровень выше. Цену считает сервер. */
  upgrade(p: Player, kind: UpgradeKind): Promise<Partial<Player>>;
  /** Вылет разведки: разведчики уходят из своих контейнеров. */
  spendScouts(p: Player, n: number): Promise<void>;
  buyDrones(p: Player, amount: number, kind?: DroneKind): Promise<Partial<Player>>;
  sendAttack(
    p: Player,
    targetEmail: string,
    drones: number,
    pattern: Pattern,
    direction: number,
    seed: number
  ): Promise<void>;
  acknowledgeReport(id: string): Promise<void>;
  /** Переименование склада — отдельная операция, карты не касается. */
  rename(p: Player, name: string): Promise<void>;
  applyBattle(p: Player, result: BattleResult, attackId?: string): Promise<Partial<Player>>;
  wipe(p: Player): Promise<Player>;
}

// ---------- локально ----------

class LocalRepo implements Repo {
  mode = "local" as const;

  async load() {
    const player = localLoad();
    const income = localIncome(player, Date.now());
    insure(player);
    localSave(player);
    return { player, income, reports: [] };
  }

  async syncAttacks() {
    return { incoming: [], reports: [] };
  }

  async saveBase(p: Player) {
    localSave(p);
    return {};
  }

  async saveEnemies(p: Player) {
    localSave(p);
  }

  async baseNames(_emails: string[]) {
    return new Map<string, string>();
  }

  async spendScouts(p: Player, _n: number) {
    localSave(p);
  }

  async enemyBase(_email: string) {
    // локально настоящих противников нет — карту берём из сгенерированного бота
    return { cells: new Uint8Array(CELLS), guns: [] as Gun[], gunLevel: 1 };
  }

  async upgrade(p: Player, kind: UpgradeKind) {
    if (p.levels[kind] >= MAX_LEVEL) throw new Error("already at max level");
    const cost = upgradeCost(p.levels[kind]);
    if (p.credits < cost) throw new Error("not enough credits");
    p.credits -= cost;
    p.levels = { ...p.levels, [kind]: p.levels[kind] + 1 };
    localSave(p);
    return { credits: p.credits, levels: p.levels };
  }

  async buyDrones(p: Player, _amount: number, _kind?: DroneKind) {
    localSave(p);
    return {};
  }

  async sendAttack() {
    throw new Error("Атаки на друзей доступны после входа через Google");
  }

  async acknowledgeReport() {}

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
}

// ---------- Supabase ----------

interface ProfileRow {
  base_name: string | null;
  credits: number;
  founded: boolean;
  last_income_at: string;
  created_at: string;
  // в базе может лежать статистика более старого образца, чем знает клиент
  stats: Partial<Player["stats"]> | null;
  enemies: Player["enemies"] | null;
  levels: Partial<Player["levels"]> | null;
}

/** collect_income отдаёт именно credits_added — имя колонки, а не поля Income. */
interface IncomeRow {
  credits_added: number;
  days: number;
}

interface BaseRow {
  cells: string; // приходит как \x… hex
  guns: Gun[];
  drone_cells: Depot[];
}

interface IncomingAttackRow {
  id: string;
  from_name: string;
  created_at: string;
  activated_at: string | null;
  drones: number;
  pattern: Pattern;
  direction: number;
  seed: number;
  drone_level: number | null;
}

interface AttackReportRow {
  id: string;
  target_name: string;
  resolved_at: string;
  result: BattleResult;
  loot: number;
  destroyed: boolean;
}

/** Postgres отдаёт bytea в hex-виде «\x00ff…». */
function fromPgBytea(text: string): Uint8Array {
  const out = new Uint8Array(CELLS);
  if (!text) return out;
  if (!text.startsWith("\\x")) return regrowGround(decodeCells(text));
  const hex = text.slice(2);
  for (let i = 0; i < CELLS && i * 2 + 1 < hex.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return regrowGround(out);
}

class CloudRepo implements Repo {
  mode = "cloud" as const;

  private db() {
    const c = supabase();
    if (!c) throw new Error("Supabase не настроен");
    return c;
  }

  async load() {
    const db = this.db();
    await db.rpc("ensure_player");
    const inc = await db.rpc("collect_income");
    if (inc.error) throw inc.error;

    const [{ data: prof, error: e1 }, { data: base, error: e2 }, attacks] = await Promise.all([
      db.from("profiles").select("*").single(),
      db.from("bases").select("cells, guns, drone_cells").single(),
      this.syncAttacks(),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const row = prof as ProfileRow;
    const b = base as BaseRow;
    const fresh = newPlayer();
    const player: Player = {
      ...fresh,
      name: row.base_name ?? "",
      credits: attacks.credits ?? row.credits,
      founded: row.founded,
      lastIncomeAt: Date.parse(row.last_income_at),
      createdAt: Date.parse(row.created_at),
      // недостающие счётчики берём нулями: иначе fmt() падает на undefined
      stats: { ...fresh.stats, ...(row.stats ?? {}), ...(attacks.stats ?? {}) },
      levels: { ...fresh.levels, ...(row.levels ?? {}) },
      cells: fromPgBytea(b.cells),
      guns: b.guns ?? [],
      depots: b.drone_cells ?? [],
      incoming: attacks.incoming,
      enemies: row.enemies ?? [],
    };

    // склад врага могли переименовать — подтягиваем актуальные имена
    try {
      const names = await this.baseNames(player.enemies.map((e) => e.email));
      for (const e of player.enemies) {
        const fresh = names.get(e.email.toLowerCase());
        if (fresh && fresh !== e.name) e.name = fresh;
      }
    } catch {
      // имена — украшение списка, из-за них вход в игру ломаться не должен
    }

    const first = (inc.data as IncomeRow[] | null)?.[0];
    return {
      player,
      income: { credits: first?.credits_added ?? 0, days: first?.days ?? 0 },
      reports: attacks.reports,
    };
  }

  async syncAttacks() {
    const db = this.db();
    const [incomingResult, reportResult, profileResult] = await Promise.all([
      db.rpc("pending_attacks"),
      db.rpc("attack_reports"),
      db.from("profiles").select("credits, stats").single(),
    ]);
    if (incomingResult.error) throw incomingResult.error;
    if (reportResult.error) throw reportResult.error;
    if (profileResult.error) throw profileResult.error;

    const incoming = ((incomingResult.data ?? []) as IncomingAttackRow[]).map((row) => ({
      id: row.id,
      from: row.from_name,
      createdAt: Date.parse(row.created_at),
      activatedAt: row.activated_at ? Date.parse(row.activated_at) : null,
      drones: row.drones,
      pattern: row.pattern,
      direction: row.direction,
      seed: row.seed,
      // дроны летят на том уровне, до какого их довёл нападающий
      droneLevel: row.drone_level ?? 1,
      remote: true,
    }));
    const reports = ((reportResult.data ?? []) as AttackReportRow[]).map((row) => ({
      id: row.id,
      target: row.target_name,
      resolvedAt: Date.parse(row.resolved_at),
      result: row.result,
      loot: row.loot,
      destroyed: row.destroyed,
    }));
    return {
      incoming,
      reports,
      credits: profileResult.data.credits as number,
      stats: profileResult.data.stats as Player["stats"],
    };
  }

  async saveBase(p: Player) {
    // Список врагов сюда не подмешиваем: он меняется втрое реже карты, а
    // писался вторым запросом на каждую поставленную клетку.
    const { data, error } = await this.db().rpc("save_base", {
      new_cells: encodeRle(p.cells),
      new_guns: p.guns,
      new_depots: p.depots,
    });
    if (error) throw error;
    const row = (data as { credits: number }[] | null)?.[0];
    return row ? { credits: row.credits } : {};
  }

  async saveEnemies(p: Player) {
    const { error } = await this.db().rpc("save_enemies", {
      new_enemies: p.enemies,
    });
    if (error) throw error;
  }

  async baseNames(emails: string[]) {
    const out = new Map<string, string>();
    if (!emails.length) return out;
    const { data, error } = await this.db().rpc("base_names", { emails });
    if (error) throw error;
    for (const row of (data as { email: string; name: string }[] | null) ?? []) {
      if (row.email && row.name) out.set(row.email.toLowerCase(), row.name);
    }
    return out;
  }
  async enemyBase(email: string) {
    const { data, error } = await this.db().rpc("enemy_base", { target_email: email });
    if (error) throw error;
    const row = (data as { cells: string; guns: Gun[]; gun_level: number }[] | null)?.[0];
    if (!row) throw new Error("no base");
    return { cells: decodeCells(row.cells), guns: row.guns ?? [], gunLevel: row.gun_level ?? 1 };
  }

  async upgrade(p: Player, kind: UpgradeKind) {
    const { data, error } = await this.db().rpc("upgrade", { kind });
    if (error) throw error;
    const row = (data as { credits: number; levels: Player["levels"] }[] | null)?.[0];
    return row ? { credits: row.credits, levels: row.levels } : {};
  }
  async spendScouts(p: Player, n: number) {
    const { error } = await this.db().rpc("spend_scouts", { n, new_depots: p.depots });
    if (error) throw error;
  }



  async buyDrones(p: Player, amount: number, kind: DroneKind = "basic") {
    const { data, error } = await this.db().rpc("buy_drones", {
      // Имя SQL-параметра оставлено для совместимости со старой функцией,
      // но теперь это точное количество дронов, а не число пачек.
      packs: amount,
      new_depots: p.depots,
      kind,
    });
    if (error) throw error;
    const row = (data as { credits: number }[] | null)?.[0];
    return row ? { credits: row.credits } : {};
  }

  async sendAttack(
    p: Player,
    targetEmail: string,
    drones: number,
    pattern: Pattern,
    direction: number,
    seed: number
  ) {
    const { error } = await this.db().rpc("send_attack", {
      target_email: targetEmail,
      drone_count: drones,
      attack_pattern: pattern,
      attack_direction: direction,
      attack_seed: seed,
      new_depots: p.depots,
    });
    if (error) throw error;
  }

  async acknowledgeReport(id: string) {
    const { error } = await this.db().rpc("ack_attack_report", { attack_id: id });
    if (error) throw error;
  }

  async applyBattle(p: Player, result: BattleResult, attackId?: string) {
    const rpc = attackId ? "complete_attack" : "apply_battle";
    const args = {
      new_cells: encodeRle(p.cells),
      new_guns: p.guns,
      new_depots: p.depots,
      result,
      ...(attackId ? { attack_id: attackId } : {}),
    };
    const { data, error } = await this.db().rpc(rpc, args);
    if (error) throw error;
    const row = (data as { credits: number }[] | null)?.[0];
    return row ? { credits: row.credits } : {};
  }

  async rename(_p: Player, name: string) {
    const { error } = await this.db().rpc("rename_base", { new_name: name });
    if (error) throw error;
  }

  async wipe(p: Player) {
    const { error } = await this.db().rpc("wipe_base");
    if (error) throw error;
    const fresh = newPlayer();
    fresh.name = p.name;
    fresh.credits = Math.max(p.credits, CREDITS_START);
    fresh.stats = { ...p.stats, wipes: p.stats.wipes + 1 };
    fresh.enemies = p.enemies;
    return fresh;
  }
}

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (!repo) repo = cloudEnabled ? new CloudRepo() : new LocalRepo();
  return repo;
}
