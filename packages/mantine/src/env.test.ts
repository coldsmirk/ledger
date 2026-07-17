import { afterEach, describe, expect, it, vi } from "vitest";

import { computeIsDev } from "./env";

describe("isDev", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an environment without `process` as development", () => {
    // Regression: Vite dev serves library source to the browser where `process` does not
    // exist; the old `typeof process !== "undefined" && …` shape turned every dev guard off
    // exactly where developers look at the console. The stub window is synchronous on
    // purpose — the test runner's own machinery needs `process` back before the next tick.
    vi.stubGlobal("process", undefined);

    expect(computeIsDev()).toBe(true);
  });

  it("treats a production NODE_ENV as non-development", () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the platform env var name verbatim
    vi.stubGlobal("process", { env: { NODE_ENV: "production" } });

    expect(computeIsDev()).toBe(false);
  });
});
