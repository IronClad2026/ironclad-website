import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const root = resolve(import.meta.dirname, "../../..");
const runtime = resolve(import.meta.dirname, "runtime.ts");
export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: [
      ...[
        "@/app/tournaments/match-actions",
        "@/lib/supabase-browser",
        "@clerk/nextjs",
        "next/navigation",
      ].map((find) => ({ find, replacement: runtime })),
      { find: "@", replacement: root },
    ],
  },
  server: { host: "127.0.0.1", port: 3127, strictPort: true },
});
