"use client";

// Шторка «Склад» на телефоне: имя склада, лицо и настройки. На десктопе
// всё это живёт в шапке и в меню аккаунта.

import type { Account } from "../AuthGate";
import { SettingsList } from "../AccountMenu";
import AvatarView from "../Avatar";
import { SectionTitle } from "../ui";
import { useT } from "@/lib/i18n";
import type { Player } from "@/lib/player";
import BaseName from "./BaseName";

export default function MenuSheet({
  p,
  account,
  onRename,
  onAvatar,
  onTelegram,
  onRules,
  onStats,
  onRestart,
  onSignOut,
}: {
  p: Player;
  account: Account | null;
  onRename: (name: string) => void;
  onAvatar: () => void;
  onTelegram: () => void;
  onRules: () => void;
  onStats: () => void;
  onRestart: () => void;
  onSignOut?: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-5">
      {p.founded && (
        <div>
          {/*
            Шторка и так зовётся «Склад» — повторять это над полем
            незачем: там стоит имя, о том и заголовок.
          */}
          <div className="mb-2">
            <SectionTitle>{t("panel.baseName")}</SectionTitle>
          </div>
          <BaseName
            value={p.name}
            placeholder={t("base.unnamed")}
            title={t("base.rename")}
            className="w-full font-semibold"
            onCommit={onRename}
          />
        </div>
      )}
      <div>
        <div className="mb-2">
          <SectionTitle>{t("panel.account")}</SectionTitle>
        </div>
        {/*
          Лицо здесь же, рядом с именем: на телефоне шапки с аккаунтом
          нет, и увидеть своё лицо больше негде. По тычку открывается
          та же выбиралка, что и на десктопе.
        */}
        <button
          type="button"
          onClick={onAvatar}
          className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded px-2 py-1 text-left transition hover:bg-neutral-800"
        >
          <AvatarView
            avatar={p.avatar}
            name={account?.name ?? null}
            email={account?.email ?? null}
            size="sm"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-neutral-100">
              {account?.name ?? account?.email ?? t("app.localMode")}
            </span>
            <span className="block truncate text-xs text-neutral-500">{t("avatar.change")}</span>
          </span>
        </button>
        {/* Пункта «выбрать аватар» тут нет: он уже кнопкой выше. */}
        <SettingsList
          onTelegram={onTelegram}
          onRules={onRules}
          onStats={onStats}
          onRestart={onRestart}
          onSignOut={onSignOut}
        />
      </div>
    </div>
  );
}
