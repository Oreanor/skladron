// Реестр замороженных движков: повтор боя прежней версии берёт свой.
// Пересобирается scripts/freeze-sim.cjs — руками не править.

import type { Sim } from "../sim";

export const FROZEN: Record<number, () => Promise<Sim>> = {
  22: () => import("./v22") as unknown as Promise<Sim>,
  23: () => import("./v23") as unknown as Promise<Sim>,
  24: () => import("./v24") as unknown as Promise<Sim>,
  25: () => import("./v25") as unknown as Promise<Sim>,
  26: () => import("./v26") as unknown as Promise<Sim>,
  27: () => import("./v27") as unknown as Promise<Sim>,
  28: () => import("./v28") as unknown as Promise<Sim>,
};
