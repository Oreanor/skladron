/*
 * Сверка того, что типы не сторожат, а игра ломает молча.
 *
 * Модель игры размазана по пяти местам: тип в attack.ts, числа в tuning.ts,
 * цвет в render/colors.ts, цена и белый список в schema.sql, подпись с
 * подсказкой в семи словарях. Заводя новую начинку или установку, забыть
 * одно из пяти — дело одной правки, и увидеть это можно только в игре:
 * ни линтер, ни tsc сюда не дотягиваются.
 *
 * Тут же сверяются цены клиента с серверными. Разойдутся — окно налёта
 * покажет одну сумму, а спишется другая.
 *
 *   npm run check:model
 */

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(f, 'utf8');
let bad = 0;
const fail = (s) => { bad++; console.log('  FAIL  ' + s); };
const pass = (s) => console.log('  ok    ' + s);

const LOCS = ['en', 'ru', 'es', 'pt', 'fr', 'de', 'it'];
const LOC_DIR = path.join('lib', 'i18n', 'locales');

/** Словарь как есть: значение бывает перенесено на следующую строку. */
const readDict = (loc) => {
  const src = read(path.join(LOC_DIR, `${loc}.ts`));
  const out = new Map();
  const re = /^  "([^"]+)":\s*\n?\s*("(?:[^"\\]|\\.)*"),$/gm;
  let m;
  while ((m = re.exec(src))) out.set(m[1], JSON.parse(m[2]));
  return out;
};

const dicts = {};
for (const loc of LOCS) dicts[loc] = readDict(loc);
const missingIn = (key) => LOCS.filter((l) => !dicts[l].has(key));

const attack = read(path.join('lib', 'attack.ts'));
const tuning = read(path.join('lib', 'tuning.ts'));
const economy = read(path.join('lib', 'economy.ts'));
const colors = read(path.join('lib', 'render', 'colors.ts'));
const tools = read(path.join('components', 'lobby', 'tools.tsx'));
const battle = read(path.join('components', 'battle', 'Battle.tsx'));
const rules = read(path.join('lib', 'i18n', 'rules.ts'));
const rulesUi = read(path.join('components', 'Rules.tsx'));
const sql = read(path.join('supabase', 'schema.sql'));

// ---------- словари ----------
console.log('\n— словари сходятся между языками —');
{
  const base = dicts.en;
  let clean = true;
  for (const loc of LOCS.slice(1)) {
    const gone = [...base.keys()].filter((k) => !dicts[loc].has(k));
    const extra = [...dicts[loc].keys()].filter((k) => !base.has(k));
    if (gone.length) { fail(`${loc}: нет ключей — ${gone.slice(0, 6).join(', ')}`); clean = false; }
    if (extra.length) { fail(`${loc}: лишние — ${extra.slice(0, 6).join(', ')}`); clean = false; }
  }
  if (clean) pass(`${base.size} ключей в каждом из ${LOCS.length} языков`);

  // Подстановки: «{cost} кр» в одном языке и просто «кр» в другом — это
  // не вольность перевода, а число, которое игрок не увидит.
  const vars = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
  let holes = 0;
  for (const key of base.keys()) {
    const want = vars(base.get(key));
    for (const loc of LOCS.slice(1)) {
      const got = dicts[loc].get(key);
      if (got === undefined) continue;
      if (vars(got) !== want) {
        fail(`${key} / ${loc}: подстановки «${vars(got) || '—'}» против en «${want || '—'}»`);
        holes++;
      }
    }
  }
  if (!holes) pass('подстановки совпадают во всех строках');
}

// ---------- начинки ----------
console.log('\n— у каждой начинки есть всё, что ей положено —');
{
  const block = attack.split('export const PAYLOADS')[1]?.split('];')[0] ?? '';
  const payloads = [...block.matchAll(/"(\w+)"/g)].map((m) => m[1]);
  if (!payloads.length) fail('не нашёл список PAYLOADS');
  const waves = sql.split('check_waves')[1] ?? '';
  for (const p of payloads) {
    const miss = [];
    if (!new RegExp(`^  ${p}: \\{`, 'm').test(tuning)) miss.push('числа в PAYLOAD');
    if (!new RegExp(`^    ${p}:`, 'm').test(colors)) miss.push('цвет боеголовки');
    if (!new RegExp(`'pay_${p}'`).test(sql)) miss.push(`price('pay_${p}')`);
    if (!new RegExp(`'${p}'`).test(waves)) miss.push('белый список check_waves');
    if (!new RegExp(`^  ${p}: "payload\\.${p}"`, 'm').test(battle)) miss.push('легенда боя');
    const noName = missingIn(`payload.${p}`);
    if (noName.length) miss.push('подпись в ' + noName.join('/'));
    if (miss.length) fail(`${p}: нет ${miss.join('; ')}`);
    else pass(p);
  }

  // Надбавка за начинку считается дважды — в окне налёта и на сервере.
  for (const p of payloads) {
    const c = tuning.match(new RegExp(`^  ${p}: \\{ cost: ([\\d.]+)`, 'm'));
    const s = sql.match(new RegExp(`when 'pay_${p}'\\s+then (\\d+)`));
    if (!c || !s) { fail(`${p}: надбавку не сравнить`); continue; }
    const want = Math.round(Number(c[1]) * 100);
    if (want !== Number(s[1])) fail(`${p}: надбавка — клиент ${want}%, сервер ${s[1]}%`);
  }
}

// ---------- установки ----------
console.log('\n— у каждой установки есть всё, что ей положено —');
{
  const kinds = (read(path.join('lib', 'base.ts'))
    .match(/export type GunKind =([^;]+);/) ?? [])[1];
  const list = [...(kinds ?? '').matchAll(/"(\w+)"/g)].map((m) => m[1]);
  if (!list.length) fail('не нашёл GunKind');
  const valid = sql.split('guns_valid')[1] ?? '';
  for (const k of list) {
    const miss = [];
    if (!new RegExp(`'${k}'`).test(valid)) miss.push('белый список guns_valid');
    if (!new RegExp(`when '${k}'\\s+then`).test(sql)) miss.push(`price('${k}')`);
    if (!new RegExp(`id: "${k}"`).test(tools)) miss.push('кнопка в TOOLS');
    if (missingIn(`tool.${k}`).length) miss.push('подпись');
    if (missingIn(`tool.${k}Hint`).length) miss.push('подсказка');
    if (miss.length) fail(`${k}: нет ${miss.join('; ')}`);
    else pass(k);
  }
}

// ---------- цены ----------
console.log('\n— цены клиента и сервера совпадают —');
{
  const PRICES = [
    ['GUN_COST', 'gun'], ['ROCKET_COST', 'rocket'], ['SPRAY_COST', 'spray'],
    ['TRAP_COST', 'trap'], ['DRONE_UNIT_COST', 'drone'], ['BALLOON_COST', 'balloon'],
    ['CELL_COST', 'cell'], ['REPAIR_COST', 'repair'], ['SCRAP_REWARD', 'scrap'],
    ['CELL_LOOT_REWARD', 'loot'], ['LOOT_CURVE', 'loot_curve'],
    ['INSURANCE_CELL', 'insure_cell'], ['UPGRADE_STEP', 'upgrade'],
    ['GUN_TOP', 'gun_top'], ['ROCKET_TOP', 'rocket_top'], ['SPRAY_TOP', 'spray_top'],
    ['TRAP_TOP', 'trap_top'], ['BALLOON_TOP', 'balloon_top'], ['DRONE_TOP', 'drone_top'],
    ['LOAN_MIN', 'loan_min'], ['LOAN_MAX', 'loan_max'], ['LOAN_RATE', 'loan_rate'],
  ];
  let clean = true;
  for (const [name, key] of PRICES) {
    const c = economy.match(new RegExp(`^export const ${name} = ([\\d_]+)`, 'm'));
    const s = sql.match(new RegExp(`when '${key}'\\s*then (\\d+)`));
    if (!c || !s) { fail(`${name}/${key}: не сравнить`); clean = false; continue; }
    const cv = Number(c[1].split('_').join(''));
    if (cv !== Number(s[1])) { fail(`${name}: клиент ${cv}, сервер ${s[1]}`); clean = false; }
  }
  if (clean) pass(`${PRICES.length} цен сходятся`);
}

// ---------- версия боя ----------
console.log('\n— версия правил боя одна на обе стороны —');
{
  const c = tuning.match(/SIMULATION_VERSION = (\d+)/)?.[1];
  const s = sql.match(/sim_version\(\) returns int\s*\nlanguage sql immutable as \$\$ select (\d+)/)?.[1];
  if (c !== s) fail(`клиент ${c}, сервер ${s}`);
  else pass(`обе ${c}`);
}

// ---------- правила ----------
console.log('\n— в правилах нет подстановок без значений —');
{
  const used = new Set([...rules.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
  const known = new Set([...rulesUi.matchAll(/^  (\w+):/gm)].map((m) => m[1]));
  const orphan = [...used].filter((v) => !known.has(v));
  if (orphan.length) fail('нет значения для ' + orphan.join(', '));
  else pass(`${used.size} подстановок`);
}

console.log(bad ? `\n${bad} расхождений` : '\nвсё сходится');
process.exit(bad ? 1 : 0);
