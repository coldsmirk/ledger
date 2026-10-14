import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/code-highlight/styles.css";
import "@coldsmirk/ledger-mantine/styles.css";
import "dayjs/locale/zh-cn";
import "./app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LanguageProvider } from "./i18n";
import { Themed } from "./themed";

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
