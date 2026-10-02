"use client";

/*
 * Дронов на складе нет — налёт и разведку отправлять некем. Вместо пустого
 * окна налёта, где по умолчанию стояло больше, чем есть, говорим прямо и
 * сразу ведём к покупке.
 */

import { useT } from "@/lib/i18n";
import { Button, Modal } from "../ui";

export default function NeedDrones({
  what,
  onBuy,
  onClose,
}: {
  /** Куда собирались лететь: от этого — пояснение. */
  what: "raid" | "scout";
  /** Перейти к покупке дронов на карте склада. */
  onBuy: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Modal
      title={t("drones.needTitle")}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="build" onClick={onBuy}>
            {t("drones.buy")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-neutral-300">
        {t(what === "raid" ? "drones.needRaid" : "drones.needScout")}
      </p>
    </Modal>
  );
}
