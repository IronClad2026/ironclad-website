import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname, "../../..");
export default defineConfig({
  root,
  envDir: resolve(import.meta.dirname, "no-environment-files"),
  envPrefix: "NOTICE_FIXTURE_UNUSED_",
  define: { "process.env.PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED": '"true"' },
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@clerk/nextjs/server", replacement: resolve(import.meta.dirname, "clerk.tsx") },
      { find: "@clerk/nextjs", replacement: resolve(import.meta.dirname, "clerk.tsx") },
      { find: "next/navigation", replacement: resolve(import.meta.dirname, "next.ts") },
      { find: "@/lib/i18n/request", replacement: resolve(import.meta.dirname, "runtime.ts") },
      { find: "@/lib/public-gaming-profile-notice-server", replacement: resolve(import.meta.dirname, "runtime.ts") },
      { find: "@", replacement: root },
    ],
  },
  server: { host: "127.0.0.1", port: 3164, strictPort: true },
});
