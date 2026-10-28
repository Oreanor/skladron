// Игра поверх Supabase: склад, налёты и почта живут на сервере.

import { type Depot, type Gun, decodeCells, decodePgBytea, encodeRle, sanitizeGuns, G_BASE } from "../base";
import { CREDITS_START, STARTER_CELLS, type UpgradeKind } from "../economy";
import { normalizeAvatarForStorage, type Avatar } from "../avatar";
import { SIMULATION_VERSION } from "../tuning";
import { notifyMessage } from "../notify";
import type { Message, Pattern, SnapLevels, WavePlan } from "../attack";
import type { ReplayData } from "@/components/battle/Replay";
import type { BattleResult } from "../engine";
import { newPlayer, startLevels, type Player } from "../player";
import type { Blueprint } from "../blueprint";
import { supabase } from "../supabase";
import type { Income, Repo } from "./types";

/**
 * Повтор боя по id — и для журнала в игре, и для страницы по ссылке, куда
 * заходят без входа. Одна функция на оба места: раньше страница собирала
 * заказ сама, забыла про волны и проигрывала любой налёт одной волной.
 */
export async function publicReplay(id: string): Promise<{
  defender: string;
  competitionStage?: number;
  replay: ReplayData;
} | null> {
  const db = supabase();
  if (!db) throw new Error("supabase not configured");
  const { data, error } = await db.rpc("public_replay", { attack_id: id });
  if (error) throw error;
  const row = (data as {
    attacker: string;
    defender: string;
    drones: number;
    pattern: Pattern;
    direction: number;
    seed: number;
    drone_level: number;
    simulation_version: number;
    waves: WavePlan[];
    snap_cells: string;
    snap_guns: Gun[];
    snap_depots: Depot[];
    snap_levels: SnapLevels;
    trace: string;
    resolved_at: string;
    competition_stage: number | null;
  }[] | null)?.[0];
  if (!row) return null;
  // Повтор, снятый под прежнюю версию боя, проигрывать нечем: запись рук
  // не подходит к нынешней геометрии волн. Лучше честно сказать «нет
  // повтора», чем уронить страницу на попытке его построить.
  if (row.simulation_version !== SIMULATION_VERSION) return null;
  return {
    defender: row.defender,
    competitionStage: row.competition_stage ?? undefined,
    replay: {
      order: {
        id,
        from: row.attacker,
        createdAt: Date.parse(row.resolved_at),
        drones: row.drones,
        pattern: row.pattern,
        direction: row.direction,
        seed: row.seed,
        waves: row.waves,
        droneLevel: row.drone_level,
        simulationVersion: row.simulation_version,
        competitionStage: row.competition_stage ?? undefined,
      },
      cells: row.snap_cells,
      guns: row.snap_guns,
      depots: row.snap_depots,
      levels: row.snap_levels,
      trace: row.trace,
    },
  };
}

interface ProfileRow {
  base_name: string | null;
  avatar: string | null;
  credits: number;
  founded: boolean;
  last_income_at: string;
  created_at: string;
  stats: Player["stats"];
  enemies: Player["enemies"];
  levels: Player["levels"];
  loan: number;
  loan_due: string | null;
  competition_at: number;
  competition_best: Player["competitionBest"];
}

/** collect_income отдаёт именно credits_added — имя колонки, а не поля Income. */
interface IncomeRow {
  credits_added: number;
  days: number;
  sold_drones: number;
}

const incomeOf = (data: unknown): Income => {
  const first = (data as IncomeRow[] | null)?.[0];
  return {
    credits: first?.credits_added ?? 0,
    days: first?.days ?? 0,
    sold: first?.sold_drones ? { drones: first.sold_drones } : null,
  };
};

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
  waves: WavePlan[];
  drone_level: number;
  simulation_version: number;
  from_email: string;
  avatar: string | null;
  opener: string | null;
  competition_stage: number | null;
}

interface AttackReportRow {
  id: string;
  target_name: string;
  resolved_at: string;
  result: BattleResult;
  loot: number;
  destroyed: boolean;
  drones: number;
  pattern: Pattern;
  direction: number;
  seed: number;
  snap_cells: string;
  snap_guns: Gun[];
  snap_depots: Depot[];
  snap_levels: SnapLevels;
  waves: WavePlan[];
  drone_level: number;
  trace: string;
  simulation_version: number;
}

/**
 * Уровни с сервера, дополненные первыми: у профиля, заведённого до нового
 * класса, его ключа нет, и цена с радиусом считались бы от пустоты — NaN.
 */
const fullLevels = (lv: Partial<Player["levels"]> | null): Player["levels"] => ({
  ...startLevels(),
  ...(lv ?? {}),
});

interface BlueprintRow {
  id: string;
  name: string;
  cells: string;
  guns: Gun[];
  depots?: Depot[] | null;
  created_at: string;
}

const blueprintFromRow = (r: BlueprintRow): Blueprint => ({
  id: r.id,
  name: r.name,
  cells: r.cells,
  guns: r.guns,
  depots: r.depots ?? [],
  createdAt: Date.parse(r.created_at),
});

export class CloudRepo implements Repo {
  mode = "cloud" as const;

  private db() {
    const c = supabase();
    if (!c) throw new Error("supabase not configured");
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
    const player: Player = {
      name: row.base_name ?? "",
      avatar: row.avatar,
      credits: attacks.credits ?? row.credits,
      founded: row.founded,
      lastIncomeAt: Date.parse(row.last_income_at),
      createdAt: Date.parse(row.created_at),
      stats: row.stats,
      levels: fullLevels(row.levels),
      loan: row.loan,
      loanDue: row.loan_due ? Date.parse(row.loan_due) : null,
      cells: decodePgBytea(b.cells),
      guns: b.guns,
      depots: b.drone_cells,
      incoming: attacks.incoming,
      enemies: row.enemies,
      // прогресс состязаний ведёт сервер: он же считает и счёт попытки
      competitionAt: row.competition_at,
      competitionBest: row.competition_best,
    };

    // склад врага могли переименовать — подтягиваем актуальные имена
    try {
      const names = await this.baseNames(player.enemies.map((e) => e.email));
      for (const e of player.enemies) {
        const actual = names.get(e.email.toLowerCase());
        if (!actual) continue;
        e.name = actual.name;
        e.avatar = actual.avatar;
        e.level = actual.level;
      }
    } catch {
      // имена — украшение списка, из-за них вход в игру ломаться не должен
    }

    return { player, income: incomeOf(inc.data), reports: attacks.reports };
  }

  async beginBattle() {
    const { error } = await this.db().rpc("begin_battle");
    if (error) throw error;
  }

  async collectShift(p: Player) {
    const inc = await this.db().rpc("collect_income");
    if (inc.error) throw inc.error;
    // Перечитываем склад, даже если смену уже начислил ночной крон: ящики
    // он увёз, а у нас они ещё лежат.
    await this.reloadBase(p);
    return incomeOf(inc.data);
  }

  async syncAttacks() {
    const db = this.db();
    const [incomingResult, reportResult, profileResult] = await Promise.all([
      db.rpc("pending_attacks"),
      db.rpc("attack_reports"),
      db.from("profiles").select("credits, stats, loan, loan_due").single(),
    ]);
    if (incomingResult.error) throw incomingResult.error;
    if (reportResult.error) throw reportResult.error;
    if (profileResult.error) throw profileResult.error;

    const incoming = ((incomingResult.data ?? []) as IncomingAttackRow[])
      // Налёт чужой версии отыграть нечем — у него другая геометрия волн.
      // Выкидываем при чтении, а не при входе в бой: очередь разбирается
      // строго по порядку, и такой налёт запер бы её целиком. Патч, что
      // поднимает версию, перештамповывает неотыгранные.
      .filter((row) => row.simulation_version === SIMULATION_VERSION)
      .map((row) => ({
      id: row.id,
      from: row.from_name,
      createdAt: Date.parse(row.created_at),
      activatedAt: row.activated_at ? Date.parse(row.activated_at) : null,
      drones: row.drones,
      pattern: row.pattern,
      direction: row.direction,
      seed: row.seed,
      waves: row.waves,
      // дроны летят на том уровне, до какого их довёл нападающий
      droneLevel: row.drone_level,
      simulationVersion: row.simulation_version,
      // У состязания нападающий — ты сам: почту не отдаём, иначе опрос
      // записал бы тебя в собственные враги.
      fromEmail: row.competition_stage ? undefined : row.from_email,
      avatar: row.avatar ?? null,
      opener: row.opener ?? undefined,
      competitionStage: row.competition_stage ?? undefined,
      remote: true,
    }));
    const reports = ((reportResult.data ?? []) as AttackReportRow[]).map((row) => ({
      id: row.id,
      target: row.target_name,
      resolvedAt: Date.parse(row.resolved_at),
      result: row.result,
      loot: row.loot,
      destroyed: row.destroyed,
      // У снятых под прежнюю версию боя запись рук к нынешней геометрии
      // волн не подходит — такой повтор не показываем вовсе.
      replay:
        row.simulation_version === SIMULATION_VERSION
        ? {
            order: {
              id: row.id,
              from: row.target_name,
              createdAt: Date.parse(row.resolved_at),
              drones: row.drones,
              pattern: row.pattern,
              direction: row.direction,
              seed: row.seed,
              waves: row.waves,
              droneLevel: row.drone_level,
              simulationVersion: row.simulation_version,
            },
            cells: row.snap_cells,
            guns: row.snap_guns,
            depots: row.snap_depots,
            levels: row.snap_levels,
            trace: row.trace,
          }
        : undefined,
    }));
    return {
      incoming,
      reports,
      credits: profileResult.data.credits as number,
      stats: profileResult.data.stats as Player["stats"],
      loan: (profileResult.data.loan as number) ?? 0,
      loanDue: profileResult.data.loan_due
        ? Date.parse(profileResult.data.loan_due as string)
        : null,
    };
  }

  async saveBase(p: Player) {
    // Список врагов сюда не подмешиваем: он меняется втрое реже карты, а
    // писался вторым запросом на каждую поставленную клетку.
    // Лишние поля пушек (alive, spray…) сервер в guns_valid отвергает.
    p.guns = sanitizeGuns(p.guns);
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
    const out = new Map<string, { name: string; avatar: Avatar; level: number }>();
    if (!emails.length) return out;
    const { data, error } = await this.db().rpc("base_names", { emails });
    if (error) throw error;
    const rows =
      (data as { email: string; name: string; avatar: string | null; level: number | null }[] | null) ?? [];
    for (const row of rows) {
      if (row.email && row.name) {
        out.set(row.email.toLowerCase(), { name: row.name, avatar: row.avatar, level: row.level ?? 0 });
      }
    }
    return out;
  }

  async setAvatar(p: Player, value: Avatar) {
    const stored = normalizeAvatarForStorage(value);
    const { error } = await this.db().rpc("set_avatar", { value: stored });
    if (error) throw error;
    p.avatar = stored;
  }
  async launchScout(p: Player, email: string, n: number) {
    const { data, error } = await this.db().rpc("launch_scout", {
      target_email: email,
      n,
    });
    if (error) throw error;
    const row = (data as {
      cells: string;
      guns: Gun[];
      gun_level: number;
      depots: Depot[];
    }[] | null)?.[0];
    if (!row) throw new Error("no base");
    p.depots = row.depots ?? p.depots;
    return { cells: decodeCells(row.cells), guns: row.guns ?? [], gunLevel: row.gun_level ?? 1 };
  }

  async takeLoan(p: Player, amount: number) {
    const { data, error } = await this.db().rpc("take_loan", { amount });
    if (error) throw error;
    const row = (data as { credits: number; loan: number; loan_due: string }[] | null)?.[0];
    if (row) {
      p.credits = row.credits;
      p.loan = row.loan;
      p.loanDue = row.loan_due ? Date.parse(row.loan_due) : null;
    }
  }

  async repayLoan(p: Player) {
    const { data, error } = await this.db().rpc("repay_loan");
    if (error) throw error;
    const row = (data as { credits: number; loan: number }[] | null)?.[0];
    if (row) {
      p.credits = row.credits;
      p.loan = row.loan;
      p.loanDue = null;
    }
  }

  async stalePatches(email: string, snapCells: string) {
    const { data, error } = await this.db().rpc("stale_patches", {
      target_email: email,
      snap: snapCells,
    });
    if (error) throw error;
    return (data as number[] | null) ?? [];
  }

  async addRival(email: string) {
    const { data, error } = await this.db().rpc("add_rival", { target_email: email });
    if (error) throw error;
    const row = (data as { email: string; name: string }[] | null)?.[0];
    return row?.name ?? null;
  }

  async messages(email: string): Promise<Message[]> {
    const { data, error } = await this.db().rpc("message_thread", { peer_email: email });
    if (error) throw error;
    return ((data ?? []) as {
      id: string;
      mine: boolean;
      body: string;
      created_at: string;
      read_at: string | null;
    }[]).map((row) => ({
      id: row.id,
      mine: row.mine,
      body: row.body,
      at: Date.parse(row.created_at),
      seen: !row.mine || row.read_at !== null,
    }));
  }

  async sendMessage(email: string, body: string) {
    const { data, error } = await this.db().rpc("send_message", {
      target_email: email,
      body,
    });
    if (error) return error.message;
    // Извещение шлём сами, отдельной ручкой: серверу нужен номер реплики,
    // а он рождается только здесь.
    const row = (data as { id: string }[] | null)?.[0];
    if (row) notifyMessage(email, row.id);
    return null;
  }

  async editMessage(id: string, body: string) {
    const { error } = await this.db().rpc("edit_message", { msg: id, body });
    return error ? error.message : null;
  }

  async readMessages(email: string) {
    const { error } = await this.db().rpc("read_messages", { peer_email: email });
    if (error) throw error;
  }

  async setLocale(locale: string) {
    const { error } = await this.db().rpc("set_locale", { l: locale });
    if (error) throw error;
  }

  async blueprints() {
    const { data, error } = await this.db()
      .from("blueprints")
      .select("id, name, cells, guns, depots, created_at")
      .order("created_at");
    if (error) throw error;
    return ((data ?? []) as BlueprintRow[]).map(blueprintFromRow);
  }

  async saveBlueprint(name: string, plan: Pick<Blueprint, "cells" | "guns" | "depots">) {
    const { data, error } = await this.db().rpc("save_blueprint", {
      bp_name: name,
      bp_cells: plan.cells,
      bp_guns: plan.guns,
      bp_depots: plan.depots,
    });
    if (error) throw error;
    const row = (data as BlueprintRow[] | null)?.[0];
    if (!row) throw new Error("blueprint not saved");
    return blueprintFromRow(row);
  }

  async deleteBlueprint(id: string) {
    const { error } = await this.db().rpc("delete_blueprint", { bp: id });
    if (error) throw error;
  }

  async sellDepot(_p: Player, x: number, y: number) {
    const { data, error } = await this.db().rpc("sell_depot", { at_x: x, at_y: y });
    if (error) throw error;
    const row = (data as { credits: number }[] | null)?.[0];
    return row ? { credits: row.credits } : {};
  }

  async buildBlueprint(p: Player, b: Blueprint) {
    const { error } = await this.db().rpc("build_blueprint", { bp: b.id });
    if (error) throw error;
    // Склад целиком новый: берём его с сервера, а не собираем у себя.
    await this.reloadBase(p);
    p.founded ||= p.cells.reduce((n, v) => (v === G_BASE ? n + 1 : n), 0) >= STARTER_CELLS;
  }

  async unread() {
    const { data, error } = await this.db().rpc("unread_messages");
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const row of (data ?? []) as { email: string; n: number }[]) {
      out[row.email.toLowerCase()] = row.n;
    }
    return out;
  }

  async upgrade(p: Player, kind: UpgradeKind) {
    const { data, error } = await this.db().rpc("upgrade", { kind });
    if (error) throw error;
    const row = (data as { credits: number; levels: Player["levels"] }[] | null)?.[0];
    return row ? { credits: row.credits, levels: fullLevels(row.levels) } : {};
  }
  async reloadBase(p: Player) {
    const db = this.db();
    const [{ data: base, error }, { data: prof, error: e2 }] = await Promise.all([
      db.from("bases").select("cells, guns, drone_cells").single(),
      db.from("profiles").select("credits, levels, last_income_at").single(),
    ]);
    if (error) throw error;
    if (e2) throw e2;
    const b = base as BaseRow;
    p.cells = decodePgBytea(b.cells);
    p.guns = b.guns;
    p.depots = b.drone_cells;
    const row = prof as { credits: number; levels: Player["levels"]; last_income_at: string };
    p.credits = row.credits;
    p.levels = fullLevels(row.levels);
    p.lastIncomeAt = Date.parse(row.last_income_at);
  }



  async buyDepot(p: Player, amount: number) {
    const { data, error } = await this.db().rpc("buy_depot", {
      amount,
      new_depots: p.depots,
    });
    if (error) throw error;
    const row = (data as { credits: number }[] | null)?.[0];
    return row ? { credits: row.credits } : {};
  }

  async queueCompetition(stage: number, waves: WavePlan[], seed: number, droneLevel: number) {
    const { data, error } = await this.db().rpc("queue_competition", {
      stage,
      attack_waves: waves,
      attack_seed: seed,
      attack_drone_level: droneLevel,
    });
    if (error) throw error;
    return data as string;
  }

  async sendAttack(
    p: Player,
    targetEmail: string,
    waves: WavePlan[],
    seed: number,
    opener?: string
  ) {
    const note = opener?.trim().slice(0, 500);
    const { data, error } = await this.db().rpc("send_attack", {
      target_email: targetEmail,
      attack_waves: waves,
      attack_seed: seed,
      opener: note && note.length > 0 ? note : undefined,
    });
    if (error) throw error;
    const row = (data as { id: string; depots: Depot[]; credits: number }[] | null)?.[0];
    if (row?.depots) p.depots = row.depots;
    if (row?.credits !== undefined) p.credits = row.credits;
    return row?.id ?? null;
  }

  async telegram() {
    const { data, error } = await this.db().rpc("tg_code");
    if (error) throw error;
    const row = (data as { code: string; linked: boolean }[] | null)?.[0];
    return row ?? null;
  }

  async telegramUnlink() {
    const { error } = await this.db().rpc("tg_unlink");
    if (error) throw error;
  }

  async raidLog() {
    const { data, error } = await this.db().rpc("raid_log");
    if (error) throw error;
    return ((data ?? []) as {
      id: string;
      side: "attack" | "defence";
      foe: string;
      foe_email: string;
      at: string;
      pending: boolean;
      drones: number;
      loot: number;
      destroyed: boolean;
      burned: number;
      burned_pct: number | null;
      has_replay: boolean;
    }[]).map((row) => ({
      id: row.id,
      side: row.side,
      foe: row.foe,
      foeEmail: row.foe_email,
      at: Date.parse(row.at),
      pending: row.pending,
      drones: row.drones,
      burned: row.burned,
      burnedPct: row.burned_pct ?? undefined,
      loot: row.loot,
      destroyed: row.destroyed,
      hasReplay: row.has_replay,
    }));
  }

  async replayOf(id: string) {
    return (await publicReplay(id))?.replay ?? null;
  }

  async hideRaid(id: string) {
    const { error } = await this.db().rpc("hide_raid", { attack_id: id });
    if (error) throw error;
  }

  async acknowledgeReport(id: string) {
    const { error } = await this.db().rpc("ack_attack_report", { attack_id: id });
    if (error) throw error;
  }

  async applyBattle(p: Player, result: BattleResult, attackId?: string, trace?: string) {
    // Настоящий налёт закрывает сервер: ему уходит только запись рук, а склад
    // и исход он считает сам по своей копии. Клиенту тут верить нельзя — на
    // исходе висит премия нападающему, и присланный «сгорело дотла» был бы
    // кредитами из ниоткуда.
    if (attackId) return this.resolveAttack(p, attackId, trace ?? "");

    // Бой с ботом — дело одного игрока: премии никому, а страховка за
    // сожжённое ровно покрывает ремонт, так что жечь себя незачем.
    const { data, error } = await this.db().rpc("apply_battle", {
      new_cells: encodeRle(p.cells),
      new_guns: sanitizeGuns(p.guns),
      new_depots: p.depots,
      result,
    });
    if (error) throw error;
    const row = (data as { credits: number }[] | null)?.[0];
    return row ? { credits: row.credits } : {};
  }

  /** Отдаёт запись боя серверу и забирает посчитанный им исход. */
  private async resolveAttack(p: Player, attackId: string, trace: string) {
    const db = this.db();
    const { data: session } = await db.auth.getSession();
    const token = session.session?.access_token;
    if (!token) throw new Error("not authenticated");

    const res = await fetch("/api/battle/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      // своя версия движка: сервер не засчитает бой, сыгранный другой
      body: JSON.stringify({ attackId, trace, version: SIMULATION_VERSION }),
    });
    const body = (await res.json()) as { error?: string; credits?: number };
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

    // Склад после боя считал сервер — перечитываем его, а не оставляем свой.
    await this.reloadBase(p);
    return body.credits !== undefined ? { credits: body.credits } : {};
  }

  async rename(_p: Player, name: string) {
    const { error } = await this.db().rpc("rename_base", { new_name: name });
    if (error) throw error;
  }

  async restart(p: Player) {
    const { error } = await this.db().rpc("restart_game");
    if (error) throw error;
    const fresh = newPlayer();
    // имя и знакомства переживают перезапуск: это не имущество;
    // миссии начинаются заново вместе со складом
    fresh.name = p.name;
    fresh.enemies = p.enemies;
    return fresh;
  }

  async wipe(p: Player) {
    const { error } = await this.db().rpc("wipe_base");
    if (error) throw error;
    const fresh = newPlayer();
    fresh.name = p.name;
    // Уровни переживают пожар: на сервере они и не сбрасывались, а клиент
    // забывал их и потом предлагал апгрейд по цене первого уровня.
    fresh.levels = { ...p.levels };
    // Сервер уже поднял казну до старта, если было меньше; зеркалим здесь.
    fresh.credits = Math.max(p.credits, CREDITS_START);
    fresh.stats = { ...p.stats, wipes: p.stats.wipes + 1 };
    fresh.enemies = p.enemies;
    fresh.competitionAt = p.competitionAt;
    fresh.competitionBest = p.competitionBest;
    return fresh;
  }
}
