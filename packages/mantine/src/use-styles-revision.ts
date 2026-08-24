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
 * Everything one render of the Styles API answers, in one comparable string.
 */
function resolveAnswers(getStyles: Styles, selectors: readonly Selector[]): string {
  let answers = "";

  for (const selector of selectors) {
    answers += `${selector} ${JSON.stringify(getStyles(selector))}`;
  }

  return answers;
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
  const committed = useRef<{ answers: string; provenance: unknown[]; getStyles: Styles }>({
    answers,
    getStyles,
    provenance
  });

  const unchanged
    = committed.current.answers === answers
      && committed.current.provenance.every((value, index) => Object.is(value, provenance[index]));
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
