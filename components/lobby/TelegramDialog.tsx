"use client";

/*
 * Привязка телеграма. Окно само спрашивает у сервера код и привязан ли уже
 * бот: раньше лобби держало это у себя и грузило одинаковым кодом из меню
 * десктопа и из шторки телефона.
 */

import { useEffect, useState } from "react";
import type { Repo } from "@/lib/repo";
import { useT } from "@/lib/i18n";
import { Button, Modal } from "../ui";

/** Имя бота из настроек сборки: без него привязывать некуда. */
const TG_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT;

export default function TelegramDialog({ repo, onClose }: { repo: Repo; onClose: () => void }) {
  const t = useT();
  const [telegram, setTelegram] = useState<{ code: string; linked: boolean } | null>(null);

  // Пока окно открыто — периодически и по возврату во вкладку спрашиваем
  // статус: Start в боте жмут в другом окне, и без опроса кнопка так и
  // осталась бы «Привязать».
  useEffect(() => {
    let alive = true;
    const pull = () => {
      void repo
        .telegram()
        .then((row) => alive && setTelegram(row))
        .catch(() => alive && setTelegram(null));
    };
    pull();
    const tick = window.setInterval(pull, 2500);
    const onShow = () => {
      if (!document.hidden) pull();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      alive = false;
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [repo]);

  return (
    <Modal
      title={t("tg.title")}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          {telegram?.linked ? (
            <Button
              variant="danger"
              onClick={() => {
                void repo.telegramUnlink().then(() => setTelegram({ code: telegram.code, linked: false }));
              }}
            >
              {t("tg.unlink")}
            </Button>
          ) : (
            telegram &&
            TG_BOT && (
              <a
                href={`https://t.me/${TG_BOT}?start=${encodeURIComponent(telegram.code)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="build">{t("tg.link")}</Button>
              </a>
            )
          )}
          <Button variant={telegram?.linked || !TG_BOT ? "build" : "outline"} onClick={onClose}>
            {t("common.ok")}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-neutral-300">{telegram?.linked ? t("tg.linked") : t("tg.explain")}</p>
      {!telegram?.linked && TG_BOT && (
        <p className="mt-2 text-xs text-neutral-500">{t("tg.afterStart")}</p>
      )}
      {!TG_BOT && <p className="mt-2 text-xs text-neutral-500">{t("tg.noBot")}</p>}
    </Modal>
  );
}
