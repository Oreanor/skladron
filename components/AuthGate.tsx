"use client";

import { useEffect, useState } from "react";
import { cloudEnabled, supabase } from "@/lib/supabase";
import Lobby from "./Lobby";
import { Button } from "./ui";
import { useT } from "@/lib/i18n";

export interface Account {
  email: string | null;
  name: string | null;
}

/**
 * Без ключей Supabase пускает играть локально. С ключами — требует входа
 * через Google и отдаёт аккаунт в лобби.
 */
export default function AuthGate() {
  const t = useT();
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
    return <div className="p-6 text-sm text-neutral-500">{t("app.checkingSignIn")}</div>;
  }

  if (cloudEnabled && state === "anon") {
    return (
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-700">
        {/*
          Заставка нарисована в четырёх пропорциях, логотип в каждой врисован
          под свой кроп. Выбираем по пропорциям экрана, а не по ширине: планшет
          в портрете и телефон в альбоме — это разные картинки при одной ширине.
        */}
        <picture>
          <source media="(min-aspect-ratio: 3/2)" srcSet="/hero-wide.webp" />
          <source media="(min-aspect-ratio: 7/8)" srcSet="/hero-box.webp" />
          <source media="(min-aspect-ratio: 1/2)" srcSet="/hero-portrait.webp" />
          <img
            src="/hero-tall.webp"
            alt="Skladron"
            // Логотип врисован в арт у нижнего края, поэтому кроп якорим по
            // низу. В альбомных вариантах он ещё и справа — там якорь правый,
            // иначе object-cover срезает ему край.
            className="h-full w-full object-cover object-bottom [@media(min-aspect-ratio:7/8)]:object-right-bottom"
          />
        </picture>

        {/* пояснение сверху — внизу его место занял логотип с арта */}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/90 via-black/60 to-transparent px-4 pb-12 pt-4 text-center sm:px-6 sm:pb-16 sm:pt-5">
          <p className="mx-auto max-w-md text-sm text-neutral-200">
            {t("auth.pitch")}
          </p>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 text-center sm:px-6 sm:pt-16 lg:pb-6 [@media(min-aspect-ratio:7/8)]:text-left">
          <Button
            variant="danger"
            size="lg"
            onClick={signIn}
            className="w-full uppercase tracking-wider shadow-lg sm:w-auto"
          >
            {t("auth.google")}
          </Button>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  return <Lobby account={account} onSignOut={signOut} />;
}
