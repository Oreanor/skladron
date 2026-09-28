/*
 * Прогон боя без браузера: проверяем то, что типы и линтер поймать не могут.
 *
 * Главное здесь — паритет. Защитник играет бой у себя, а засчитывает его
 * сервер, пересчитывая по записи рук. Разойдутся на клетку — игроку покажут
 * один исход, а в базу ляжет другой. Поэтому каждый прогон сверяет
 * сыгранное с пересчитанным дословно: и карту, и счёт, и уцелевшие пушки.
 *
 *   npm run check
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT = path.join(".next", "check");

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  execSync(
    `npx tsc lib/resolve.ts lib/engine.ts lib/attack.ts --outDir ${OUT} ` +
      `--module commonjs --target es2020 --moduleResolution node --skipLibCheck`,
    { stdio: "inherit" }
  );
}

build();
const B = require(path.resolve(OUT, "base.js"));
const A = require(path.resolve(OUT, "attack.js"));
const E = require(path.resolve(OUT, "engine.js"));
const T = require(path.resolve(OUT, "tuning.js"));
const R = require(path.resolve(OUT, "replay.js"));
const S = require(path.resolve(OUT, "resolve.js"));

const GRID = B.GRID;
let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const base = (side = 30) => {
  const c = B.emptyCells();
  const o = ((GRID - side) / 2) | 0;
  for (let y = o; y < o + side; y++)
    for (let x = o; x < o + side; x++) c[B.idx(x, y)] = B.G_BASE;
  return c;
};

const spread = (side, step, kind) => {
  const o = ((GRID - side) / 2) | 0;
  const out = [];
  for (let y = o + 2; y < o + side - 2; y += step)
    for (let x = o + 2; x < o + side - 2; x += step)
      out.push(kind ? { cx: x, cy: y, kind } : { cx: x, cy: y });
  return out;
};

const wave = (pattern, groups, extra = {}) => ({
  pattern, direction: 0, groups, delay: 0, ...extra,
});
const g = (payload, n) => ({ payload, n });
const order = (waves, extra = {}) => ({
  id: "x", from: "a", createdAt: 0, seed: 20260928,
  drones: A.raidTotal(waves),
  pattern: waves[0].pattern, direction: waves[0].direction,
  waves, simulationVersion: T.SIMULATION_VERSION, ...extra,
});

/** Играет бой ровно так, как Battle.tsx: кадр пишется до шага симуляции. */
function play(cells, guns, depots, ord, levels, hands) {
  const s = E.createBattle(cells, guns, depots, A.buildPlan(ord), {
    ...levels, drones: ord.droneLevel ?? 1, seed: ord.seed,
  });
  const frames = [];
  const cap = Math.ceil(T.SIM.unattendedSeconds / T.SIM.step);
  for (let step = 0; step < cap && s.phase === "playing"; step++) {
    hands(s, step);
    const a = s.aim;
    if (frames.length < T.SIM.maxFrames) {
      frames.push(a ? { x: Math.floor(a.x), y: Math.floor(a.y), firing: s.firing } : null);
    }
    E.update(s, T.SIM.step);
  }
  return { trace: R.encodeTrace(frames), out: E.settle(s), phase: s.phase };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Прицел за край карты не уходит: в бою его ставит toCell, а он там даёт null.
const HANDS = [
  ["руки сложены", (s) => { E.setAim(s, null); E.setFiring(s, false); }],
  ["водит прицелом и стреляет", (s, step) => {
    const t = step * T.SIM.step;
    E.setAim(s, {
      x: Math.floor(50 + Math.cos(t * 1.7) * 14) + 0.5,
      y: Math.floor(50 + Math.sin(t * 1.3) * 14) + 0.5,
    });
    E.setFiring(s, step % 7 < 5);
  }],
  ["бьёт по ближайшему дрону", (s) => {
    const d = s.drones.find((x) => !x.hit && x.x >= 0 && x.y >= 0 && x.x < GRID && x.y < GRID);
    if (!d) { E.setAim(s, null); E.setFiring(s, false); return; }
    E.setAim(s, { x: Math.floor(d.x) + 0.5, y: Math.floor(d.y) + 0.5 });
    E.setFiring(s, true);
  }],
  ["тушит пожар", (s) => {
    const i = s.fire.keys().next().value;
    if (i === undefined) { E.setFiring(s, false); return; }
    E.setAim(s, { x: (i % GRID) + 0.5, y: ((i / GRID) | 0) + 0.5 });
    E.setFiring(s, true);
  }],
];

const RAIDS = [
  ["кольца", [wave("rings", [g("plain", 80)])]],
  ["две волны разом, смесь начинок", [
    wave("spiral", [g("plain", 40), g("heavy", 20)]),
    wave("swarm", [g("jammer", 15), g("foamer", 15)], { direction: 2 }),
  ]],
  ["волны с разной задержкой", [
    wave("rings", [g("plain", 30)]),
    wave("sweep", [g("heavy", 20)], { delay: 8 }),
    wave("flower", [g("jammer", 20)], { delay: 20 }),
  ]],
];

const DEFENCE = [...spread(30, 7), ...spread(30, 9, "spray"), ...spread(30, 11, "trap")];
const LEVELS = { guns: 2, sprays: 2, traps: 2, mg: 3, water: 2 };

console.log("— пересчёт на сервере совпадает с тем, что играл защитник —");
for (const [label, waves] of RAIDS) {
  for (const [hname, hands] of HANDS) {
    const ord = order(waves, { droneLevel: 3 });
    const played = play(base(), DEFENCE, [], ord, LEVELS, hands);
    const v = S.resolveBattle({
      cells: base(), guns: DEFENCE, depots: [], order: ord, levels: LEVELS, trace: played.trace,
    });
    check(
      `${label} / ${hname}`,
      same(played.out.result, v.result) &&
        B.encodeRle(played.out.cells) === v.cells &&
        same(played.out.guns, v.guns) &&
        (played.phase !== "lost") === v.won,
      same(played.out.result, v.result) ? "" :
        `сыграно ${JSON.stringify(played.out.result)} против ${JSON.stringify(v.result)}`
    );
  }
}

console.log("\n— счёт роя сходится, бой всегда кончается —");
for (const [label, waves] of RAIDS) {
  const ord = order(waves);
  const v = S.resolveBattle({
    cells: base(), guns: DEFENCE, depots: [], order: ord, levels: LEVELS, trace: "",
  });
  const total = A.raidTotal(waves);
  const acc = v.result.killedByGuns + v.result.killedByMg + v.result.leaked;
  check(`${label}: сбитые и прорвавшиеся равны высланным`, acc === total,
    `учтено ${acc}/${total}`);
}

console.log("\n— ловушка задерживает рой, но не подвешивает бой —");
{
  const ord = order([wave("swarm", [g("plain", 60)])], { seed: 555 });
  const magnets = spread(30, 8, "trap");
  const s = E.createBattle(base(), magnets, [], A.buildPlan(ord), { seed: 555, traps: 3 });
  let peak = 0, steps = 0;
  const cap = Math.ceil(T.SIM.unattendedSeconds / T.SIM.step);
  while (steps < cap && s.phase === "playing") {
    E.update(s, T.SIM.step);
    steps++;
    peak = Math.max(peak, s.drones.filter((d) => d.heldBy > 0).length);
  }
  E.settle(s);
  check("бой с магнитами заканчивается", s.phase !== "playing",
    `фаза ${s.phase} за ${(steps * T.SIM.step).toFixed(1)} c`);
  check("магниты держали рой", peak > 0, `разом висело до ${peak}`);
  check("никто не остался висеть навсегда",
    s.drones.filter((d) => d.heldBy > 0).length === 0);

  const withMagnets = S.resolveBattle({
    cells: base(), guns: [...spread(30, 9), ...spread(30, 13, "trap")], depots: [],
    order: ord, levels: { guns: 1, traps: 2 }, trace: "",
  }).result;
  const gunsOnly = S.resolveBattle({
    cells: base(), guns: spread(30, 9), depots: [], order: ord,
    levels: { guns: 1 }, trace: "",
  }).result;
  check("под магнитом пушки успевают снять больше",
    withMagnets.killedByGuns > gunsOnly.killedByGuns,
    `одни пушки ${gunsOnly.killedByGuns}, с магнитами ${withMagnets.killedByGuns}`);
}

console.log("\n— дежурная смена помогает, но игрока не заменяет —");
{
  const ord = order([wave("swarm", [g("plain", 70)])], { seed: 555 });
  const guns = spread(30, 10);
  const auto = (mg) => S.resolveBattle({
    cells: base(), guns, depots: [], order: ord,
    levels: { guns: 1, mg }, trace: "",
  }).result.killedByMg;
  const low = auto(1), high = auto(10);
  const byHand = play(base(), guns, [], ord, { guns: 1, mg: 1 }, HANDS[2][1])
    .out.result.killedByMg;
  check("смена стреляет без игрока", low > 0, `сбито очередью ${low}`);
  check("с уровнем пулемёта сбивает больше", high > low, `ур.1 — ${low}, ур.10 — ${high}`);
  check("живой игрок всё равно сильнее", byHand > low, `руками ${byHand}, автоматом ${low}`);
}

console.log("\n— начинке не по кому работать: целей её рода на складе нет —");
{
  /** Гоняет бой до конца и смотрит, не завис ли кто и сходится ли счёт. */
  const probe = (label, guns, waves, levels) => {
    const ord = order(waves, { seed: 4242 });
    const total = A.raidTotal(waves);
    const s = E.createBattle(base(), guns, [], A.buildPlan(ord), { seed: 4242, ...levels });
    const cap = Math.ceil(T.SIM.unattendedSeconds / T.SIM.step);
    let steps = 0;
    // «Тупо» — это стоять на месте: следим, что каждый дрон куда-то летит.
    const prev = new Map();
    let stuck = 0;
    while (steps < cap && s.phase === "playing") {
      E.update(s, T.SIM.step);
      steps++;
      if (steps % 60 === 0) {
        for (const d of s.drones) {
          const was = prev.get(d.id);
          if (was && Math.hypot(d.x - was.x, d.y - was.y) < 0.05) stuck++;
          prev.set(d.id, { x: d.x, y: d.y });
        }
      }
    }
    E.settle(s);
    const r = s.result;
    const acc = r.killedByGuns + r.killedByMg + r.leaked;
    check(`${label}: бой кончается`, s.phase !== "playing",
      `фаза ${s.phase} за ${(steps * T.SIM.step).toFixed(1)} c`);
    check(`${label}: никто не пропал мимо счёта`, acc === total, `учтено ${acc}/${total}`);
    check(`${label}: никто не завис на месте`, stuck === 0,
      stuck ? `замерших замеров ${stuck}` : "");
  };

  // глушилка пушек там, где пушек нет вовсе
  probe("глушилка без пушек", spread(30, 9, "spray"),
    [wave("swarm", [g("jammer", 30)])], { sprays: 2 });
  // пена там, где нет огнетушителей
  probe("пена без огнетушителей", spread(30, 9),
    [wave("swarm", [g("foamer", 30)])], { guns: 2 });
  // обе разом на голом складе — ни одной установки
  probe("обе глушилки на голом складе", [],
    [wave("rings", [g("jammer", 20), g("foamer", 20)])], {});
  // только магниты: глушить нечего, а держат они всех подряд
  probe("глушилки против одних магнитов", spread(30, 9, "trap"),
    [wave("swarm", [g("jammer", 25), g("foamer", 25)])], { traps: 2 });
  // смесь на голом складе: обычные жгут, глушилкам работать не по кому
  probe("смесь начинок на голом складе", [],
    [wave("spiral", [g("plain", 20), g("heavy", 10), g("jammer", 10), g("foamer", 10)])], {});
  // установки есть, но их снесут в бою — жертва пропадает из-под глушилки
  probe("жертву сносят прямо из-под глушилки", spread(30, 12),
    [wave("swarm", [g("plain", 40), g("jammer", 20)])], { guns: 1 });
}

console.log("\n— бой прежней версии движка не играется —");
{
  let threw = false;
  try { A.buildPlan(order([wave("rings", [g("plain", 20)])], { simulationVersion: 1 })); }
  catch { threw = true; }
  check("старая версия отвергается", threw);
}

console.log(fails ? `\n${fails} FAILED` : "\nвсё сходится");
process.exit(fails ? 1 : 0);
