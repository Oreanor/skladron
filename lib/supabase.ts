import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Без ключей играем локально — этап 1 продолжает работать как был. */
export const cloudEnabled = Boolean(url && key);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  if (!client) {
    client = createClient(url as string, key as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
