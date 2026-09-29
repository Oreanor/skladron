/*
 * Режет лист 4×4 на отдельные аватарки.
 *
 * Лист приходит одной картинкой на пару мегабайт, а показываем мы её
 * кружком в тридцать пикселей. Держать ради этого спрайт незачем: по
 * файлу на лицо и легче, и заменить одно лицо можно, не трогая остальные.
 *
 *   node scripts/slice-avatars.cjs public/avatars/crew.png
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
const out = path.dirname(src);

(async () => {
  const meta = await sharp(src).metadata();
  const tile = Math.floor(Math.min(meta.width, meta.height) / GRID);
  let n = 0;
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const file = path.join(out, `${n + 1}.webp`);
      await sharp(src)
        .extract({ left: col * tile, top: row * tile, width: tile, height: tile })
        .resize(SIDE || tile, SIDE || tile)
        .webp({ quality: 82 })
        .toFile(file);
      n++;
    }
  }
  const total = fs
    .readdirSync(out)
    .filter((f) => f.endsWith(".webp"))
    .reduce((sum, f) => sum + fs.statSync(path.join(out, f)).size, 0);
  console.log(`нарезано ${n} лиц по ${SIDE || tile}px, всего ${(total / 1024).toFixed(0)} КБ`);
})();
