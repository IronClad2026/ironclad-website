import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
assert.equal(path.resolve(process.cwd()), path.resolve(root), "Run from the Phase 1 worktree.");
assert(!readdirSync(root).some((name) => name.startsWith(".env") && name !== ".env.example"),
  "Local verification refuses environment files; do not copy Production configuration.");
const commands = {
  test: ["node_modules/vitest/vitest.mjs", "run", "--maxWorkers=2"],
  lint: ["node_modules/eslint/bin/eslint.js", "."],
  typecheck: ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"],
  build: ["node_modules/next/dist/bin/next", "build"],
  browser: ["node_modules/@playwright/test/cli.js", "test"],
};
const [mode, ...args] = process.argv.slice(2);
assert(Object.hasOwn(commands, mode), "Choose test, lint, typecheck, build or browser.");
// Deliberately do not inherit application/provider/database credentials or
// NODE_OPTIONS. These are the same inert application identities used by CI.
const env = {};
for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR",
  "COMSPEC", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS"]) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
Object.assign(env, {
  CI: "1", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-only-service-role-key",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsudGVzdCQ=",
  CLERK_SECRET_KEY: "sk_test_not-a-real-secret",
  NODE_OPTIONS: `--require "${path.join(root, "scripts/patch2/block-remote-network.cjs").replaceAll("\\", "/")}"`,
});
const result = spawnSync(process.execPath, [...commands[mode], ...args], {
  cwd: root, env, stdio: "inherit", windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
