"use client";

import { useState } from "react";
import { PATTERNS, type Pattern, EDGE_NAMES } from "@/lib/attack";
import { fmt } from "@/lib/economy";
import { MAX_ATTACK_DRONES, type Enemy } from "@/lib/enemy";
import { Button, Card, Modal, inputClass } from "./ui";

interface Props {
  enemies: Enemy[];
  drones: number;
  onAdd: (email: string) => Promise<string | null>; // текст ошибки или null
  onRaid: (
    enemy: Enemy,
    drones: number,
    pattern: Pattern,
    direction: number
  ) => Promise<string | null>;
  onChanged: () => void;
}

export default function Enemies({ enemies, drones, onAdd, onRaid, onChanged }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Enemy | null>(null);
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (adding) return;
    setAdding(true);
    const e = await onAdd(email.trim());
    setAdding(false);
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
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="почта врага"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          className={inputClass}
        />
        <Button size="sm" onClick={() => void add()} disabled={adding}>
          {adding ? "Сохраняю…" : "Добавить"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {enemies.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Пока не с кем воевать. Добавь врага по почте — он ответит тем же.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {enemies.map((e) => (
            <Card key={e.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-neutral-200">{e.name}</div>
                  <div className="truncate font-mono text-[11px] text-neutral-500">{e.email}</div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={drones < 10}
                  onClick={() => setTarget(e)}
                >
                  Атаковать
                </Button>
              </div>
              <div className="mt-1 font-mono text-[11px] text-neutral-500">
                сжёг у него {fmt(e.burnedByMe)} · он у тебя {fmt(e.burnedByThem)}
              </div>
            </Card>
          ))}
        </ul>
      )}

      {target && (
        <RaidDialog
          enemy={target}
          drones={drones}
          onCancel={() => setTarget(null)}
          onSend={async (n, pattern, dir) => {
            const error = await onRaid(target, n, pattern, dir);
            if (!error) {
              setTarget(null);
              onChanged();
            }
            return error;
          }}
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
  onSend: (n: number, p: Pattern, dir: number) => Promise<string | null>;
}) {
  const max = Math.min(drones, MAX_ATTACK_DRONES);
  const [n, setN] = useState(Math.min(50, max));
  const [pattern, setPattern] = useState<Pattern>("swarm");
  const [dir, setDir] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const send = async () => {
    if (sending) return;
    setSending(true);
    setSendError(null);
    const error = await onSend(n, pattern, dir);
    setSending(false);
    setSendError(error);
  };

  return (
    <Modal
      title={`Налёт на ${enemy.name}`}
      subtitle="Дроны спишутся сразу. Итог придёт только после того, как друг отыграет защиту."
      onClose={onCancel}
    >
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
        className="mb-4 h-8 w-full cursor-pointer accent-red-500"
      />

      <div className="mb-1 text-xs uppercase tracking-wider text-neutral-400">Рисунок волн</div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {PATTERNS.map((p) => (
          <Button
            key={p.id}
            active={pattern === p.id}
            tone="red"
            onClick={() => setPattern(p.id)}
            className="flex-col items-start gap-0 px-2 text-left"
          >
            <span className="text-xs">{p.name}</span>
            <span className="text-[11px] font-normal text-neutral-500">{p.hint}</span>
          </Button>
        ))}
      </div>

      {(pattern === "swarm" || pattern === "lines") && (
        <>
          <div className="mb-1 text-xs uppercase tracking-wider text-neutral-400">Откуда</div>
          <div className="mb-4 flex gap-2">
            {EDGE_NAMES.map((name, i) => (
              <Button
                key={name}
                size="sm"
                active={dir === i}
                tone="red"
                onClick={() => setDir(i)}
                className="flex-1 px-2"
              >
                {name}
              </Button>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button variant="danger" className="flex-1" onClick={() => void send()} disabled={sending}>
          {sending ? "Отправляю…" : `Отправить ${n} дронов`}
        </Button>
        <Button onClick={onCancel}>Отмена</Button>
      </div>
      {sendError && <p className="mt-2 text-xs text-red-400">{sendError}</p>}
    </Modal>
  );
}
