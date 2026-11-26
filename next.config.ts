import type { NextConfig } from "next";

/*
 * Иконки лежат в components/icons настоящими .svg — их можно открыть любым
 * редактором и переставить точки, не разбираясь в JSX. Сюда они приходят
 * готовыми React-компонентами: svgr превращает файл в компонент, а
 * currentColor и класс с размером задаются на месте вызова.
 *
 * Правило прописано дважды: webpack собирает продакшен, turbopack — dev.
 * Разъедутся — иконки пропадут в одном из двух режимов, поэтому держим их
 * рядом и одинаковыми.
 */
const svgLoader = {
  loader: "@svgr/webpack",
  options: {
    // Цвет и размер задаёт вызывающий: className и currentColor.
    svgoConfig: {
      plugins: [
        { name: "preset-default", params: { overrides: { removeViewBox: false } } },
      ],
    },
  },
};

/*
 * Выкладка на домашний сервер (scripts/deploy.mjs) собирает с BASE_PATH=/skladron:
 * игра живёт не в корне сайта, а рядом с другими играми. И с NEXT_STANDALONE —
 * сервер получает готовую папку с server.js и нужными пакетами, без npm install.
 * Без них (Vercel, npm run dev) всё как раньше: корень сайта.
 */
const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
  // Выкладка собирает в свою папку, чтобы не мешать .next от npm run dev.
  distDir: process.env.NEXT_DIST_DIR || undefined,
  // Префикс нужен и коду в браузере: fetch и <img> Next сам не переписывает (lib/basePath.ts).
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: {
    rules: {
      "*.svg": { loaders: [svgLoader], as: "*.js" },
    },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.svg$/i, use: [svgLoader] });
    return config;
  },
};

export default nextConfig;
