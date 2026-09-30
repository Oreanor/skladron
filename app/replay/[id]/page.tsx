"use client";

// Повтор боя по ссылке. Открывается кем угодно и без входа: id атаки —
// случайный uuid, а показывается ровно то, что и так видели обе стороны.

import { use, useEffect, useState } from "react";
import Replay, { type ReplayData } from "@/components/Replay";
import { Button } from "@/components/ui";
import { SettingsProvider, useT } from "@/lib/i18n";
import { publicReplay } from "@/lib/repo";

function Screen({ id }: { id: string }) {
  const t = useT();
  const [state, setState] = useState<
    { name: string; replay: ReplayData } | "loading" | "gone"
  >("loading");
  /** Чем именно ответил сервер: без этого «повтора нет» ничего не объясняет. */
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    publicReplay(id)
      .then((found) => {
        if (!alive) return;
        if (!found) {
          setState("gone");
          return;
        }
        // у состязания нападающий — сам защитник: подписываем номером
        const { replay } = found;
        if (found.competitionStage) {
          replay.order.from = t("competition.title", { n: found.competitionStage });
        }
        setState({ name: found.defender, replay });
      })
      .catch((e: Error) => {
        if (!alive) return;
        setFailed(e.message);
        setState("gone");
      });
    return () => {
      alive = false;
    };
  }, [id, t]);

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
