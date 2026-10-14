import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

const root = resolve(import.meta.dirname, "../../..");
const support = (file: string) => resolve(import.meta.dirname, file);
const noServices: Plugin = {
  name: "combat-highlights-no-services", enforce: "pre",
  resolveId(source) {
    if (/supabase|clerk|server-only|^@\/app\/|combat-highlights\/(read|service|actions)|next\/navigation/.test(source)) throw new Error("Local fixture attempted a service import.");
    return null;
  },
};
export default defineConfig({
  root, envDir: support("no-environment-files"), envPrefix: "HIGHLIGHTS_FIXTURE_UNUSED_",
  plugins: [noServices, react()], optimizeDeps: { entries: [support("index.html")] },
  css: { postcss: { plugins: [tailwindcss({ base: root })] } },
  resolve: { dedupe: ["react", "react-dom"], alias: [{ find: "next/link", replacement: support("../showcase/link.tsx") }, { find: "@", replacement: root }] },
  server: { host: "127.0.0.1", port: 3218, strictPort: true, watch: { ignored: ["**/.playwright/**", "**/.next/**", "**/.git/**"] } },
});
