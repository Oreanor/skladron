// Regression checks for partial loan payments and isolated raid simulations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, ...rest);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { LocalRepo } = require('../lib/repo/local.ts');
const { newPlayer } = require('../lib/player.ts');
const { makeOrder } = require('../lib/attack.ts');
const { resolveBattle } = require('../lib/resolve.ts');

(async () => {
  const repo = new LocalRepo();
  const p = newPlayer();
  p.loan = 1100;
  p.loanDue = Date.now() + 86400000;
  p.credits = 2000;
  const due = p.loanDue;
  await repo.repayLoan(p, 200);
  assert.equal(p.loan, 900);
  assert.equal(p.credits, 1800);
  assert.equal(p.loanDue, due);
  await repo.repayLoan(p, 300);
  assert.equal(p.loan, 600);
  assert.equal(p.loanDue, due);
  for (const amount of [0, -1, 601, 1.5, NaN]) {
    const before = structuredClone(p);
    await assert.rejects(repo.repayLoan(p, amount));
    assert.deepEqual(p, before);
  }
  p.credits = 1;
  const before = structuredClone(p);
  await assert.rejects(repo.repayLoan(p, 2));
  assert.deepEqual(p, before);
  p.credits = 600;
  await repo.repayLoan(p, 600);
  assert.equal(p.loan, 0);
  assert.equal(p.loanDue, null);
  assert.equal(p.credits, 0);
  console.log('PASS partial payments preserve deadline; invalid payments change nothing; full payment clears debt');

  const base = newPlayer();
  const untouched = structuredClone(base);
  const waves = [
    { pattern: 'rings', direction: 2, delay: 0, groups: [{ payload: 'heavy', n: 12 }] },
    { pattern: 'lines', direction: 0, delay: 3, groups: [{ payload: 'plain', n: 14 }] },
  ];
  const order = makeOrder('Test', waves, base.levels.drones, 42);
  resolveBattle({ cells: base.cells, guns: base.guns, depots: base.depots, levels: base.levels, order, trace: '' });
  assert.deepEqual(base, untouched);
  assert.deepEqual(order.waves, waves);
  console.log('PASS multi-wave simulation leaves warehouse, credits, statistics and plan unchanged');
})().catch((error) => { console.error(error); process.exitCode = 1; });
