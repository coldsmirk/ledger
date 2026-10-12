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
  },
  build: {
    rolldownOptions: {
      output: {
        // The libraries every page runs on, each a chunk of its own: none crosses the 500 kB the
        // build warns at, and a release that changes only the library or a demo leaves them cached.
        // The library itself resolves from source (above), so it rides with the shell.
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 30
            },
            {
              name: "mantine",
              test: /node_modules[\\/](?:@mantine|@floating-ui|react-number-format|react-remove-scroll[\\w-]*|react-style-singleton|use-callback-ref|use-sidecar|tabbable|clsx)[\\/]/,
              priority: 20
            },
            {
              name: "table",
              test: /node_modules[\\/](?:@tanstack|@dnd-kit)[\\/]/,
              priority: 20
            }
          ]
        }
      }
    }
  }
});
