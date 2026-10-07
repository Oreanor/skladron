/*
 * Иконки, которых нет в lucide. Сама графика лежит рядом в .svg — правится
 * любым редактором, — а здесь ей только задаётся размер и цвет: обводка
 * берёт currentColor, так что иконка красится тем же, чем и текст рядом.
 */

import Balloon from "./balloon.svg";
import Drone from "./drone.svg";
import Menu from "./menu.svg";
import Target from "./target.svg";
import Users from "./users.svg";

const SIZE = "h-5 w-5";

export const IconTarget = () => <Target className={SIZE} />;
export const IconUsers = () => <Users className={SIZE} />;
export const IconMenu = () => <Menu className={SIZE} />;
export const IconDrone = () => <Drone className={SIZE} />;
export const IconBalloon = () => <Balloon className={SIZE} />;

/**
 * Золотая монетка перед наличными. Не из .svg рядом: у неё свои цвета, а не
 * currentColor, — золото должно оставаться золотом в любой строке.
 */
export const IconCoin = ({ className = "h-4 w-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 14 16" className={className} aria-hidden>
    <ellipse cx="7" cy="8" rx="6.2" ry="7.2" fill="#f2c94c" stroke="#a87412" strokeWidth="1.2" />
    <ellipse cx="7" cy="8" rx="3.7" ry="4.7" fill="none" stroke="#c9952a" strokeWidth="1" />
    <ellipse cx="5" cy="5" rx="1.3" ry="1.9" fill="#fff4c2" opacity="0.8" />
  </svg>
);
