import { resolve } from "node:path";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "../ui-redesign/vite.config";

const support = (name: string) => resolve(import.meta.dirname, name);
const sourceRoot = resolve(import.meta.dirname, "../../..");
if (process.env.UI_REDESIGN_SOURCE_ROOT && resolve(process.env.UI_REDESIGN_SOURCE_ROOT) !== sourceRoot) {
  throw new Error("Bracket fixture must compile its own isolated worktree.");
}
const rejectServerCode: Plugin = {
  name: "bracket-fixture-reject-server-code",
  enforce: "pre",
  transform(code, id) {
    if (id.includes("node_modules") || id.startsWith("\0")) return null;
    if (/(?:^|\n)\s*["']use server["']\s*;?/.test(code) || /import\s*["']server-only["']/.test(code)) {
      throw new Error("Bracket fixture refused a real server module: " + id);
    }
    return null;
  },
};

// Reuse the existing test-only service stubs and action virtualization; no
// existing harness files or application modules are modified by this fixture.
export default defineConfig(mergeConfig(base, {
  root: sourceRoot,
  envDir: support("no-environment-files"),
  envPrefix: "BRACKET_FIXTURE_UNUSED_",
  plugins: [rejectServerCode],
  optimizeDeps: { entries: [support("index.html")] },
  server: { host: "127.0.0.1", port: 3223, strictPort: true, fs: { allow: [sourceRoot] } },
}));