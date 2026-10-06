// Замораживает движок боя и его отрисовку под номером версии, чтобы повторы
// старых боёв не умирали, когда правила меняются.
//
//   node scripts/freeze-sim.cjs            — нынешний движок под его версией
//   node scripts/freeze-sim.cjs 25 a96234b^ — версию 25 из коммита истории
//
// Запускать ПЕРЕД тем, как поднять SIMULATION_VERSION: копия ложится в
// lib/sims/v<N>/, и повтор боя этой версии берёт её, а не нынешний движок.
// Реестр lib/sims/index.ts пересобирается сам.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const FILES = [
  "engine.ts",
  "attack.ts",
  "base.ts",
  "economy.ts",
  "tuning.ts",
  "replay.ts",
  "avatar.ts",
  "render/index.ts",
  "render/pieces.ts",
  "render/colors.ts",
  "render/light.ts",
  "render/fx.ts",
];

const read = (rev, file) => {
  const rel = `lib/${file}`;
  if (!rev) return fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null;
  try {
    return execFileSync("git", ["show", `${rev}:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
  } catch {
    return null;
  }
};

const [verArg, rev] = process.argv.slice(2);
const tuning = read(rev, "tuning.ts");
const version = verArg ? Number(verArg) : Number(/SIMULATION_VERSION = (\d+)/.exec(tuning ?? "")?.[1]);
if (!version) throw new Error("не понял, какая версия");
const inTuning = Number(/SIMULATION_VERSION = (\d+)/.exec(tuning ?? "")?.[1]);
if (inTuning !== version) throw new Error(`в ${rev ?? "рабочей копии"} версия ${inTuning}, а не ${version}`);

const out = path.join(ROOT, "lib", "sims", `v${version}`);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "render"), { recursive: true });
for (const f of FILES) {
  const src = read(rev, f);
  if (src === null) continue;
  // замороженный код не правят — линтер и проверки по нему не гоняем
  fs.writeFileSync(path.join(out, f), `// Замороженный движок версии ${version}. Не править — сгенерировано scripts/freeze-sim.cjs.\n/* eslint-disable */\n// @ts-nocheck\n` + src);
}
fs.writeFileSync(
  path.join(out, "index.ts"),
  `// Движок и отрисовка боя версии ${version} — для повторов старых боёв.\nexport { buildPlan } from "./attack";\nexport { createBattle, setAim, setFiring, update } from "./engine";\nexport { drawFrame } from "./render";\nexport { decodeTrace } from "./replay";\nexport { SIM } from "./tuning";\n`
);

// реестр: какая версия где лежит; грузится по требованию
const versions = fs
  .readdirSync(path.join(ROOT, "lib", "sims"))
  .map((d) => /^v(\d+)$/.exec(d)?.[1])
  .filter(Boolean)
  .map(Number)
  .sort((a, b) => a - b);
fs.writeFileSync(
  path.join(ROOT, "lib", "sims", "index.ts"),
  `// Реестр замороженных движков: повтор боя прежней версии берёт свой.\n// Пересобирается scripts/freeze-sim.cjs — руками не править.\n\nimport type { Sim } from "../sim";\n\nexport const FROZEN: Record<number, () => Promise<Sim>> = {\n${versions
    .map((v) => `  ${v}: () => import("./v${v}") as unknown as Promise<Sim>,`)
    .join("\n")}\n};\n`
);
console.log(`заморожена версия ${version}${rev ? ` из ${rev}` : ""} → lib/sims/v${version}; в реестре: ${versions.join(", ")}`);
