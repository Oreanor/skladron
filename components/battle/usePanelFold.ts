"use client";

/*
 * Свёрнута ли боковая панель боя или повтора — как в лобби, клик по
 * заголовку. Помним у себя в браузере: свернул «Типы дронов» один раз — и в
 * следующем бою они свёрнуты. Хранилище бывает недоступно (приватное окно)
 * — тогда просто живём до конца страницы.
 */

import { useEffect, useState } from "react";

const KEY = "wb.battlePanels.v1";

function read(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function usePanelFold(id: string): [boolean, () => void] {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    setFolded(Boolean(read()[id]));
  }, [id]);
  const toggle = () => {
    setFolded((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: next }));
      } catch {
        // не сохранилось — свёрнуто до конца страницы
      }
      return next;
    });
  };
  return [folded, toggle];
}
