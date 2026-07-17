import "@mantine/core/styles.css";
import "@coldsmirk/ledger-mantine/styles.css";

import { DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { createTheme, MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

// App-wide DataTable defaults through the Mantine-native mechanism — no extra provider.
const theme = createTheme({
  components: {
    DataTable: DataTable.extend({
      defaultProps: { labels: zhCN, highlightOnHover: true }
    })
  }
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <MantineProvider theme={theme}>
        <App />
      </MantineProvider>
    </StrictMode>
  );
}
