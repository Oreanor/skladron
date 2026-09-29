// Разговор о бою: короткие заметки под повтором. Живут отдельно от Repo —
// их читает и публичная страница по ссылке, где никакого игрока ещё нет.

import { notifyComment } from "./notify";
import { supabase } from "./supabase";
import type { Avatar } from "./avatar";

/** Максимальная длина реплики — как в базе. */
export const RAID_COMMENT_MAX = 500;

export interface BattleComment {
  id: string;
  author: string;
  /** Лицо автора: рядом с подписью под боем. */
  avatar: Avatar;
  body: string;
  createdAt: number;
  /** Своё — значит можно удалить. */
  mine: boolean;
}

interface Row {
  id: string;
  author: string;
  avatar: string | null;
  body: string;
  created_at: string;
  mine: boolean;
}

const toComment = (row: Row): BattleComment => ({
  id: row.id,
  author: row.author,
  avatar: row.avatar,
  body: row.body,
  createdAt: Date.parse(row.created_at),
  mine: row.mine,
});

/** Кто пишет: без входа читать можно, писать — нет. */
export async function signedIn() {
  const db = supabase();
  if (!db) return false;
  const { data } = await db.auth.getUser();
  return Boolean(data.user);
}

export async function loadComments(attackId: string): Promise<BattleComment[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.rpc("battle_comments", { target: attackId });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toComment);
}

export async function addComment(attackId: string, message: string): Promise<BattleComment> {
  const db = supabase();
  if (!db) throw new Error("Supabase не настроен");
  const { data, error } = await db.rpc("add_battle_comment", {
    target: attackId,
    message,
  });
  if (error) throw error;
  const row = (data as Row[] | null)?.[0];
  if (!row) throw new Error("comment not saved");
  return toComment(row);
}

export async function deleteComment(id: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.rpc("delete_battle_comment", { comment_id: id });
  if (error) throw error;
}

/** Сохранить реплику и известить второго участника (если привязан Telegram). */
export async function postRaidComment(attackId: string, message: string): Promise<BattleComment> {
  const body = message.trim().slice(0, RAID_COMMENT_MAX);
  if (!body) throw new Error("empty comment");
  const fresh = await addComment(attackId, body);
  notifyComment(attackId, fresh.id);
  return fresh;
}
