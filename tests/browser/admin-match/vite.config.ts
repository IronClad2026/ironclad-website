import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const root = resolve(import.meta.dirname, "../../..");
const runtime = resolve(import.meta.dirname, "runtime.ts");
export default defineConfig({
  root,
  cacheDir: resolve(root, ".playwright/vite-cache/admin-match"),
  envDir: resolve(import.meta.dirname, "no-environment-files"),
  envPrefix: "ADMIN_MATCH_FIXTURE_UNUSED_",
  plugins: [{
    name: "admin-match-no-server-imports",
    enforce: "pre",
    resolveId(source) {
      if (source === "@clerk/nextjs/server" || source === "server-only" ||
        /(?:^@\/lib\/|\/lib\/)(?:supabase-admin|supabase-server)(?:\.ts)?$/.test(source)) {
        throw new Error("A server provider must not enter the Admin Match fixture.");
      }
      return null;
    },
  }, react()],
  optimizeDeps: { entries: [resolve(import.meta.dirname, "index.html")] },
  resolve: {
    alias: [
      ...[
        "@/app/tournaments/match-actions",
        "@/app/tournaments/room-actions",
        "@/app/tournaments/support-actions",
        "@/app/admin/tournaments/deadline-actions",
        "@/lib/supabase-browser",
        "@clerk/nextjs",
        "next/navigation",
      ].map((find) => ({ find, replacement: runtime })),
      { find: "@", replacement: root },
    ],
  },
  server: { host: "127.0.0.1", port: 3128, strictPort: true,
    watch: { ignored: ["**/.playwright/**", "**/.next/**", "**/.git/**"] } },
});
