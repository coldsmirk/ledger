import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * Column ids are consumer-supplied; CSS custom property names must stay ident-safe.
 */
function cssSafeColumnId(columnId: string): string {
  return columnId.replaceAll(/[^\w-]/g, "_");
}

export function columnWidthVar(columnId: string): string {
  return `--ledger-col-${cssSafeColumnId(columnId)}`;
}

/**
 * Pinned offset variables — written table-level with the width vars, referenced by cells.
 */
export function columnStartVar(columnId: string): string {
  return `--ledger-col-start-${cssSafeColumnId(columnId)}`;
}

export function columnAfterVar(columnId: string): string {
  return `--ledger-col-after-${cssSafeColumnId(columnId)}`;
}

export function toPx(value: number | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "number" ? `${value}px` : value;
}

/**
 * Stable-identity event callback (the classic useEvent shape) for handlers stored in table meta.
 */
export function useEventCallback<Args extends unknown[], Result>(
  handler: ((...args: Args) => Result) | undefined
): (...args: Args) => Result | undefined {
  const handlerRef = useRef(handler);

  useInsertionEffect(() => {
    handlerRef.current = handler;
  });

  return useCallback((...args: Args) => handlerRef.current?.(...args), []);
}
