import type { GetStylesApi } from "@mantine/core";

import type { DataTableFactory } from "./data-table";

/**
 * Keeps one identity for the Styles API for as long as it resolves the same answers.
 *
 * Mantine's `useStyles` re-resolves theme, `classNames`, `styles`, `vars`, `attributes` and the
 * props those read on every render, and returns a fresh getter each time. Neither obvious thing to
 * do with that getter works: handing it to a context rebuilds the context value on every render, so
 * nothing below stays memoized; pinning it behind a ref keeps the identity but freezes the answers,
 * so a real `styles.row` change never reaches a memoized row — and writing that ref during render
 * lets a transition React throws away restyle the tree on screen.
 *
 * The way out is to compare what the getter *resolves* rather than the getter itself. Two getters
 * that answer identically for every selector are interchangeable, so the committed one is kept and
 * nothing below re-renders. The moment an answer differs, this render's getter is returned, and
 * because it goes into a context value that identity change reaches even a `React.memo`ed row.
 *
 * The comparison covers each selector's `className`, `style` and attributes, plus the provenance a
 * per-call option is resolved against — `getStyles(selector, { style })` merges that style through
 * `resolveStyle(style, theme)`, which the answers alone would not reveal (docs/styling.md).
 *
 * Committed in an insertion effect, never during render: a render React discards must not be able
 * to say what the tree on screen is styled with.
 */
import {
  useMantineClassNamesPrefix,
  useMantineIsHeadless,
  useMantineStylesTransform,
  useMantineTheme,
  useMantineWithStaticClasses
} from "@mantine/core";
import { useInsertionEffect, useRef } from "react";

type Styles = GetStylesApi<DataTableFactory>;

type Selector = Parameters<Styles>[0];

/**
 * One selector's resolved props: whatever `attributes` put there, plus `className` and `style`.
 */
type Answer = Record<string, unknown>;

type Answers = Partial<Record<Selector, Answer>>;

/**
 * Own string keys, compared by identity. Never serialized: `attributes` carries whatever the
 * application put in it — event handlers, objects that refer to themselves — and writing answers
 * down as text would silently drop a replaced handler and throw on the rest.
 */
function sameShallow(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) {
    return true;
  }

  if (typeof previous !== "object" || typeof next !== "object" || previous === null || next === null) {
    return false;
  }

  const previousKeys = Object.keys(previous);

  if (previousKeys.length !== Object.keys(next).length) {
    return false;
  }

  return previousKeys.every(key => Object.hasOwn(next, key) && Object.is((previous as Answer)[key], (next as Answer)[key]));
}

function sameAnswer(previous: Answer, next: Answer): boolean {
  const previousKeys = Object.keys(previous);

  if (previousKeys.length !== Object.keys(next).length) {
    return false;
  }

  return previousKeys.every(key => {
    if (!Object.hasOwn(next, key)) {
      return false;
    }

    // Mantine builds a fresh `style` object on every render, so identity says nothing there; one
    // level of its own keys does. Everything else is compared by identity, which is what makes a
    // replaced handler a real change — and what makes an object-valued attribute conservatively
    // count as one.
    return key === "style"
      ? sameShallow(previous[key], next[key])
      : Object.is(previous[key], next[key]);
  });
}

function resolveAnswers(getStyles: Styles, selectors: readonly Selector[]): Answers {
  const answers: Answers = {};

  for (const selector of selectors) {
    answers[selector] = getStyles(selector) as Answer;
  }

  return answers;
}

function sameAnswers(previous: Answers, next: Answers, selectors: readonly Selector[]): boolean {
  return selectors.every(selector => {
    const before = previous[selector];
    const after = next[selector];

    return before !== undefined && after !== undefined && sameAnswer(before, after);
  });
}

export function useStylesRevision(getStyles: Styles, selectors: readonly Selector[]): Styles {
  // The inputs the returned getter closes over that its own answers do not expose: a per-call
  // `options.style` is resolved against the theme, and the rest decide how class names are built.
  const provenance = [
    useMantineTheme(),
    useMantineClassNamesPrefix(),
    useMantineWithStaticClasses(),
    useMantineIsHeadless(),
    useMantineStylesTransform()
  ];
  const answers = resolveAnswers(getStyles, selectors);
  const committed = useRef<{ answers: Answers; provenance: unknown[]; getStyles: Styles }>({
    answers,
    getStyles,
    provenance
  });

  const unchanged
    = committed.current.provenance.every((value, index) => Object.is(value, provenance[index]))
      && sameAnswers(committed.current.answers, answers, selectors);
  const revision = unchanged ? committed.current.getStyles : getStyles;

  useInsertionEffect(() => {
    committed.current = {
      answers,
      getStyles: revision,
      provenance
    };
  });

  return revision;
}
