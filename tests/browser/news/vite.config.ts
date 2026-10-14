import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

const root = resolve(import.meta.dirname, "../../..");
const support = (name: string) => resolve(import.meta.dirname, name);

function isolateLiveServices(): Plugin {
  return {
    name: "news-fixture-isolate-live-services",
    enforce: "pre",
    resolveId(source) {
      const normalized = source.replaceAll("\\", "/");
      if (
        normalized.includes("@supabase/") ||
        /\/lib\/supabase(?:[-/.]|$)/.test(normalized) ||
        normalized.includes("@clerk/backend") ||
        /\/lib\/news\/(?:source|fetch|cache|normalize)(?:\.|$)/.test(normalized)
      ) {
        throw new Error("News fixture must not import a live service client.");
      }
      if (
        /\/app\/.+actions(?:\.[jt]sx?)?$/.test(normalized) ||
        /\/app\/locale-actions(?:\.[jt]sx?)?$/.test(normalized)
      ) {
        throw new Error("News fixture must stub all Server Actions.");
      }
      return null;
    },
  };
}

export default defineConfig({
  root,
  envDir: support("no-environment-files"),
  envPrefix: "NEWS_FIXTURE_UNUSED_",
  plugins: [isolateLiveServices(), react()],
  optimizeDeps: { entries: [support("index.html")] },
  css: { postcss: { plugins: [tailwindcss({ base: root })] } },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@clerk/nextjs", replacement: support("runtime.ts") },
      { find: "next/navigation", replacement: support("runtime.ts") },
      { find: "@/app/locale-actions", replacement: support("runtime.ts") },
      { find: "@/components/useAnnouncementUnreadState", replacement: support("runtime.ts") },
      { find: "@/components/IronCladUserButton", replacement: support("account.tsx") },
      { find: "next/link", replacement: support("link.tsx") },
      { find: "next/image", replacement: support("image.tsx") },
      { find: "server-only", replacement: support("server-only.ts") },
      { find: "@", replacement: root },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 3198,
    strictPort: true,
    fs: { allow: [root] },
    watch: {
      ignored: ["**/.playwright/**", "**/test-results/**", "**/playwright-report/**", "**/.next/**", "**/.git/**"],
    },
  },
});
