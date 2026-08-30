"use client";

import { useState } from "react";
import { PATTERNS, type Pattern, EDGE_NAMES } from "@/lib/attack";
import { fmt } from "@/lib/economy";
import { MAX_ATTACK_DRONES, type Enemy, type RaidOutcome } from "@/lib/enemy";
import { Row } from "./ui";

interface Props {
  enemies: Enemy[];
  drones: number;
  onAdd: (email: string) => string | null; // текст ошибки или null
  onRaid: (enemy: Enemy, drones: number, pattern: Pattern, direction: number) => RaidOutcome;
  onChanged: () => void;
}

export default function Enemies({ enemies, drones, onAdd, onRaid, onChanged }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Enemy | null>(null);
  const [outcome, setOutcome] = useState<{ enemy: Enemy; out: RaidOutcome } | null>(null);

  const add = () => {
    const e = onAdd(email.trim());
    setError(e);
    if (!e) {
      setEmail("");
      onChanged();
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="почта врага"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-base text-neutral-200 placeholder:text-neutral-600 lg:py-1 lg:text-sm"
        />
        <button
          onClick={add}
          className="shrink-0 rounded border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800 lg:py-1"
        >
          Добавить
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {enemies.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Пока не с кем воевать. Добавь врага по почте — он ответит тем же.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {enemies.map((e) => (
            <li key={e.id} className="rounded border border-neutral-800 bg-neutral-950/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-neutral-200">{e.name}</div>
                  <div className="truncate font-mono text-[11px] text-neutral-500">{e.email}</div>
                </div>
                <button
                  onClick={() => setTarget(e)}
                  disabled={drones < 10}
                  className="shrink-0 rounded bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-neutral-700 lg:py-1"
                >
                  Атаковать
                </button>
              </div>
              <div className="mt-1 font-mono text-[11px] text-neutral-500">
                сжёг у него {fmt(e.burnedByMe)} · он у тебя {fmt(e.burnedByThem)}
              </div>
            </li>
          ))}
        </ul>
      )}

      {target && (
        <RaidDialog
          enemy={target}
          drones={drones}
          onCancel={() => setTarget(null)}
          onSend={(n, pattern, dir) => {
            const out = onRaid(target, n, pattern, dir);
            setTarget(null);
            setOutcome({ enemy: target, out });
            onChanged();
          }}
        />
      )}

      {outcome && (
        <RaidReport
          name={outcome.enemy.name}
          out={outcome.out}
          onClose={() => setOutcome(null)}
        />
      )}
    </>
  );
}

function RaidDialog({
  enemy,
  drones,
  onCancel,
  onSend,
}: {
  enemy: Enemy;
  drones: number;
  onCancel: () => void;
  onSend: (n: number, p: Pattern, dir: number) => void;
}) {
  const max = Math.min(drones, MAX_ATTACK_DRONES);
  const [n, setN] = useState(Math.min(50, max));
  const [pattern, setPattern] = useState<Pattern>("swarm");
  const [dir, setDir] = useState(0);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-2xl border border-neutral-700 bg-neutral-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-md sm:pb-5">
        <h3 className="mb-1 text-lg font-bold">Налёт на {enemy.name}</h3>
        <p className="mb-4 text-xs text-neutral-500">
          Дроны спишутся сразу и не вернутся, чем бы дело ни кончилось.
        </p>

        <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-400">
          Дронов: <span className="font-mono text-neutral-100">{n}</span> из {max}
        </label>
        <input
          type="range"
          min={10}
          max={max}
          step={10}
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
          className="mb-4 h-8 w-full accent-red-500"
        />

        <div className="mb-1 text-xs uppercase tracking-wider text-neutral-400">Рисунок волн</div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPattern(p.id)}
              className={`rounded border px-2 py-2 text-left text-xs ${
                pattern === p.id
                  ? "border-red-500 bg-red-500/15 text-red-200"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              <div className="font-semibold">{p.name}</div>
              <div className="text-[11px] text-neutral-500">{p.hint}</div>
            </button>
          ))}
        </div>

        {(pattern === "swarm" || pattern === "lines") && (
          <>
            <div className="mb-1 text-xs uppercase tracking-wider text-neutral-400">Откуда</div>
            <div className="mb-4 flex gap-2">
              {EDGE_NAMES.map((name, i) => (
                <button
                  key={name}
                  onClick={() => setDir(i)}
                  className={`flex-1 rounded border px-2 py-1 text-xs ${
                    dir === i
                      ? "border-red-500 bg-red-500/15 text-red-200"
                      : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onSend(n, pattern, dir)}
            className="flex-1 rounded bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 sm:py-2"
          >
            Отправить {n} дронов
          </button>
          <button
            onClick={onCancel}
            className="rounded border border-neutral-700 px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800 sm:py-2"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function RaidReport({
  name,
  out,
  onClose,
}: {
  name: string;
  out: RaidOutcome;
  onClose: () => void;
}) {
  const r = out.result;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-2xl border border-neutral-700 bg-neutral-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-md sm:pb-5">
        <h3 className="mb-1 text-lg font-bold">
          {out.destroyed ? `${name} выгорел дотла` : `Налёт на ${name}`}
        </h3>
        <p className="mb-4 text-xs text-neutral-500">
          Сводка одна и та же у обеих сторон — он видит ровно эти цифры.
        </p>
        <dl className="mb-4 space-y-1 font-mono text-sm">
          <Row label="Запущено дронов" value={String(r.dronesSent)} />
          <Row label="Сбито ракетами" value={String(r.killedByGuns)} />
          <Row label="Сбито очередью" value={String(r.killedByMg)} />
          <Row label="Прорвалось" value={String(r.leaked)} />
          <Row label="Клеток сожжено" value={String(r.burned)} />
          <Row label="Уничтожено дронов на складе" value={String(r.dronesLost)} />
          <Row label="Уничтожено пушек" value={String(r.gunsLost)} />
          <Row label="Добыча" value={`+${fmt(out.loot)} кр`} />
        </dl>
        <button
          onClick={onClose}
          className="w-full rounded bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-white sm:py-2"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
