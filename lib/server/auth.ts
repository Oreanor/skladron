// Кто зовёт серверную ручку. Токен проверяем у самого Supabase — на слово
// клиенту не верим. Было скопировано в каждую ручку, которой это нужно.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Id вошедшего игрока по заголовку Authorization: Bearer …, или null. */
export async function caller(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !URL || !ANON) return null;
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await db.auth.getUser(token);
  return data.user?.id ?? null;
}
