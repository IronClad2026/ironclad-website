import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
const root = resolve(import.meta.dirname, "../../..");
const support = (name: string) => resolve(import.meta.dirname, name);
export default defineConfig({
  root, envDir: support("no-environment-files"), envPrefix: "OPERATIONS_FIXTURE_UNUSED_",
  plugins: [{ name: "operations-no-server-imports", enforce: "pre", resolveId(source) {
    if (source.includes("supabase") || source.includes("@clerk") || /\/lib\/(?:admin-operations|vercel-web-analytics)(?:\.ts)?$/.test(source)) throw new Error("A server provider must not enter the Operations fixture.");
    return null;
  } }, react()],
  optimizeDeps: { entries: [support("index.html")] },
  css: { postcss: { plugins: [tailwindcss({ base: root })] } },
  resolve: { alias: [
    { find: "next/navigation", replacement: support("runtime.ts") },
    { find: "next/link", replacement: support("link.tsx") },
    { find: "@", replacement: root },
  ] },
  server: { host: "127.0.0.1", port: 3189, strictPort: true,
    watch: { ignored: ["**/.playwright/**", "**/.next/**", "**/.git/**"] } },
});
