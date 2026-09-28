// Линтера в проекте не было, хотя в коде уже стояли eslint-disable — они
// ничего не отключали. Набор минимальный: правила Next и хуков, они и ловят
// то, ради чего disable писались.
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", ".tmp/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Карта — это Uint8Array и канвас: пустой catch тут обычное дело,
      // а неиспользованный аргумент бывает частью подписи интерфейса Repo.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
