import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript sources so tests run against source
    // (fast, no build step) and share a single React instance.
    alias: {
      "@coldsmirk/ledger-mantine": fromHere("./packages/mantine/src/index.ts")
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    clearMocks: true
  }
});
