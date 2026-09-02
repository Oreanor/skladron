// Разговор о бою: короткие заметки под повтором. Живут отдельно от Repo —
// их читает и публичная страница по ссылке, где никакого игрока ещё нет.

import { supabase } from "./supabase";

export interface BattleComment {
  id: string;
  author: string;
  body: string;
  createdAt: number;
  /** Своё — значит можно удалить. */
  mine: boolean;
}

interface Row {
  id: string;
  author: string;
  body: string;
  created_at: string;
  mine: boolean;
}

const toComment = (row: Row): BattleComment => ({
  id: row.id,
  author: row.author,
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
