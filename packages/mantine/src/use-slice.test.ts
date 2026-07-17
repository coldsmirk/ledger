import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSlice } from "./use-slice";

describe("useSlice", () => {
  it("runs uncontrolled from defaultValue and resolves functional updaters", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSlice<number[]>({
      value: undefined,
      defaultValue: [1],
      onChange,
      fallback: []
    }));

    expect(result.current[0]).toEqual([1]);

    act(() => result.current[1](previous => [...previous, 2]));

    expect(result.current[0]).toEqual([1, 2]);
    // The observer receives the resolved value, never the updater function.
    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  it("falls back when neither value nor defaultValue is given", () => {
    const { result } = renderHook(() => useSlice<string>({
      value: undefined,
      defaultValue: undefined,
      onChange: undefined,
      fallback: "fallback"
    }));

    expect(result.current[0]).toBe("fallback");
  });

  it("follows the controlled value and still reports resolved values", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useSlice<number>({
        value,
        defaultValue: undefined,
        onChange,
        fallback: 0
      }),
      { initialProps: { value: 5 } }
    );

    expect(result.current[0]).toBe(5);

    act(() => result.current[1](previous => previous + 1));

    expect(onChange).toHaveBeenCalledWith(6);
    // Controlled: the rendered value only moves when the prop moves.
    expect(result.current[0]).toBe(5);

    rerender({ value: 6 });

    expect(result.current[0]).toBe(6);
  });

  it("resolves chained updaters within one event against fresh state", () => {
    const { result } = renderHook(() => useSlice<number>({
      value: undefined,
      defaultValue: 0,
      onChange: undefined,
      fallback: 0
    }));

    act(() => {
      result.current[1](previous => previous + 1);
      result.current[1](previous => previous + 1);
    });

    expect(result.current[0]).toBe(2);
  });
});
