import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/locales.ts"],
  format: ["esm", "cjs"],
  dts: true,
  fixedExtension: false,
  sourcemap: true,
  // Every export is client-only (components and hooks over DOM measurement): mark the bundles so
  // RSC bundlers (e.g. Next.js App Router) accept them without a consumer-side "use client" wrapper.
  banner: { js: "\"use client\";" },
  // Ship the stylesheet verbatim; consumers import "@coldsmirk/ledger-mantine/styles.css".
  copy: [{ from: "src/styles.css", to: "dist" }]
});
