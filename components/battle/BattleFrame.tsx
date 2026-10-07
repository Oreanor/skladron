"use client";

/*
 * Окно поля боя — общее у самого боя и у его повтора, чтобы они не
 * разъезжались ни размером, ни раскладкой. Варианты вида:
 *
 *   battle — окно поверх всего; по фону не закрывается: бой не бросают
 *            случайным кликом мимо.
 *   replay — то же окно, клик по фону закрывает.
 *   page   — без окна: отдельная страница повтора по ссылке.
 *
 * Внутри — квадратная карта слева и колонка со счётом справа. Карта —
 * квадрат, вписанный в то, что осталось: сторона — меньшее из ширины и
 * высоты левой части. Под картой, ровно по её ширине, можно положить
 * полоску (ползунок повтора). В колонке сверху то, что не прокручивается
 * (кнопки), под ним — прокручиваемые панели. На телефоне колонки нет: под
 * картой то, что передано в mobile.
 */

import type { ReactNode } from "react";

export type FrameVariant = "battle" | "replay" | "page";

/**
 * Как часто бой и повтор перерисовывают подложку карты, мс. Огонь рисуется
 * поверх каждый кадр — подложка лишь чернит догоревшее, и чаще ни к чему.
 */
export const MAP_EVERY_MS = 250;

/** Само окно: затемнённый фон и карточка почти во весь экран. */
export function BattleWindow({
  variant,
  onDismiss,
  children,
}: {
  variant: FrameVariant;
  /** Клик по фону — только у повтора. */
  onDismiss?: () => void;
  children: ReactNode;
}) {
  if (variant === "page") return <>{children}</>;
  return (
    <div
      className="fixed inset-0 z-40 flex bg-black/80 p-2 sm:p-4"
      onMouseDown={
        variant === "replay" && onDismiss
          ? (e) => {
              if (e.target === e.currentTarget) onDismiss();
            }
          : undefined
      }
    >
      <div className="m-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 p-3 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export default function BattleFrame({
  variant,
  onDismiss,
  map,
  under,
  underHeight = "1rem",
  mobile,
  head,
  panels,
  foot,
  cover,
}: {
  variant: FrameVariant;
  onDismiss?: () => void;
  /**
   * Накладка на всё окно — итог боя. Не на квадрат карты: на телефоне он
   * маленький, и итог прокручивался в окошке размером с карту.
   */
  cover?: ReactNode;
  /** Карта и всё, что лежит поверх неё: подсказки, итог. Внутри квадрата. */
  map: ReactNode;
  /** Полоска под картой по её ширине — ползунок повтора. */
  under?: ReactNode;
  /** Её высота: квадрат ужимается, чтобы она влезла. */
  underHeight?: string;
  /** Под картой на телефоне: счёт строкой, кнопки, разговор. */
  mobile?: ReactNode;
  /** Верх колонки, который не прокручивается. */
  head?: ReactNode;
  /** Панели колонки — прокручиваются. */
  panels: ReactNode;
  /**
   * Низ окна, который не прокручивается: кнопки повтора. На десктопе — под
   * панелями колонки, на телефоне — в самом низу, под счётом.
   */
  foot?: ReactNode;
}) {
  const side = under ? `min(100cqw, calc(100cqh - ${underHeight}))` : "min(100cqw, 100cqh)";
  return (
    <BattleWindow variant={variant} onDismiss={onDismiss}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Колонка со счётом жмётся вместе с окном: на узком десктопе поле боя
            важнее, чем ровная ширина цифр. */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(12rem,20vw,18rem)] lg:gap-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
              <div className="flex flex-col" style={{ width: side }}>
                {/* overflow-hidden — не украшение. Блок с aspect-ratio растёт
                    под содержимое, если оно выше; холст карты подгоняется под
                    рамку, рамка с бордюром на 2 точки выше холста — и они
                    раздували друг друга без конца, пока бой не вставал. */}
                <div className="relative aspect-square w-full overflow-hidden">{map}</div>
                {under}
              </div>
            </div>
            {mobile && <div className="flex shrink-0 flex-col gap-2 lg:hidden">{mobile}</div>}
            {foot && <div className="shrink-0 lg:hidden">{foot}</div>}
          </div>

          <aside className="hidden min-h-0 flex-col gap-4 text-sm lg:flex">
            {head}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {panels}
            </div>
            {foot && <div className="shrink-0">{foot}</div>}
          </aside>
        </div>
        {/* Прокрутка — у всей накладки, а внутри блок по центру через m-auto:
            при justify-center длинный итог уходил верхом за край, и его было
            не докрутить. */}
        {cover && (
          <div className="absolute inset-0 z-30 flex flex-col overflow-y-auto rounded-md bg-neutral-950/90 p-4 sm:p-6">
            <div className="m-auto w-full max-w-sm">{cover}</div>
          </div>
        )}
      </div>
    </BattleWindow>
  );
}
