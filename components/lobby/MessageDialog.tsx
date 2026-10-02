"use client";

/*
 * Разговор с соперником. Не про налёт, а вообще: завёл соперника — можешь
 * писать. Отдельно от реплик к бою (те живут при самом бое и без него
 * бессмысленны) — здесь просто переписка двоих.
 *
 * Открывается — сразу отмечаем прочитанным: раз окно на экране, значит
 * увидел. Отправка кладёт реплику в список, не дожидаясь перечитывания, —
 * иначе своё же слово появлялось бы с задержкой в полсекунды.
 */

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { Enemy } from "@/lib/enemy";
import type { Message } from "@/lib/attack";
import { useT } from "@/lib/i18n";
import { explainAlone } from "@/lib/errors";
import Avatar from "../Avatar";
import { Button, IconButton, Modal, inputClass } from "../ui";

/** Длиннее сервер и не примет: в send_message то же число. */
export const MESSAGE_MAX = 500;

export default function MessageDialog({
  enemy,
  load,
  onSend,
  onClose,
}: {
  enemy: Enemy;
  load: (email: string) => Promise<Message[]>;
  onSend: (email: string, body: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const t = useT();
  const [thread, setThread] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    load(enemy.email)
      .then((rows) => {
        if (alive) setThread(rows);
      })
      .catch((e) => {
        if (alive) {
          setThread([]);
          setError(explainAlone(e, t));
        }
      });
    return () => {
      alive = false;
    };
  }, [enemy.email, load, t]);

  // Свежее внизу, как в любом разговоре: подкручиваем к хвосту.
  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSend(enemy.email, body);
    setBusy(false);
    if (err) {
      setError(explainAlone(err, t));
      return;
    }
    setDraft("");
    setThread((was) => [
      ...(was ?? []),
      { id: `local-${Date.now()}`, mine: true, body, at: Date.now(), seen: false },
    ]);
  };

  const when = (at: number) =>
    new Date(at).toLocaleString(undefined, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Modal
      title={t("chat.with", { name: enemy.name })}
      subtitle={enemy.email}
      onClose={onClose}
      footer={
        <>
          <div className="flex w-full min-w-0 items-center gap-2">
            <input
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
              placeholder={t("chat.placeholder")}
              className={`${inputClass} min-w-0 flex-1`}
              maxLength={MESSAGE_MAX}
            />
            <IconButton
              label={t("chat.send")}
              disabled={busy || !draft.trim()}
              onClick={() => void send()}
              className="h-9 w-9 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </IconButton>
          </div>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </>
      }
    >
      <div className="max-h-[50vh] min-h-[8rem] space-y-2 overflow-y-auto pr-1">
        {thread === null ? (
          <p className="text-sm text-neutral-500">{t("app.loading")}</p>
        ) : thread.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("chat.empty")}</p>
        ) : (
          thread.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.mine ? "justify-end" : "justify-start"}`}>
              {!m.mine && (
                <Avatar
                  avatar={enemy.avatar ?? null}
                  name={enemy.name}
                  email={enemy.email}
                  size="sm"
                  className="mt-0.5"
                />
              )}
              <div
                className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${
                  m.mine
                    ? "bg-emerald-500/15 text-emerald-100"
                    : "bg-neutral-800 text-neutral-200"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className="mt-1 font-mono text-[10px] text-neutral-500">{when(m.at)}</p>
              </div>
            </div>
          ))
        )}
        <div ref={tailRef} />
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}
