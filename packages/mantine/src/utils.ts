import { useCallback, useInsertionEffect, useRef } from "react";

const CSS_SAFE_CHARACTER = /^[a-z0-9-]$/i;

/**
 * Column ids are consumer-supplied; CSS custom property names must stay ident-safe.
 */
function cssSafeColumnId(columnId: string): string {
  let encoded = "";

  for (const character of columnId) {
    encoded += CSS_SAFE_CHARACTER.test(character)
      ? character
      : `_${character.codePointAt(0)!.toString(16)}_`;
  }

  // TanStack column ids are normally non-empty, but keeping the encoder total avoids emitting an
  // invalid custom-property suffix if a custom feature supplies an empty id.
  return encoded || "_empty_";
}

export function columnWidthVar(columnId: string): string {
  return `--ledger-col-width-${cssSafeColumnId(columnId)}`;
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
 * Whether a commit handler answered with a promise. Editing commits are `boolean | Promise<boolean>`
 * throughout, and both the session and the editors have to tell the two apart.
 */
export function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

/**
 * Stable-identity event callback (the classic useEvent shape) for handlers stored in table meta.
 *
 * Two shapes, because most call sites wrap a handler that always exists: those keep the result
 * type they wrote, while wrapping a consumer's optional prop widens it with the `undefined` a
 * missing handler answers with. One overload each, so a caller never has to assert the widening
 * away — the assertions that used to do it were the only thing standing between an internal
 * session's `boolean | Promise<boolean>` contract and the type system agreeing with it.
 */
export function useEventCallback<Args extends unknown[], Result>(
  handler: (...args: Args) => Result
): (...args: Args) => Result;
export function useEventCallback<Args extends unknown[], Result>(
  handler: ((...args: Args) => Result) | undefined
): (...args: Args) => Result | undefined;

export function useEventCallback<Args extends unknown[], Result>(
  handler: ((...args: Args) => Result) | undefined
): (...args: Args) => Result | undefined {
  const handlerRef = useRef(handler);

  useInsertionEffect(() => {
    handlerRef.current = handler;
  });

  return useCallback((...args: Args) => handlerRef.current?.(...args), []);
}
