"use client";

import { useEffect, useState } from "react";
import { cloudEnabled, supabase } from "@/lib/supabase";
import Lobby from "./Lobby";

export interface Account {
  email: string | null;
  name: string | null;
}

/**
 * Без ключей Supabase пускает играть локально. С ключами — требует входа
 * через Google и отдаёт аккаунт в лобби.
 */
export default function AuthGate() {
  const [state, setState] = useState<"checking" | "anon" | "signed">(
    cloudEnabled ? "checking" : "anon"
  );
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudEnabled) return;
    const db = supabase();
    if (!db) return;

    db.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) {
        setAccount({ email: u.email ?? null, name: u.user_metadata?.full_name ?? null });
        setState("signed");
      } else {
        setState("anon");
      }
    });

    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      if (u) {
        setAccount({ email: u.email ?? null, name: u.user_metadata?.full_name ?? null });
        setState("signed");
      } else {
        setAccount(null);
        setState("anon");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    const db = supabase();
    if (!db) return;
    const { error: e } = await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (e) setError(e.message);
  };

  const signOut = () => {
    supabase()?.auth.signOut();
  };

  if (state === "checking") {
    return <div className="p-6 text-sm text-neutral-500">Проверяем вход…</div>;
  }

  if (cloudEnabled && state === "anon") {
    return (
      <div className="relative overflow-hidden rounded-lg border border-neutral-700">
        {/* заставка: широкая на десктопе, вытянутая на телефоне */}
        <picture>
          <source media="(max-width: 640px)" srcSet="/hero-portrait.png" />
          <img
            src="/hero-wide.png"
            alt="Skladron — склад под налётом дронов"
            className="h-[70vh] w-full object-cover sm:h-auto sm:max-h-[70vh]"
          />
        </picture>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent p-6 pt-24 text-center">
          <p className="mx-auto mb-5 max-w-md text-sm text-neutral-300">
            Склад, кредиты и повреждения хранятся в аккаунте — чтобы враги могли присылать
            дронов, пока тебя нет.
          </p>
          <button
            onClick={signIn}
            className="rounded bg-red-600 px-6 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition hover:bg-red-500"
          >
            Войти через Google
          </button>
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  return <Lobby account={account} onSignOut={signOut} />;
}
