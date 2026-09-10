import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

const root = resolve(import.meta.dirname, "../../..");
// Optional process-only path lets this test harness validate another isolated
// implementation worktree without copying product files between branches.
const sourceRoot = resolve(process.env.UI_REDESIGN_SOURCE_ROOT ?? root);
const support = (name: string) => resolve(import.meta.dirname, name);

// This harness compiles real product components, but never compiles Server
// Actions or a database/authentication client into its browser bundle.
function isolatedActions(): Plugin {
  const prefix = "\0ui-fixture-action:";
  return {
    name: "ui-redesign-isolated-actions",
    enforce: "pre",
    resolveId(source) {
      const normalized = source.replaceAll("\\", "/");
      if (/^@\/app\/.+actions$/.test(normalized)) return prefix + resolve(sourceRoot, normalized.slice(2) + ".ts");
      if (normalized.startsWith(sourceRoot.replaceAll("\\", "/") + "/app/") && /actions(?:\.ts)?$/.test(normalized)) return prefix + (normalized.endsWith(".ts") ? normalized : normalized + ".ts");
      if (source === "@supabase/supabase-js") {
        throw new Error("UI fixture must not import a Supabase client.");
      }
      return null;
    },
    load(id) {
      if (!id.startsWith(prefix)) return null;
      const source = readFileSync(id.slice(prefix.length), "utf8");
      const names = Array.from(source.matchAll(/export\s+async\s+function\s+(\w+)/g), (match) => match[1]);
      if (names.length === 0) throw new Error("Fixture action module has no recognized exports.");
      return `import { fixtureAction } from ${JSON.stringify(support("runtime.ts"))};\n` +
        names.map((name) => `export const ${name} = (...args) => fixtureAction(${JSON.stringify(name)}, args);`).join("\n");
    },
  };
}

export default defineConfig({
  root,
  envDir: support("no-environment-files"),
  envPrefix: "UI_FIXTURE_UNUSED_",
  plugins: [isolatedActions(), react()],
  css: { postcss: { plugins: [tailwindcss({ base: sourceRoot })] } },
  resolve: {
    dedupe: ["react", "react-dom", "framer-motion"],
    alias: [
      ...[
        "@clerk/nextjs/server", "@clerk/nextjs", "next/navigation",
        "@/lib/supabase-browser", "@/lib/supabase-server", "@/lib/supabase-admin",
        "@/lib/notifications", "@/lib/player-dashboard", "@/lib/player-polls",
        "@/lib/tournament-division-invitations", "@/lib/badges/reveals",
        "@/lib/i18n/request", "@/lib/player-showcase/read",
      ].map((find) => ({ find, replacement: support("runtime.ts") })),
      { find: "next/link", replacement: support("link.tsx") },
      { find: "next/image", replacement: support("image.tsx") },
      { find: "server-only", replacement: support("server-only.ts") },
      { find: "@", replacement: sourceRoot },
    ],
  },
  server: {
    host: "127.0.0.1", port: 3187, strictPort: true,
    fs: { allow: [root, sourceRoot] },
    watch: { ignored: ["**/.playwright/**", "**/test-results/**", "**/playwright-report/**", "**/.next/**", "**/.git/**"] },
  },
});
