/*
 * Значок предмета той же картинкой, что и на карте. У пушки и ракетницы —
 * база и башня поверх неё: башня на картинке крупнее базы, поэтому база
 * ужата до 80%, а башня занимает весь значок.
 */

import type { SpriteName } from "@/lib/render/sprites";

const TOWERS: Partial<Record<SpriteName, SpriteName>> = {
  "cannon-base": "cannon-turret",
  "rocket-base": "rocket-turret",
};

export default function SpriteIcon({ name, className = "h-5 w-5" }: { name: SpriteName; className?: string }) {
  const tower = TOWERS[name];
  if (!tower) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/sprites/${name}.png`} alt="" aria-hidden draggable={false} className={`${className} object-contain`} />;
  }
  return (
    <span aria-hidden className={`relative inline-block ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/sprites/${name}.png`} alt="" draggable={false} className="absolute inset-[10%] h-[80%] w-[80%]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/sprites/${tower}.png`} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
    </span>
  );
}
