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
const { newPlayer } = require('../lib/player.ts');
const { applyDraft, placeGun, placeDepot, moveGun, moveDepot, gunCost } = require('../lib/build.ts');
const { GRID, G_BASE, G_BURNT, G_FIRE, idx, encodeRle } = require('../lib/base.ts');
const { createBattle, update, settle, absorbDroneHit } = require('../lib/engine.ts');
const { buildPlan, makeOrder } = require('../lib/attack.ts');
const { resolveBattle } = require('../lib/resolve.ts');
const { SIM } = require('../lib/tuning.ts');
const p=newPlayer(); p.cells.fill(0); p.guns=[]; p.depots=[]; p.credits=1000;
for (let y=40;y<43;y++) for(let x=40;x<43;x++)p.cells[idx(x,y)]=G_BASE;
p.cells[idx(42,42)]=G_BURNT;
p.guns=[{cx:40,cy:40}];p.depots=[{cx:41,cy:40,n:10}];
assert.equal(applyDraft(p,'net',{x:39,y:39,w:5,h:5},true).spent,70);
assert.equal(p.guns.filter(g=>g.kind==='net').length,7);
assert.equal(p.credits,930);
{ // установка вытесняет сетку и платит только разницу
  const q=structuredClone(p),r=placeGun(q,40,41,'trap'),diff=gunCost(q.levels,'trap')-gunCost(q.levels,'net');
  assert.deepEqual(r,{ok:true,spent:diff});assert.equal(q.credits,930-diff);
  assert(!q.guns.some(g=>g.kind==='net'&&g.cx===40&&g.cy===41));assert(q.guns.some(g=>g.kind==='trap'&&g.cx===40&&g.cy===41));
  q.credits=diff-1;assert.equal(placeGun(q,41,41,'trap').ok,false);
  assert.equal(placeGun(q,40,41,'gun').ok,false);assert.equal(placeGun(q,41,40,'gun').ok,false);
}
const beforeSwap=structuredClone(p);
assert.equal(moveGun(p,{cx:40,cy:40,kind:'gun'},42,41).ok,false);
assert.deepEqual(p,beforeSwap);
assert.equal(moveDepot(p,{cx:41,cy:40},40,40).ok,false);
assert.deepEqual(p,beforeSwap);
assert.equal(placeDepot(p,41,41).ok,true);

assert(p.guns.some(g=>g.kind==='net'&&g.cx===40&&g.cy===41));
assert.equal(moveDepot(p,{cx:41,cy:41},40,41).ok,true);
assert(p.guns.some(g=>g.kind==='net'&&g.cx===41&&g.cy===41));
const before=structuredClone(p);p.credits=0;
assert.equal(applyDraft(p,'net',{x:43,y:40,w:1,h:1},true).spent,0);
p.credits=before.credits;
assert.equal(applyDraft(p,'net',{x:40,y:40,w:3,h:3},true).spent,-70);
assert.equal(p.guns.filter(g=>g.kind==='net').length,0);
assert.equal(p.credits,before.credits+70);
console.log('PASS area skips ground and burnt cells; charges by level; containers stay beneath nets; installations displace nets for the difference; removal refunds');
const cells=new Uint8Array(GRID*GRID);const nets=[];
for(let y=49;y<52;y++)for(let x=49;x<52;x++){cells[idx(x,y)]=G_BASE;nets.push({cx:x,cy:y,kind:'net'});}
const state=createBattle(cells,nets,[],[],{});
assert(absorbDroneHit(state,idx(50,50)));
assert.equal(state.nets.size,4);
assert(state.nets.has(idx(49,49)));
assert.equal(state.cells[idx(50,50)],G_BASE);
assert.equal(absorbDroneHit(state,idx(50,50)),false);
assert.equal(settle(state).guns.length,4);
const edgeCells=new Uint8Array(GRID*GRID);edgeCells[0]=edgeCells[1]=edgeCells[GRID]=edgeCells[GRID-1]=G_BASE;
const edge=createBattle(edgeCells,[0,1,GRID,GRID-1].map(i=>({cx:i%GRID,cy:Math.floor(i/GRID),kind:'net'})),[],[],{});
absorbDroneHit(edge,0);assert.deepEqual([...edge.nets],[GRID-1]);
console.log('PASS direct hits remove only the one-cell cross; no row wrapping; surviving nets persist');
const fire=createBattle(cells,nets,[],[],{});fire.nets.delete(idx(50,50));fire.cells[idx(50,50)]=G_FIRE;fire.fire.set(idx(50,50),0);
update(fire,SIM.step);
assert.equal(fire.cells[idx(50,49)],G_FIRE);assert(!fire.nets.has(idx(50,49)));assert(fire.nets.has(idx(49,49)));
console.log('PASS neighbouring fire ignites a covered cell normally and does not remove a cross of nets');
const waves=[{pattern:'lines',direction:0,delay:0,groups:[{payload:'plain',n:5},{payload:'heavy',n:2}]}];
const order=makeOrder('Nets',waves,1,42);const s=createBattle(cells,nets,[],buildPlan(order),{seed:order.seed});
for(let i=0;i<40000&&s.phase==='playing';i++)update(s,SIM.step);
const played=settle(s),resolved=resolveBattle({cells,guns:nets,depots:[],levels:{},order,trace:'-*40000'});
assert.equal(encodeRle(played.cells),resolved.cells);assert.deepEqual(played.guns,resolved.guns);assert.deepEqual(played.result,resolved.result);
console.log('PASS client and server simulations agree on damage and surviving nets');

const one=new Uint8Array(GRID*GRID);one[idx(50,50)]=G_BASE;
const direct=createBattle(one,[{cx:50,cy:50,kind:'net'}],[],[{at:0,edge:0,ox:50}],{seed:1});
update(direct,SIM.step);
assert.equal(direct.drones.length,1);
const drone={...direct.drones[0],x:50.49,y:50.5,tx:50.5,ty:50.5,ti:idx(50,50),form:false};
direct.drones=[{...drone}];update(direct,SIM.step);
assert.equal(direct.nets.size,0);assert.equal(direct.result.burned,0);assert.equal(direct.result.leaked,1);
direct.phase='playing';direct.drones=[{...drone}];update(direct,SIM.step);
assert.equal(direct.result.burned,1);
console.log('PASS first real impact removes the net without fire; the next impact ignites the same cell');

const upgraded=createBattle(cells,nets,[],[],{nets:2});
absorbDroneHit(upgraded,idx(50,50));assert.equal(upgraded.nets.size,8);
upgraded.cells[idx(50,50)]=G_FIRE;upgraded.fire.set(idx(50,50),0);update(upgraded,SIM.step);
assert.equal(upgraded.cells[idx(50,49)],G_FIRE);
const fireproof=createBattle(cells,nets,[],[],{nets:3});
fireproof.nets.delete(idx(50,50));fireproof.cells[idx(50,50)]=G_FIRE;fireproof.fire.set(idx(50,50),0);update(fireproof,SIM.step);
assert.equal(fireproof.cells[idx(50,49)],G_BASE);assert(fireproof.nets.has(idx(50,49)));
fireproof.phase='playing';absorbDroneHit(fireproof,idx(50,49));
fireproof.cells[idx(50,50)]=G_FIRE;fireproof.fire.set(idx(50,50),0);update(fireproof,SIM.step);
assert.equal(fireproof.cells[idx(50,49)],G_FIRE);
console.log('PASS upgrades: level 1 removes one net; level 2 blocks neighbouring fire only while covered');
const { LocalRepo }=require('../lib/repo/local.ts');
const { upgradeCost, maxLevel, netCost }=require('../lib/economy.ts');
(async()=>{
  const repo=new LocalRepo(),p=newPlayer();p.credits=100000;
  assert.equal(upgradeCost(1,'nets'),8000);assert.equal(upgradeCost(2,'nets'),64000);assert.equal(maxLevel('nets'),3);
  await repo.upgrade(p,'nets');assert.equal(p.credits,92000);assert.equal(p.levels.nets,2);
  await repo.upgrade(p,'nets');assert.equal(p.credits,28000);assert.equal(p.levels.nets,3);
  await assert.rejects(repo.upgrade(p,'nets'));assert.equal(p.credits,28000);assert.equal(netCost(1),10);assert.equal(netCost(2),25);assert.equal(netCost(3),50);
  console.log('PASS exactly two net upgrades cost 8000 and 64000; covering a cell costs 10, 25, 50');
})().catch(e=>{console.error(e);process.exitCode=1;});
