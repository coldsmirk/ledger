import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/code-highlight/styles.css";
import "@coldsmirk/ledger-mantine/styles.css";
import "dayjs/locale/zh-cn";
import "./app.css";

import type { DataTableLabels } from "@coldsmirk/ledger-mantine";

import type { Lang } from "./i18n";

import { DataTable, defaultLabels } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { CodeHighlightAdapterProvider, createShikiAdapter } from "@mantine/code-highlight";
import { createTheme, MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { LanguageProvider, useLang } from "./i18n";

const LABELS: Record<Lang, DataTableLabels> = {
  en: defaultLabels,
  zh: zhCN
};

const DAYJS_LOCALE: Record<Lang, string> = {
  en: "en",
  zh: "zh-cn"
};

// Shiki loads lazily on the first opened source drawer; the adapter carries Mantine's own
// light/dark themes, so only the grammars the drawer shows are bundled into the async chunk.
const shikiAdapter = createShikiAdapter(async () => {
  const { createHighlighter } = await import("shiki");

  return createHighlighter({ langs: ["tsx", "ts"], themes: [] });
});

function Themed() {
  const { lang } = useLang();
  const labels = LABELS[lang];

  // App-wide defaults through the Mantine-native mechanism — no extra provider. The compound
  // components render outside the table tree, so each carries its own theme key; the built-in
  // pagination bar inherits the table's labels and needs no entry.
  const theme = useMemo(() => createTheme({
    components: {
      DataTable: DataTable.extend({ defaultProps: { labels, highlightOnHover: true } }),
      DataTableColumnsPanel: { defaultProps: { labels } },
      DataTablePagination: { defaultProps: { labels } },
      DataTableSearch: { defaultProps: { labels } },
      DataTableSelectionBar: { defaultProps: { labels } }
    }
  }), [labels]);

  return (
    <MantineProvider theme={theme}>
      <CodeHighlightAdapterProvider adapter={shikiAdapter}>
        <DatesProvider settings={{ locale: DAYJS_LOCALE[lang] }}>
          <App />
        </DatesProvider>
      </CodeHighlightAdapterProvider>
    </MantineProvider>
  );
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <LanguageProvider>
        <Themed />
      </LanguageProvider>
    </StrictMode>
  );
}
