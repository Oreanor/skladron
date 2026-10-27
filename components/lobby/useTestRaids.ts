// Пробные налёты по ссылке: ?raid=flower,sweep&n=220 кладёт в очередь по
// налёту на каждый названный режим. Нужны, чтобы посмотреть новую раскладку
// на своём складе, не дожидаясь бота. Параметр сразу убираем из адреса —
// иначе обновление страницы сыпало бы новые рои.

import { useEffect, type RefObject } from "react";
import { PATTERNS, makeOrder, type Pattern } from "@/lib/attack";
import type { Key } from "@/lib/i18n/dict";
import { notifyTestRaid } from "@/lib/notify";
import type { Player } from "@/lib/player";
import { RAID } from "@/lib/tuning";
import { BOT_COUNT } from "./tools";
import type { LobbyCore } from "./useBaseSync";

export function useTestRaids(core: LobbyCore, player: RefObject<Player | null>, ready: boolean) {
  useEffect(() => {
    const cur = player.current;
    if (!ready || !cur) return;
    const { t } = core;
    const q = new URLSearchParams(window.location.search);
    const list = (q.get("raid") ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => (PATTERNS as string[]).includes(name)) as Pattern[];
    if (!list.length) return;
    const size = Math.min(RAID.suggestMax, Math.max(30, Number(q.get("n")) || 200));
    for (const pattern of list) {
      cur.incoming.push(
        makeOrder(t(`bot.${(Math.random() * BOT_COUNT) | 0}` as Key), [
          {
            pattern,
            direction: (Math.random() * 4) | 0,
            delay: 0,
            groups: [{ payload: "plain", n: size }],
          },
        ])
      );
    }
    window.history.replaceState({}, "", window.location.pathname);
    core.touch();
    core.say(t("raid.testQueued", { count: list.length, size }));
    notifyTestRaid(size * list.length);
    // разовый запуск: как только игрок загрузился, налёты уже в очереди
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
