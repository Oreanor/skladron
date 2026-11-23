"use client";

/*
 * Шапка телефона: наличные и доход в две строки плюс кнопки шторок. На
 * десктопе её нет — там панели стоят колонкой справа.
 */

import { DraftingCompass, Trophy } from "lucide-react";
import type { Player } from "@/lib/player";
import { useT } from "@/lib/i18n";
import { IconButton, IconMenu, IconTarget, IconUsers } from "../ui";
import IncomeLine from "./IncomeLine";
import type { SheetId } from "./tools";

export default function MobileHeader({
  p,
  raidsIn,
  onSheet,
}: {
  p: Player;
  /** Сколько чужих налётов ждёт в очереди: бейдж на журнале боёв. */
  raidsIn: number;
  onSheet: (id: SheetId) => void;
}) {
  const t = useT();
  return (
    <div className="order-1 flex shrink-0 items-center gap-2 lg:hidden">
      <IncomeLine p={p} className="flex-1" />
      <IconButton label={t("panel.replays")} badge={raidsIn} onClick={() => onSheet("attacks")}>
        <IconTarget />
      </IconButton>
      <IconButton label={t("panel.competitions")} onClick={() => onSheet("competitions")}>
        <Trophy className="h-5 w-5" />
      </IconButton>
      <IconButton label={t("panel.blueprints")} onClick={() => onSheet("blueprints")}>
        <DraftingCompass className="h-5 w-5" />
      </IconButton>
      <IconButton label={t("panel.enemies")} onClick={() => onSheet("enemies")}>
        <IconUsers />
      </IconButton>
      <IconButton label={t("panel.base")} onClick={() => onSheet("menu")}>
        <IconMenu />
      </IconButton>
    </div>
  );
}
