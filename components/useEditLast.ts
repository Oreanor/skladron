"use client";

/*
 * Правка последнего своего сообщения, как везде: в пустом поле стрелка вверх
 * поднимает его текст в поле, Enter сохраняет правку, Esc — отменяет. Общая
 * у переписки с соперником и у обсуждения боя.
 */

import { useState, type KeyboardEvent } from "react";

export function useEditLast<T extends { id: string; body: string; mine: boolean }>(
  items: readonly T[] | null,
  draft: string,
  setDraft: (text: string) => void
) {
  /** Какое сообщение сейчас правим; null — пишем новое. */
  const [editing, setEditing] = useState<string | null>(null);

  const cancel = () => {
    setEditing(null);
    setDraft("");
  };

  /** Повесить на onKeyDown поля. true — клавишу забрали себе. */
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" && !editing && draft === "" && items) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (!items[i].mine) continue;
        e.preventDefault();
        setEditing(items[i].id);
        setDraft(items[i].body);
        return true;
      }
    }
    if (e.key === "Escape" && editing) {
      // окно вокруг по Esc закрывается — здесь Esc значит «отменить правку»
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return true;
    }
    return false;
  };

  return { editing, setEditing, cancel, onKey };
}
