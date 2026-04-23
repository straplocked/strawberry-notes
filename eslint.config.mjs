import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code worktrees sometimes live under .claude/ with their own node_modules;
    // never lint into them.
    ".claude/**",
    // Browser extension is a separate build target with its own tsconfig,
    // its own package.json, and its own lint rules if added later.
    "extension/**",
  ]),
]);

export default eslintConfig;
