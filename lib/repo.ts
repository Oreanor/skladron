// Хранилище состояния игрока. Одна и та же игра работает поверх localStorage
// и поверх Supabase — Lobby знает только этот интерфейс.

import { CELLS, type Depot, decodeCells, encodeRle, type Gun } from "./base";

import { CREDITS_START } from "./economy";
import type { BattleResult } from "./engine";
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
  load(): Promise<{ player: Player; income: Income }>;
  /** Склад после правок в лобби. Возвращает авторитетные цифры сервера. */
  saveBase(p: Player): Promise<Partial<Player>>;
  /** Список добавленных по e-mail соперников и их текущее состояние. */
  saveEnemies(p: Player): Promise<void>;
  buyDrones(p: Player, packs: number): Promise<Partial<Player>>;
  /** Переименование склада — отдельная операция, карты не касается. */
  rename(p: Player, name: string): Promise<void>;
  applyBattle(p: Player, result: BattleResult): Promise<Partial<Player>>;
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
    return { player, income };
  }

  async saveBase(p: Player) {
    localSave(p);
    return {};
  }

  async saveEnemies(p: Player) {
    localSave(p);
  }

  async buyDrones(p: Player, _packs: number) {
    localSave(p);
    return {};
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

/** Postgres отдаёт bytea в hex-виде «\x00ff…». */
function fromPgBytea(text: string): Uint8Array {
  const out = new Uint8Array(CELLS);
  if (!text) return out;
  if (!text.startsWith("\\x")) return decodeCells(text);
  const hex = text.slice(2);
  for (let i = 0; i < CELLS && i * 2 + 1 < hex.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
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

    const [{ data: prof, error: e1 }, { data: base, error: e2 }] = await Promise.all([
      db.from("profiles").select("*").single(),
      db.from("bases").select("cells, guns, drone_cells").single(),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const row = prof as ProfileRow;
    const b = base as BaseRow;
    const fresh = newPlayer();
    const player: Player = {
      ...fresh,
      name: row.base_name ?? "",
      credits: row.credits,
      founded: row.founded,
      lastIncomeAt: Date.parse(row.last_income_at),
      createdAt: Date.parse(row.created_at),
      // недостающие счётчики берём нулями: иначе fmt() падает на undefined
      stats: { ...fresh.stats, ...(row.stats ?? {}) },
      cells: fromPgBytea(b.cells),
      guns: b.guns ?? [],
      depots: b.drone_cells ?? [],
      incoming: [], // очередь атак появится на этапе 3
      enemies: row.enemies ?? [],
    };

    const first = (inc.data as IncomeRow[] | null)?.[0];
    return {
      player,
      income: { credits: first?.credits_added ?? 0, days: first?.days ?? 0 },
    };
  }

  async saveBase(p: Player) {
    const db = this.db();
    const [{ data, error }, enemyResult] = await Promise.all([
      db.rpc("save_base", {
        new_cells: encodeRle(p.cells),
        new_guns: p.guns,
        new_depots: p.depots,
      }),
      db.rpc("save_enemies", { new_enemies: p.enemies }),
    ]);
    if (error) throw error;
    if (enemyResult.error) throw enemyResult.error;
    const row = (data as { credits: number }[] | null)?.[0];
    return row ? { credits: row.credits } : {};
  }

  async saveEnemies(p: Player) {
    const { error } = await this.db().rpc("save_enemies", {
      new_enemies: p.enemies,
    });
    if (error) throw error;
  }

  async buyDrones(p: Player, packs: number) {
    const { data, error } = await this.db().rpc("buy_drones", {
      packs,
      new_depots: p.depots,
    });
    if (error) throw error;
    const row = (data as { credits: number }[] | null)?.[0];
    return row ? { credits: row.credits } : {};
  }

  async applyBattle(p: Player, result: BattleResult) {
    const { data, error } = await this.db().rpc("apply_battle", {
      new_cells: encodeRle(p.cells),
      new_guns: p.guns,
      new_depots: p.depots,
      result,
    });
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
