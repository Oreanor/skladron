/*
 * Иконки, которых нет в lucide. Сама графика лежит рядом в .svg — правится
 * любым редактором, — а здесь ей только задаётся размер и цвет: обводка
 * берёт currentColor, так что иконка красится тем же, чем и текст рядом.
 */

import Drone from "./drone.svg";
import Menu from "./menu.svg";
import Target from "./target.svg";
import Users from "./users.svg";

const SIZE = "h-5 w-5";

export const IconTarget = () => <Target className={SIZE} />;
export const IconUsers = () => <Users className={SIZE} />;
export const IconMenu = () => <Menu className={SIZE} />;
export const IconDrone = () => <Drone className={SIZE} />;
