import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": path.resolve(
        import.meta.dirname,
        "tests/stubs/server-only.ts"
      ),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    mockReset: true,
    restoreMocks: true,
    setupFiles: ["tests/setup/node.ts", "tests/setup/dom.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
