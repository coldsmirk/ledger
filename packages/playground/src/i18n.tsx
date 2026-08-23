import type { ReactNode } from "react";

import { useLocalStorage } from "@mantine/hooks";
import { createContext, use, useEffect, useMemo } from "react";

/**
 * The playground ships in both languages, which is also the only way to see the `zhCN` locale
 * actually working — flipping this swaps the `labels` the library renders with.
 */
export type Lang = "en" | "zh";

/**
 * One block of copy in both languages. Demos declare their own inline instead of reaching into
 * a central catalog: each file is meant to be read on its own in the source drawer, and
 * `header: t.name` beside a visible `{ en: "Name", zh: "姓名" }` teaches more than a key lookup
 * into somewhere else.
 */
export type Copy<T> = Record<Lang, T>;

interface LanguageValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageValue | null>(null);
LanguageContext.displayName = "LanguageContext";

const HTML_LANG: Record<Lang, string> = {
  en: "en",
  zh: "zh-CN"
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useLocalStorage<Lang>({
    key: "ledger-playground-lang",
    // English first: the repository's docs, code and commits are English, and so is most of
    // the audience walking in from npm.
    defaultValue: "en",
    // Read the stored choice during the first render — deferring it to an effect would flash
    // English at a returning zh reader.
    getInitialValueInEffect: false
  });

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const value = useMemo(() => {
    return { lang, setLang };
  }, [lang, setLang]);

  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useLang(): LanguageValue {
  const value = use(LanguageContext);

  if (!value) {
    throw new Error("useLang must be called inside <LanguageProvider>");
  }

  return value;
}

/**
 * The active side of a copy block. A module-level `copy` object makes the result stable per
 * language, so it is safe to depend on from `useMemo` — and column definitions **must** depend
 * on it, or a language switch would leave the old headers standing.
 */
export function useCopy<T>(copy: Copy<T>): T {
  return copy[useLang().lang];
}
