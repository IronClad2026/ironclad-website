import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

const root = resolve(import.meta.dirname, "../../..");
const support = (file: string) => resolve(import.meta.dirname, file);
const noServices: Plugin = {
  name: "announcement-fixture-no-services",
  enforce: "pre",
  resolveId(source) {
    if (/supabase|clerk|server-only|^@\/app\/|next\/navigation/.test(source)) throw new Error("Announcement fixture attempted an unmocked service import.");
    return null;
  },
};

export default defineConfig({
  root,
  envDir: support("no-environment-files"),
  envPrefix: "ANNOUNCEMENT_FIXTURE_UNUSED_",
  plugins: [noServices, react()],
  optimizeDeps: { entries: [support("index.html")] },
  css: { postcss: { plugins: [tailwindcss({ base: root })] } },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@/app/admin/announcements/actions", replacement: support("runtime.ts") },
      { find: "@/app/announcements/actions", replacement: support("runtime.ts") },
      { find: "@/lib/supabase-config", replacement: support("runtime.ts") },
      { find: "@/lib/supabase", replacement: support("runtime.ts") },
      { find: "@clerk/nextjs", replacement: support("runtime.ts") },
      { find: "next/navigation", replacement: support("runtime.ts") },
      { find: "next/link", replacement: support("../showcase/link.tsx") },
      { find: "@", replacement: root },
    ],
  },
  server: { host: "127.0.0.1", port: 3226, strictPort: true, watch: { ignored: ["**/.playwright/**", "**/.next/**", "**/.git/**"] } },
});
