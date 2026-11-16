import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "_recovery_backup_*/**",
    "_worktrees/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".playwright/**",
    "next-env.d.ts",
    // Three.js files are the approved upstream browser artifacts.
    "public/mascot-v6/vendor/**",
  ]),
]);

export default eslintConfig;
