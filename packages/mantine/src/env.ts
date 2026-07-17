/**
 * Environment probing — deliberately dependency-free so it stays importable (and testable)
 * in environments where the rest of the graph cannot load.
 */

/**
 * Bundlers replace `process.env.NODE_ENV`; the local declaration keeps package sources free of ambient node types.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the platform env var name verbatim
declare const process: { env: { NODE_ENV?: string } } | undefined;

/**
 * No `process` at all (e.g. Vite dev serving library source in the browser) counts as DEV:
 * production app builds always define NODE_ENV, so the only environments without it are
 * development-shaped, and the cost of being wrong is a once-per-session console.warn.
 *
 * Exported as a function so the regression test can probe it under a synchronously scoped
 * `process` stub — holding the stub across an async module re-import breaks the test runner's
 * own internals.
 */
export function computeIsDev(): boolean {
  // eslint-disable-next-line unicorn/no-typeof-undefined -- `process` may not exist at runtime; a bare read throws ReferenceError, typeof is the only safe probe
  return typeof process === "undefined" || process.env.NODE_ENV !== "production";
}

export const isDev: boolean = computeIsDev();

const emittedWarnings = new Set<string>();

/**
 * Dev-only, once-per-session warning — the guard-rail channel catalogued in docs/state.md.
 */
export function warnOnce(key: string, message: string): void {
  if (!isDev || emittedWarnings.has(key)) {
    return;
  }

  emittedWarnings.add(key);

  console.warn(`[ledger] ${message}`);
}
