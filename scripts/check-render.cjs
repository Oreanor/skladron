/* Pixel parity and Canvas timings in headless Chrome. Run: node scripts/check-render.cjs
 * Optionally pass the browser executable as the first argument. Outputs stay in .next.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const out = path.resolve('.next', 'check-render');
fs.mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'lib/render/index.ts',
  '--outDir', path.join(out, 'modules'), '--module', 'commonjs', '--target', 'es2020',
  '--moduleResolution', 'node', '--skipLibCheck'], { stdio: 'inherit' });

const sources = {};
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (file.endsWith('.js')) {
      sources['/' + path.relative(path.join(out, 'modules'), file).replaceAll('\\', '/')] =
        fs.readFileSync(file, 'utf8');
    }
  }
}
collect(path.join(out, 'modules'));

function checkInBrowser(sources) {
  const memo = {};
  function load(variant, name) {
    const key = variant + name;
    if (memo[key]) return memo[key].exports;
    const m = memo[key] = { exports: {} };
    const require = (relative) => {
      const parts = [];
      for (const part of (name.slice(0, name.lastIndexOf('/') + 1) + relative).split('/')) {
        if (part === '..') parts.pop();
        else if (part && part !== '.') parts.push(part);
      }
      let target = '/' + parts.join('/');
      if (!sources[target + '.js']) target += '/index';
      return load(variant, target + '.js');
    };
    // Baseline is the same renderer, with the depot cache disabled.
    const code = variant === 'direct' && name === '/render/depots.js'
      ? 'exports.drawBattleDepots=(ctx,s,cell)=>require("./pieces").drawDepots(ctx,s.depots,cell);'
      : sources[name];
    new Function('require', 'module', 'exports', code)(require, m, m.exports);
    return m.exports;
  }
  const renderers = ['direct', 'cached'].map(v => load(v, '/render/index.js'));
  const engine = load('cached', '/engine.js');
  function scene() {
    const cells = new Uint8Array(10000).fill(1);
    const depots = Array.from({ length: 1000 }, (_, i) =>
      ({ cx: i % 100, cy: Math.floor(i / 100) + 20, n: 10 }));
    const guns = Array.from({ length: 200 }, (_, i) =>
      ({ cx: i % 100, cy: Math.floor(i / 100) + 50 }));
    const s = engine.createBattle(cells, guns, depots, [], { seed: 1 });
    s.drones = Array.from({ length: 1000 }, (_, i) => ({ id: i,
      x: (i * 7.73) % 100, y: (i * 3.43) % 100,
      hit: false, heldBy: null, payload: 'plain', fuel: 0 }));
    for (let i = 0; i < 300; i++) {
      s.cells[4000 + i] = 2;
      s.fire.set(4000 + i, 1);
    }
    return s;
  }
  let s = scene();
  const canvases = renderers.map(() => document.createElement('canvas'));
  const contexts = canvases.map(c => c.getContext('2d'));
  const tests = [];
  function compare(label, size = 700, scale = 1, panX = 0, panY = 0) {
    contexts.forEach((ctx, i) => {
      if (canvases[i].width !== size) canvases[i].width = canvases[i].height = size;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#789456';
      ctx.fillRect(0, 0, size, size);
      ctx.setTransform(scale, 0, 0, scale, panX, panY);
      renderers[i].drawFrame(ctx, s, 7, null, 5000, true);
    });
    const [a, b] = contexts.map(ctx => ctx.getImageData(0, 0, size, size).data);
    let maxDelta = 0;
    for (let i = 0; i < a.length; i++) maxDelta = Math.max(maxDelta, Math.abs(a[i] - b[i]));
    tests.push({ label, maxDelta });
  }
  compare('first frame');
  compare('cached frame');
  s.depots.splice(99, 1);
  compare('container burned');
  compare('zoom and pan', 700, 4, -1120, -700);
  compare('DPR 2', 1400, 2);
  compare('resize', 900, 1.28);
  s.depots.splice(20);
  compare('below cache threshold', 900, 1.28);
  s = scene();
  compare('new battle on same canvas', 900, 1.28);

  const fullFrameMs = renderers.map(renderer => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1400;
    const ctx = canvas.getContext('2d');
    function frame() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 1400, 1400);
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      renderer.drawFrame(ctx, s, 7, null, 5000, true);
    }
    for (let i = 0; i < 20; i++) frame();
    const samples = [];
    for (let batch = 0; batch < 7; batch++) {
      const start = performance.now();
      for (let i = 0; i < 20; i++) frame();
      ctx.getImageData(0, 0, 1, 1); // Flush deferred Canvas commands.
      samples.push((performance.now() - start) / 20);
    }
    samples.sort((a, b) => a - b);
    return samples[3];
  });
  return { tests, fullFrameMs: { direct: fullFrameMs[0], cached: fullFrameMs[1] } };
}

const html = path.join(out, 'benchmark.html');
fs.writeFileSync(html, '<!doctype html><pre id="result"></pre><script>try{' +
  'document.getElementById("result").textContent=JSON.stringify((' + checkInBrowser.toString() +
  ')(' + JSON.stringify(sources) + '));}catch(e){document.getElementById("result").textContent=' +
  'JSON.stringify({error:e.stack});}</script>');
const browser = process.argv[2] || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(file => fs.existsSync(file));
if (!browser) throw new Error('Pass the Chrome/Chromium executable as the first argument.');
const dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--user-data-dir=' + path.join(out, 'profile'), '--dump-dom',
  require('url').pathToFileURL(html).href],
  { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const match = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/);
if (!match) throw new Error('Browser returned no result.');
const result = JSON.parse(match[1]);
console.log(JSON.stringify(result, null, 2));
if (result.error || result.tests.some(test => test.maxDelta !== 0)) process.exitCode = 1;
