"use client";

import { useState } from "react";
import type { AttackOrder } from "@/lib/attack";
import { RAID_COMMENT_MAX } from "@/lib/comments";
import { useT } from "@/lib/i18n";
import { Button, Modal, inputClass } from "../ui";
import Avatar from "../Avatar";

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
        <Button variant="build" onClick={() => onDone(reply.trim())}>
          {t("common.ok")}
        </Button>
      }
    >
      {/* Лицо крупно: перед боем это единственное, что видно о сопернике. */}
      <div className="mb-4 flex items-start gap-4">
        <Avatar avatar={order.avatar ?? null} name={order.from} size="lg" />
        <p className="whitespace-pre-wrap text-sm text-neutral-200">{order.opener}</p>
      </div>
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
  onDone,
}: {
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
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="build" disabled={busy} onClick={() => send()}>
            {t("raidComment.send")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => finish(null)}>
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
