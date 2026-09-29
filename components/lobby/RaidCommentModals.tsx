"use client";

import { useState } from "react";
import type { AttackOrder } from "@/lib/attack";
import { RAID_COMMENT_MAX } from "@/lib/comments";
import { useT } from "@/lib/i18n";
import { Button, Modal, inputClass } from "../ui";

/** Перед боем: записка нападающего и необязательный быстрый ответ. */
export function RaidOpenerModal({
  order,
  onDone,
}: {
  order: AttackOrder;
  onDone: (reply: string) => void;
}) {
  const t = useT();
  const [reply, setReply] = useState("");

  return (
    <Modal
      title={t("raidComment.openerTitle", { from: order.from })}
      subtitle={t("raidComment.openerSubtitle")}
      onClose={() => onDone("")}
      footer={
        <Button className="w-full" onClick={() => onDone(reply.trim())}>
          {t("common.ok")}
        </Button>
      }
    >
      <p className="mb-3 whitespace-pre-wrap text-sm text-neutral-200">{order.opener}</p>
      <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-400">
        {t("raidComment.replyLabel")}
      </label>
      <input
        value={reply}
        onChange={(e) => setReply(e.target.value.slice(0, RAID_COMMENT_MAX))}
        placeholder={t("raidComment.replyPlaceholder")}
        className={inputClass}
        maxLength={RAID_COMMENT_MAX}
      />
    </Modal>
  );
}

/** После отбитого удалённого налёта — короткая реплика или пропуск. */
export function PostRaidCommentModal({
  attackId,
  onDone,
}: {
  attackId: string;
  onDone: (body: string | null) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = (body: string | null) => {
    if (busy) return;
    onDone(body);
  };

  const send = () => {
    const body = draft.trim();
    if (!body) {
      finish(null);
      return;
    }
    setBusy(true);
    finish(body);
  };

  return (
    <Modal
      title={t("raidComment.afterTitle")}
      subtitle={t("raidComment.afterSubtitle")}
      onClose={() => finish(null)}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="build" className="flex-1" disabled={busy} onClick={() => send()}>
            {t("raidComment.send")}
          </Button>
          <Button disabled={busy} onClick={() => finish(null)}>
            {t("raidComment.skip")}
          </Button>
        </div>
      }
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, RAID_COMMENT_MAX))}
        placeholder={t("raidComment.afterPlaceholder")}
        className={inputClass}
        maxLength={RAID_COMMENT_MAX}
        disabled={busy}
      />
    </Modal>
  );
}
