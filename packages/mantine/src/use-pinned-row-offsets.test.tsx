import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePinnedRowOffsets } from "./use-pinned-row-offsets";

function rowWithHeight(height: number): Element {
  return {
    getBoundingClientRect: () => { return { height }; }
  } as unknown as Element;
}

describe("usePinnedRowOffsets", () => {
  it("remeasures same-count element replacements and row reorders", () => {
    const { result } = renderHook(() => usePinnedRowOffsets(2, 0));

    act(() => {
      result.current.registerTopRow(0)(rowWithHeight(20));
      result.current.registerTopRow(1)(rowWithHeight(40));
    });
    expect(result.current.offsets.top).toEqual([0, 20]);

    act(() => {
      result.current.registerTopRow(0)(rowWithHeight(40));
      result.current.registerTopRow(1)(rowWithHeight(20));
    });
    expect(result.current.offsets.top).toEqual([0, 40]);
  });
});
