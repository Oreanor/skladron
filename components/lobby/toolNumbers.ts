// Числа на кнопках инструментов: цена и то, что стоит в подсказке. Всё,
// что прокачивается, показываем по уровню игрока.

import { depotCost, gunCost } from "@/lib/build";
import {
  balloonCount,
  balloonRange,
  rocketRange,
  rocketTempo,
  sprayRange,
  trapRange,
} from "@/lib/engine";
import type { Player } from "@/lib/player";
import { ROCKET } from "@/lib/tuning";
import { TOOLS, isBuildKind } from "./tools";

type ToolItem = (typeof TOOLS)[number];

/** Секунды показываем с одним знаком и без хвостового нуля. */
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Цену спрашиваем у стройки — у той самой, что потом и спишет. Раньше
 * тут стоял свой такой же перебор по видам, и ценник на кнопке мог
 * разойтись с тем, что снимут с кошелька.
 */
export const toolPrice = (levels: Player["levels"], item: ToolItem) => {
  if (isBuildKind(item.id)) return gunCost(levels, item.id);
  if (item.id === "drones") return depotCost(levels);
  return item.vars.cost;
};

/** Числа для подсказки: что прокачано, то показываем по уровню. */
export const toolVars = (levels: Player["levels"], item: ToolItem) => {
  if (item.id === "rocket")
    return {
      ...item.vars,
      range: Math.round(rocketRange({ rocketLevel: levels.rockets })),
      // Перезарядку показываем прокачанную, как и дальность: одна цифра
      // по уровню, другая по первому — это читалось бы как опечатка.
      reload: round1(ROCKET.cooldown / rocketTempo({ rocketLevel: levels.rockets })),
    };
  if (item.id === "spray")
    return { ...item.vars, range: Math.round(sprayRange({ sprayLevel: levels.sprays })) };
  if (item.id === "trap")
    return { ...item.vars, range: Math.round(trapRange({ trapLevel: levels.traps })) };
  if (item.id === "balloon")
    return {
      ...item.vars,
      range: Math.round(balloonRange({ balloonLevel: levels.balloons })),
      count: balloonCount(levels.balloons),
    };
  if (item.id === "drones") return { ...item.vars, cost: toolPrice(levels, item) };
  return item.vars;
};
