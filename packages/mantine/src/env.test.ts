import { afterEach, describe, expect, it, vi } from "vitest";

import { computeIsDev } from "./env";

describe("isDev", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an environment with no NODE_ENV to read as non-development", () => {
    // A browser bundle whose bundler replaced nothing and shipped no `process` shim. Reading it
    // throws there, and "not development" is the safe way to be wrong: the alternative leaves
    // the warning channel alive in production. The stub window is synchronous on purpose — the
    // test runner's own machinery needs `process` back before the next tick.
    vi.stubGlobal("process", undefined);

    expect(computeIsDev()).toBe(false);
  });

  it("treats a development NODE_ENV as development", () => {
    // What Vite substitutes into client source in dev, library source included — which is the
    // environment the read has to stay unguarded for.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the platform env var name verbatim
    vi.stubGlobal("process", { env: { NODE_ENV: "development" } });

    expect(computeIsDev()).toBe(true);
  });

  it("treats a production NODE_ENV as non-development", () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the platform env var name verbatim
    vi.stubGlobal("process", { env: { NODE_ENV: "production" } });

    expect(computeIsDev()).toBe(false);
  });
});
