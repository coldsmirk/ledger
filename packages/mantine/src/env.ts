/**
 * Environment probing — deliberately dependency-free so it stays importable (and testable)
 * in environments where the rest of the graph cannot load.
 */

/**
 * Bundlers replace `process.env.NODE_ENV`; the local declaration keeps package sources free of ambient node types.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the platform env var name verbatim
declare const process: { env: { NODE_ENV?: string } };

/**
 * The mode, read from the one expression every bundler replaces.
 *
 * It has to be read *unguarded* for that to work. Vite substitutes `process.env.NODE_ENV`
 * textually in client code — dev server included, and that covers library source served through
 * the `source` export condition — so a `typeof process` guard in front of it short-circuits in
 * the browser before the substituted value is ever reached, and every dev guard goes quiet
 * exactly where a developer is looking at the console. Guarding it the other way round is worse:
 * "no `process` object at runtime" would then mean development, and in a browser that is what a
 * production bundle looks like, so the warning channel survives into production.
 *
 * So the read comes first and the *failure* is what is caught. Where something replaced the
 * expression, the value decides and the production build folds to `false`; where nothing did —
 * a bundle shipped without a `process` shim — the read throws and the answer is "not
 * development", which is the safe way to be wrong.
 *
 * Exported as a function so the regression test can probe it under a synchronously scoped
 * `process` stub — holding the stub across an async module re-import breaks the test runner's
 * own internals.
 */
export function computeIsDev(): boolean {
  let nodeEnv: string | undefined;

  try {
    nodeEnv = process.env.NODE_ENV;
  } catch {
    nodeEnv = undefined;
  }

  return nodeEnv !== undefined && nodeEnv !== "production";
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
