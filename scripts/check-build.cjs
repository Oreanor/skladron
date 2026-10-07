/*
 * Стройка: тратит кредиты — значит должна проверяться.
 *
 * Всё, что списывает деньги на складе, живёт в lib/build.ts. Проверяем два
 * уговора, на которых там всё держится:
 *   отказ не трогает склад вовсе — ни клетки, ни кошелёк;
 *   согласие списывает ровно ту цену, которую само и назвало.
 * Плюс цены по уровням: прокачка дорожает сама и дорожает всё, что купишь
 * потом, и сойтись это должно с тем, что покажет кнопка.
 *
 *   npm run check:build
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.join('.next', 'check-build');
fs.rmSync(OUT, { recursive: true, force: true });
execSync(
  `npx tsc lib/build.ts lib/player.ts --outDir ${OUT} ` +
    `--module commonjs --target es2020 --moduleResolution node --skipLibCheck`,
  { stdio: 'inherit' }
);

const B = require(path.resolve(OUT, 'build.js'));
const P = require(path.resolve(OUT, 'player.js'));
const BASE = require(path.resolve(OUT, 'base.js'));
const E = require(path.resolve(OUT, 'economy.js'));

let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

/** Свежий склад с деньгами: стартовый квадрат стоит в середине карты. */
const player = (credits = 100000) => {
  const p = P.newPlayer('тест');
  p.credits = credits;
  p.founded = true;
  return p;
};

/** Слепок всего, что стройка имеет право менять. */
const snap = (p) => JSON.stringify({
  credits: p.credits,
  cells: [...p.cells],
  guns: p.guns,
  depots: p.depots,
  repaired: p.stats.cellsRepaired,
});

/** Целая клетка склада, свободная от пушек и ящиков. */
const freeCell = (p) => {
  const i = BASE.freeCells(p.cells, p.guns, p.depots)[0];
  return { x: i % BASE.GRID, y: (i / BASE.GRID) | 0 };
};

/** Клетка земли рядом со складом. */
const groundNear = (p) => {
  for (let i = 0; i < p.cells.length; i++) {
    const x = i % BASE.GRID;
    const y = (i / BASE.GRID) | 0;
    if (p.cells[i] === 0 && BASE.touchesBuilding(p.cells, x, y)) return { x, y };
  }
  return null;
};

console.log('— отказ не трогает склад —');
{
  // Денег нет ни на что: каждое действие обязано отказать и ничего не
  // тронуть. Подготовку держим отдельно от самого действия — иначе слепок
  // снимался бы с уже изменённого склада и сравнивать было бы нечего.
  const cases = [
    ['клетка', null, (p) => { const g = groundNear(p); return B.buildOne(p, g.x, g.y, true); }],
    ['ремонт',
      (p) => { const c = freeCell(p); p.cells[BASE.idx(c.x, c.y)] = 3; return c; },
      (p, c) => B.repairAt(p, c.x, c.y)],
    ['зенитка', null, (p) => { const c = freeCell(p); return B.placeGun(p, c.x, c.y, 'gun'); }],
    ['ракетница', null, (p) => { const c = freeCell(p); return B.placeGun(p, c.x, c.y, 'rocket'); }],
    ['огнетушитель', null, (p) => { const c = freeCell(p); return B.placeGun(p, c.x, c.y, 'spray'); }],
    ['ловушка', null, (p) => { const c = freeCell(p); return B.placeGun(p, c.x, c.y, 'trap'); }],
    ['шары', null, (p) => { const c = freeCell(p); return B.placeGun(p, c.x, c.y, 'balloon'); }],
    ['дроны', null, (p) => { const c = freeCell(p); return B.placeDepot(p, c.x, c.y); }],
  ];
  for (const [name, prepare, act] of cases) {
    const p = player(0);
    const ctx = prepare ? prepare(p) : null;
    const before = snap(p);
    const r = act(p, ctx);
    check(`${name} без денег: отказ`, r.ok === false, r.ok ? 'прошло' : r.why);
    check(`${name} без денег: склад цел`, snap(p) === before);
  }
}

console.log('\n— списывается ровно названная цена —');
{
  const p = player();
  const spent = [];
  const take = (r) => { if (!r.ok) throw new Error('отказ: ' + r.why); spent.push(r.spent); };

  const before = p.credits;
  let c = freeCell(p);
  take(B.placeGun(p, c.x, c.y, 'gun'));
  c = freeCell(p);
  take(B.placeGun(p, c.x, c.y, 'rocket'));
  c = freeCell(p);
  take(B.placeGun(p, c.x, c.y, 'spray'));
  c = freeCell(p);
  take(B.placeGun(p, c.x, c.y, 'trap'));
  c = freeCell(p);
  take(B.placeDepot(p, c.x, c.y));
  c = freeCell(p);
  take(B.placeGun(p, c.x, c.y, 'balloon'));
  const g = groundNear(p);
  take(B.buildOne(p, g.x, g.y, true));

  const sum = spent.reduce((a, b) => a + b, 0);
  check('кошелёк сошёлся с суммой списаний', before - p.credits === sum,
    `названо ${sum}, списано ${before - p.credits}`);
  check('цены названы те же, что на кнопке',
    spent[0] === B.gunCost(p.levels, 'gun') &&
    spent[1] === B.gunCost(p.levels, 'rocket') &&
    spent[2] === B.gunCost(p.levels, 'spray') &&
    spent[3] === B.gunCost(p.levels, 'trap') &&
    spent[4] === B.depotCost(p.levels) &&
    spent[5] === B.gunCost(p.levels, 'balloon'),
    spent.join(', '));
}

console.log('\n— перенос ничего не стоит —');
{
  const p = player();
  const a = freeCell(p);
  B.placeGun(p, a.x, a.y, 'trap');
  const b = freeCell(p);
  const before = p.credits;
  const r = B.moveGun(p, { cx: a.x, cy: a.y, kind: 'trap' }, b.x, b.y);
  check('пушка переехала даром', r.ok && r.spent === 0 && p.credits === before);
  check('и осталась ловушкой', BASE.countKind(p.guns, 'trap') === 1,
    JSON.stringify(p.guns));

  const c = freeCell(p);
  B.placeDepot(p, c.x, c.y);
  const d = freeCell(p);
  const was = p.credits;
  const r2 = B.moveDepot(p, { cx: c.x, cy: c.y }, d.x, d.y);
  check('контейнер переехал даром', r2.ok && r2.spent === 0 && p.credits === was);
  check('и дронов в нём столько же', BASE.droneCount(p.depots) === 10);
}

console.log('\n— снос платит, а склад надвое не рвёт —');
{
  const p = player();
  // склад побольше стартового: иначе снос упрётся в нижний порог
  for (let k = 0; k < 6; k++) { const g = groundNear(p); B.buildOne(p, g.x, g.y, true); }
  // Сжигаем клетку в середине склада и сносим её.
  const c = freeCell(p);
  p.cells[BASE.idx(c.x, c.y)] = 3;
  const before = p.credits;
  const r = B.scrapAt(p, c.x, c.y);
  if (r.ok) {
    check('за снос заплатили', p.credits - before === E.SCRAP_REWARD && r.spent === -E.SCRAP_REWARD,
      `получено ${p.credits - before}`);
  } else {
    check('снос середины разорвал бы склад — отказ по делу', r.why === 'scrap.splits', r.why);
  }
}

console.log('\n— рамка считает то же, что потом списывает —');
{
  const p = player();
  const o = 47;
  const rect = { x: o, y: o - 3, w: 3, h: 3 };
  const plan = B.draftPlan(p, 'area', rect, true);
  const before = p.credits;
  const r = B.applyDraft(p, 'area', rect, true);
  check('рамка списала ровно то, что насчитала',
    r.ok && r.spent === plan.cost && before - p.credits === plan.cost,
    `насчитано ${plan.cost} за ${plan.cells} клеток, списано ${before - p.credits}`);
  check('клетки и правда построены',
    BASE.countCells(p.cells, 1) >= E.STARTER_CELLS + plan.cells,
    `целых ${BASE.countCells(p.cells, 1)}`);

  // Та же рамка второй раз: строить уже нечего, денег брать не за что.
  const again = B.applyDraft(p, 'area', rect, true);
  check('пустая рамка ничего не стоит', again.ok && again.spent === 0);
}

console.log('\n— оторванный кусок склада не пристраивается —');
{
  const p = player();
  const far = { x: 5, y: 5 };
  const r = B.buildOne(p, far.x, far.y, true);
  check('клетка на отшибе отклонена', !r.ok && r.why === 'draft.mustBeSolid',
    r.ok ? 'прошла' : r.why);
  const rect = { x: 3, y: 3, w: 4, h: 4 };
  const r2 = B.applyDraft(p, 'area', rect, true);
  check('рамка на отшибе отклонена', !r2.ok && r2.why === 'draft.mustBeSolid',
    r2.ok ? 'прошла' : r2.why);
}

console.log('\n— прокачка дорожает по формуле —');
{
  const expected = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000];
  check('цены переходов с уровня 0 до 10 удваиваются',
    expected.every((cost, i) => E.upgradeCost(i + 1) === cost));
  const insuranceCosts = [250, 1000, 4000, 16000];
  check('четыре улучшения страховки стоят 250, 1000, 4000, 16000',
    E.maxLevel('insurance') === insuranceCosts.length + 1 &&
    insuranceCosts.every((cost, i) => E.upgradeCost(i + 1, 'insurance') === cost));
  check('покрытие страховки сохраняется: 0%, 25%, 50%, 75%, 100%',
    [0, 0.25, 0.5, 0.75, 1].every((share, i) => E.insuranceShare(i + 1) === share));
}
{
  const p = player();
  for (const [kind, base, level, top] of [
    ['gun', E.GUN_COST, 'guns', 200],
    ['rocket', E.ROCKET_COST, 'rockets', 400],
    ['spray', E.SPRAY_COST, 'sprays', 300],
    ['trap', E.TRAP_COST, 'traps', 400],
    ['balloon', E.BALLOON_COST, 'balloons', 150],
  ]) {
    let okAll = true;
    for (let lv = 1; lv <= 11; lv++) {
      p.levels[level] = lv;
      if (B.gunCost(p.levels, kind) !== E.priceAt(base, top, lv)) okAll = false;
    }
    p.levels[level] = 1;
    check(`${kind}: цена по уровню, до ${top} на десятом`, okAll && B.gunCost({ ...p.levels, [level]: 11 }, kind) === top);
  }
  p.levels.drones = 11;
  check('дроны: контейнер дорожает с уровнем',
    B.depotCost(p.levels) === 300,
    String(B.depotCost(p.levels)));
}

console.log('\n— снос целой клетки и нижний порог склада —');
{
  const p = player();
  const g = groundNear(p);
  B.buildOne(p, g.x, g.y, true);
  const before = p.credits;
  const r = B.scrapAt(p, g.x, g.y);
  check('целая пустая клетка сносится за ту же цену', r.ok && p.credits - before === E.SCRAP_REWARD,
    r.ok ? String(p.credits - before) : r.why);
  const c = freeCell(p);
  const r2 = B.scrapAt(p, c.x, c.y);
  check('меньше стартового склад не сносится', !r2.ok && r2.why === 'scrap.tooSmall', r2.ok ? 'снесли' : r2.why);
  const h = groundNear(p);
  B.buildOne(p, h.x, h.y, true);
  B.placeGun(p, h.x, h.y, 'gun');
  const r3 = B.scrapAt(p, h.x, h.y);
  check('клетку с установкой не сносим', !r3.ok && r3.why === 'scrap.busy', r3.ok ? 'снесли' : r3.why);
}

console.log('\n— занятая клетка занята —');
{
  const p = player();
  const c = freeCell(p);
  B.placeGun(p, c.x, c.y, 'gun');
  const r = B.placeDepot(p, c.x, c.y, 'basic');
  check('на пушку ящик не ставится', !r.ok && r.why === 'depot.gunThere', r.why);
  const d = freeCell(p);
  B.placeDepot(p, d.x, d.y, 'basic');
  const r2 = B.placeGun(p, d.x, d.y, 'gun');
  check('на ящик пушка не ставится', !r2.ok && r2.why === 'gun.cellBusy', r2.why);
  const before = p.credits;
  B.placeDepot(p, d.x, d.y, 'basic');
  check('повторный ящик на ту же клетку ничего не стоит', p.credits === before);
}

console.log(fails ? `\n${fails} FAILED` : '\nстройка сходится');
process.exit(fails ? 1 : 0);
