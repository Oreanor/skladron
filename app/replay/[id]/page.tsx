"use client";

// Повтор боя по ссылке. Открывается кем угодно и без входа: id атаки —
// случайный uuid, а показывается ровно то, что и так видели обе стороны.

import { use, useEffect, useState } from "react";
import Replay, { type ReplayData } from "@/components/Replay";
import { Button } from "@/components/ui";
import { SettingsProvider, useT } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import type { Pattern } from "@/lib/attack";

interface Row {
  attacker: string;
  defender: string;
  drones: number;
  pattern: Pattern;
  direction: number;
  seed: number;
  drone_level: number | null;
  snap_cells: string;
  snap_guns: { cx: number; cy: number }[] | null;
  snap_depots: { cx: number; cy: number; n: number; kind?: string }[] | null;
  snap_levels: { guns?: number; mg?: number; water?: number } | null;
  trace: string | null;
  resolved_at: string;
}

function Screen({ id }: { id: string }) {
  const t = useT();
  const [state, setState] = useState<
    { name: string; replay: ReplayData } | "loading" | "gone"
  >("loading");
  /** Чем именно ответил сервер: без этого «повтора нет» ничего не объясняет. */
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const db = supabase();
    if (!db) {
      setState("gone");
      return;
    }
    let alive = true;
    void db
      .rpc("public_replay", { attack_id: id })
      .then(({ data, error }) => {
        if (!alive) return;
        const row = (data as Row[] | null)?.[0];
        if (error) {
          setFailed(error.message);
          setState("gone");
          return;
        }
        if (!row) {
          setState("gone");
          return;
        }
        setState({
          name: row.defender,
          replay: {
            order: {
              id,
              from: row.attacker,
              createdAt: Date.parse(row.resolved_at),
              drones: row.drones,
              pattern: row.pattern,
              direction: row.direction,
              seed: row.seed,
              droneLevel: row.drone_level ?? 1,
            },
            cells: row.snap_cells,
            guns: row.snap_guns ?? [],
            depots: row.snap_depots ?? [],
            levels: row.snap_levels ?? {},
            trace: row.trace ?? "",
          },
        });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (state === "loading") {
    return <p className="p-6 text-sm text-neutral-500">{t("app.loading")}</p>;
  }

  if (state === "gone") {
    return (
      <div className="m-auto max-w-sm space-y-4 p-6 text-center">
        <p className="text-neutral-400">{t("replay.gone")}</p>
        {failed && <p className="font-mono text-xs text-neutral-600">{failed}</p>}
        <Button variant="neutral" onClick={() => (location.href = "/")}>
          {t("replay.open")}
        </Button>
      </div>
    );
  }

  return <Replay name={state.name} replay={state.replay} shareId={id} />;
}

export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <SettingsProvider>
      <main className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col p-2 sm:p-3 lg:p-5">
        <div className="flex min-h-0 flex-1 flex-col">
          <Screen id={id} />
        </div>
      </main>
    </SettingsProvider>
  );
}
