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

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" },
    },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.svg$/i, use: [svgLoader] });
    return config;
  },
};

export default nextConfig;
