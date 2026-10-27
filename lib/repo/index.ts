// Хранилище игрока: облачное, если Supabase настроен, иначе локальное.

import { cloudEnabled } from "../supabase";
import { CloudRepo } from "./cloud";
import { LocalRepo } from "./local";
import type { Repo } from "./types";

export type { Income, Repo } from "./types";
export { publicReplay } from "./cloud";

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (!repo) repo = cloudEnabled ? new CloudRepo() : new LocalRepo();
  return repo;
}
