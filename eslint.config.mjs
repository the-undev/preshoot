import { defineConfig } from "eslint/config"
import tseslint from "@electron-toolkit/eslint-config-ts"
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier"
import eslintPluginReact from "eslint-plugin-react"
import eslintPluginReactHooks from "eslint-plugin-react-hooks"
import eslintPluginReactRefresh from "eslint-plugin-react-refresh"
import eslintPluginQuery from "@tanstack/eslint-plugin-query"

export default defineConfig(
  { ignores: ["**/node_modules", "**/dist", "**/out", "**/routeTree.gen.ts"] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat["jsx-runtime"],
  ...eslintPluginQuery.configs["flat/recommended"],
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": eslintPluginReactHooks,
      "react-refresh": eslintPluginReactRefresh,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
    },
  },
  {
    // Domain code stays free of Electron so it can be tested under plain Node and moved later.
    files: ["src/main/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: ["electron"], patterns: ["electron/*", "@electron-toolkit/*"] },
      ],
    },
  },
  {
    // shadcn/ui output is generated and left untouched, so rules aimed at hand-written code do not apply.
    files: ["src/renderer/src/design-system/ui/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "react-refresh/only-export-components": "off",
    },
  },
  eslintConfigPrettier
)
