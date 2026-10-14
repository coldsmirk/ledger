import type { DataTableLabels } from "@coldsmirk/ledger-mantine";
import type { CSSVariablesResolver, VariantColorsResolver } from "@mantine/core";

import type { Lang } from "./i18n";

import { DataTable, defaultLabels } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { CodeHighlightAdapterProvider, createShikiAdapter } from "@mantine/code-highlight";
import { createTheme, defaultVariantColorsResolver, MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { useMemo } from "react";

import { App } from "./app";
import { useLang } from "./i18n";

const LABELS: Record<Lang, DataTableLabels> = {
  en: defaultLabels,
  zh: zhCN
};

/**
 * Mantine's stock `dimmed` (gray-6 in light, dark-2 in dark) sits under the 4.5:1 WCAG AA asks
 * of text on the body; pulled toward each scheme's text color it clears it in both. An app-level
 * choice, as a host application would make it — ledger's own secondary text does not depend on it.
 */
const cssVariablesResolver: CSSVariablesResolver = () => {
  return {
    variables: {},
    light: { "--mantine-color-dimmed": "color-mix(in srgb, var(--mantine-color-gray-6), var(--mantine-color-black) 30%)" },
    dark: { "--mantine-color-dimmed": "color-mix(in srgb, var(--mantine-color-dark-2), var(--mantine-color-dark-0) 30%)" }
  };
};

/**
 * The `light` variant's text (a shade-9 hue on its own tint) falls under 4.5:1 for the teal,
 * yellow, and orange badges; pulled toward the text color it clears it in both schemes.
 */
const variantColorResolver: VariantColorsResolver = input => {
  const resolved = defaultVariantColorsResolver(input);

  return input.variant === "light"
    ? { ...resolved, color: `color-mix(in srgb, ${resolved.color}, var(--mantine-color-text) 30%)` }
    : resolved;
};

const DAYJS_LOCALE: Record<Lang, string> = {
  en: "en",
  zh: "zh-cn"
};

// Shiki loads lazily on the first opened source drawer, and only what the drawer shows: the core,
// the two grammars the demos are written in, and the JavaScript regex engine (no WebAssembly).
// The full bundle would build every grammar Shiki ships, and its default engine is Oniguruma's
// WASM. The adapter carries Mantine's own light/dark themes, so none is loaded here.
const shikiAdapter = createShikiAdapter(async () => {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript")
  ]);

  return createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [import("shiki/langs/tsx.mjs"), import("shiki/langs/typescript.mjs")],
    themes: []
  });
});

/**
 * The playground's theme and providers, in a module of their own: `main.tsx` only mounts it, so a
 * hot update re-renders this component instead of re-running the mount.
 */
export function Themed() {
  const { lang } = useLang();
  const labels = LABELS[lang];

  // App-wide defaults through the Mantine-native mechanism — no extra provider. The compound
  // components render outside the table tree, so each carries its own theme key; the built-in
  // pagination bar inherits the table's labels and needs no entry.
  const theme = useMemo(() => createTheme({
    variantColorResolver,
    components: {
      DataTable: DataTable.extend({ defaultProps: { labels, highlightOnHover: true } }),
      DataTableColumnsPanel: { defaultProps: { labels } },
      DataTablePagination: { defaultProps: { labels } },
      DataTableSearch: { defaultProps: { labels } },
      DataTableSelectionBar: { defaultProps: { labels } },
      // The active link's description is drawn at 90% opacity over the link's tint (4.1:1);
      // opaque, it clears the 4.5:1 WCAG AA asks of text.
      NavLink: { styles: { description: { opacity: 1 } } }
    }
  }), [labels]);

  return (
    <MantineProvider cssVariablesResolver={cssVariablesResolver} theme={theme}>
      <CodeHighlightAdapterProvider adapter={shikiAdapter}>
        <DatesProvider settings={{ locale: DAYJS_LOCALE[lang] }}>
          <App />
        </DatesProvider>
      </CodeHighlightAdapterProvider>
    </MantineProvider>
  );
}
