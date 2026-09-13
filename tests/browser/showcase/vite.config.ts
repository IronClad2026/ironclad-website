import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

const root = resolve(import.meta.dirname, "../../..");
const support = (name: string) => resolve(import.meta.dirname, name);

function noServices(): Plugin {
  return {
    name: "showcase-no-services",
    enforce: "pre",
    resolveId(source) {
      if (/supabase|clerk|server-only|player-showcase\/(read|actions)|^@\/app\/|next\/navigation/.test(source)) {
        throw new Error(`Showcase UI fixture attempted a server/service import: ${source}`);
      }
      return null;
    },
  };
}

export default defineConfig({
  root,
  envDir: support("no-environment-files"),
  envPrefix: "SHOWCASE_FIXTURE_UNUSED_",
  plugins: [noServices(), react()],
  optimizeDeps: { entries: [support("index.html")] },
  css: { postcss: { plugins: [tailwindcss({ base: root })] } },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "next/link", replacement: support("link.tsx") },
      { find: "next/image", replacement: resolve(import.meta.dirname, "../ui-redesign/image.tsx") },
      { find: "@", replacement: root },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 3193,
    strictPort: true,
    watch: { ignored: ["**/.playwright/**", "**/.next/**", "**/.git/**"] },
  },
});