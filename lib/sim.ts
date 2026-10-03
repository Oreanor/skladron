// Движок боя для повтора: нынешний или замороженный той версии, по которой
// бой шёл. Повтор не хранит сам бой — он прогоняет его заново по слепку и
// записи рук, — и без своей версии движка старые бои не проигрывались бы.

import { buildPlan } from "./attack";
import { createBattle, setAim, setFiring, update } from "./engine";
import { drawFrame } from "./render";
import { decodeTrace } from "./replay";
import { SIM, SIMULATION_VERSION } from "./tuning";
import { FROZEN } from "./sims";

/** Всё, что нужно повтору от движка. У замороженных версий тот же набор. */
export interface Sim {
  buildPlan: typeof buildPlan;
  createBattle: typeof createBattle;
  setAim: typeof setAim;
  setFiring: typeof setFiring;
  update: typeof update;
  drawFrame: typeof drawFrame;
  decodeTrace: typeof decodeTrace;
  SIM: typeof SIM;
}

const live: Sim = { buildPlan, createBattle, setAim, setFiring, update, drawFrame, decodeTrace, SIM };

/** Движок этой версии; нет такой — null, повтор тогда не проиграть. */
export async function simFor(version: number): Promise<Sim | null> {
  if (version === SIMULATION_VERSION) return live;
  const load = FROZEN[version];
  return load ? load() : null;
}
