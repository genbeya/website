// @ts-check
import eslint from "@eslint/js";
import astro from "eslint-plugin-astro";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "dist/",
      ".astro/",
      "node_modules/",
      "public/try/app/",
      "src/content/docs/docs/",
      "src/generated/",
      ".cache/",
      "test-results/",
      "playwright-report/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  ...astro.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // noUncheckedIndexedAccess is on; `!` marks an invariant the code relies on.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["scripts/**/*.ts", "tests/**/*.ts", "*.config.*"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
