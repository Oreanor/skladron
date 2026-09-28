"use client";

import { useState } from "react";
import { MAX_BASE_NAME } from "@/lib/player";

/**
 * Имя склада прямо в шапке. Кнопки «переименовать» нет: щёлкнул по имени —
 * поле стало инпутом, Enter сохраняет, Escape отменяет.
 */
export default function BaseName({
  value,
  placeholder,
  title,
  className = "",
  onCommit,
}: {
  value: string;
  placeholder: string;
  title: string;
  className?: string;
  onCommit: (name: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== value) void onCommit(name);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={MAX_BASE_NAME}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        className={`min-w-0 truncate rounded border border-amber-500 bg-neutral-950 px-2 py-0.5 text-neutral-100 outline-none ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={start}
      className={`min-w-0 truncate rounded border border-transparent px-2 py-0.5 text-left transition hover:border-neutral-700 hover:bg-neutral-800/60 ${
        value ? "text-neutral-100" : "text-neutral-500"
      } ${className}`}
    >
      {value || placeholder}
    </button>
  );
}
