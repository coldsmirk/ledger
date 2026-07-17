import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve the library to its TypeScript sources (same pattern as the root vitest config):
    // the playground live-reloads library edits with no build step.
    alias: [
      { find: "@coldsmirk/ledger-mantine/styles.css", replacement: fromHere("../mantine/src/styles.css") },
      { find: "@coldsmirk/ledger-mantine/locales", replacement: fromHere("../mantine/src/locales.ts") },
      { find: "@coldsmirk/ledger-mantine", replacement: fromHere("../mantine/src/index.ts") }
    ],
    dedupe: ["react", "react-dom", "@mantine/core", "@mantine/hooks"]
  },
  server: {
    host: "0.0.0.0",
    strictPort: true,
    port: 5330
  }
});
