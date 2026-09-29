/*
 * Режет лист 4×4 на отдельные аватарки.
 *
 * Лист приходит одной картинкой на пару мегабайт, а показываем мы её
 * кружком в тридцать пикселей. Держать ради этого спрайт незачем: по
 * файлу на лицо и легче, и заменить одно лицо можно, не трогая остальные.
 *
 *   node scripts/slice-avatars.cjs <лист> [стартовый_номер]
 *
 * Без стартового номера пишет 1.webp…16.webp рядом с листом.
 * Со стартовым — например 81 — пишет 81.webp…96.webp в public/avatars.
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

/** Сторона сетки: лист всегда 4×4. */
const GRID = 4;
/**
 * Сторона готового лица. Показываем аватарки крупно — до 200 пикселей в
 * окне начала боя, — поэтому берём плитку как есть, в её родном
 * разрешении: растягивать сверх исходника смысла нет, а ужимать значит
 * терять там, где картинка и так на виду.
 */
const SIDE = 0; // 0 — оставить родной размер плитки

const src = process.argv[2] || "public/avatars/crew.png";
const start = Math.max(1, Number(process.argv[3]) || 1);
const out = process.argv[3] ? path.join("public", "avatars") : path.dirname(src);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const meta = await sharp(src).metadata();
  const tile = Math.floor(Math.min(meta.width, meta.height) / GRID);
  let n = 0;
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const file = path.join(out, `${start + n}.webp`);
      await sharp(src)
        .extract({ left: col * tile, top: row * tile, width: tile, height: tile })
        .resize(SIDE || tile, SIDE || tile)
        .webp({ quality: 82 })
        .toFile(file);
      n++;
    }
  }
  const total = Array.from({ length: n }, (_, i) => start + i)
    .map((id) => fs.statSync(path.join(out, `${id}.webp`)).size)
    .reduce((sum, s) => sum + s, 0);
  console.log(
    `нарезано ${n} лиц (${start}…${start + n - 1}) по ${SIDE || tile}px, ` +
      `${(total / 1024).toFixed(0)} КБ`
  );
})();
