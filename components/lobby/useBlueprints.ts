// Чертежи: список, открытый в большом окне, ждущий подтверждения стройки и
// окно имени — и то, что с ними делают.

import { useEffect, useState, type RefObject } from "react";
import { blueprintOf, type Blueprint } from "@/lib/blueprint";
import { explain } from "@/lib/errors";
import type { Player } from "@/lib/player";
import type { LobbyCore } from "./useBaseSync";

export function useBlueprints(
  core: LobbyCore,
  player: RefObject<Player | null>,
  ready: boolean,
  /** Склад перестроен по чертежу: рамку стройки сбросить. */
  onBuilt: () => void
) {
  const { repo, t, say } = core;
  const [list, setList] = useState<Blueprint[]>([]);
  const [open, setOpen] = useState<Blueprint | null>(null);
  const [buildAsk, setBuildAsk] = useState<Blueprint | null>(null);
  const [naming, setNaming] = useState(false);

  // чертежи грузим, когда склад уже на месте
  useEffect(() => {
    if (!ready) return;
    void repo
      .blueprints()
      .then(setList)
      .catch(() => {
        // без списка чертежей играть можно
      });
  }, [repo, ready]);

  const save = async (name: string) => {
    const p = player.current;
    if (!p) return;
    setNaming(false);
    try {
      const b = await repo.saveBlueprint(name.trim(), blueprintOf(p));
      setList((cur) => [...cur, b]);
      say(t("blueprint.saved", { name: b.name }));
    } catch (e) {
      say(t("blueprint.failed", { error: explain(e, t) }));
    }
  };

  const remove = async (b: Blueprint) => {
    setOpen(null);
    setList((cur) => cur.filter((x) => x.id !== b.id));
    try {
      await repo.deleteBlueprint(b.id);
    } catch (e) {
      say(t("blueprint.failed", { error: explain(e, t) }));
      void repo.blueprints().then(setList).catch(() => {});
    }
  };

  /** Снести склад и построить чертёж: сначала досохраняем правки, иначе они легли бы поверх. */
  const build = async (b: Blueprint) => {
    const p = player.current;
    if (!p) return;
    setBuildAsk(null);
    setOpen(null);
    try {
      await core.flushPersist();
      await repo.buildBlueprint(p, b);
      onBuilt();
      core.redraw();
      say(t("blueprint.built", { name: b.name }));
    } catch (e) {
      say(t("blueprint.failed", { error: explain(e, t) }));
      await core.resyncBase();
    }
  };

  return { list, open, setOpen, buildAsk, setBuildAsk, naming, setNaming, save, remove, build };
}
