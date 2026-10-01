"use client";

/*
 * Что сняла разведка: сколько установок каждого вида — цветной квадратик,
 * как на карте, название и число. Одно и то же в карточке врага и в отчёте
 * в конце вылета.
 */

import { installColors } from "@/lib/render";
import type { ScoutCounts } from "@/lib/scout";
import { useT } from "@/lib/i18n";
import type { Key } from "@/lib/i18n/dict";

const KINDS = ["gun", "rocket", "spray", "trap"] as const;
const LABEL: Record<(typeof KINDS)[number], Key> = {
  gun: "tool.gun",
  rocket: "tool.rocket",
  spray: "tool.spray",
  trap: "tool.trap",
};

export default function InstallCounts({ counts }: { counts: ScoutCounts }) {
  const t = useT();
  return (
    <>
      {KINDS.map((kind) => (
        <div key={kind} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-neutral-400">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/40"
              style={{ background: installColors(kind).top }}
              aria-hidden
            />
            {t(LABEL[kind])}
          </span>
          <span className="text-neutral-100">{counts[kind]}</span>
        </div>
      ))}
    </>
  );
}
