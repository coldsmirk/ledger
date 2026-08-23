/**
 * The code behind each demo, for the "view source" drawer. Vite inlines the raw text at build
 * time, so nothing is fetched at runtime and the playground stays a static site.
 */
const modules = import.meta.glob(["./**/*.ts", "./**/*.tsx", "!./**/*.test.tsx"], {
  eager: true,
  import: "default",
  query: "?raw"
}) as Record<string, string>;

export interface SourceFile {
  fileName: string;
  code: string;
}

const RELATIVE_IMPORT = /from "(?<specifier>\.[^"]*)"/g;

/**
 * `"./demos/basic.tsx"` + `"../data"` → the source of `data.ts`; undefined for a package.
 */
function resolveSource(entry: string, specifier: string): SourceFile | undefined {
  const { pathname } = new URL(specifier, `file:///${entry.replace("./", "")}`);

  for (const extension of [".ts", ".tsx"]) {
    const key = `.${pathname}${extension}`;
    const code = modules[key];

    if (code !== undefined) {
      return { fileName: key.replace("./", ""), code };
    }
  }

  return undefined;
}

/**
 * The demo's own file first, then the local modules it imports — a demo that reads
 * `usePersonColumns` from `./columns` is not reproducible from its own file alone. One level
 * deep only: that covers every demo here, and a transitive walk would drag the whole app in.
 */
export function demoSources(id: string): SourceFile[] {
  const entry = `./demos/${id}.tsx`;
  const code = modules[entry];

  if (code === undefined) {
    return [];
  }

  const files: SourceFile[] = [{ fileName: `${id}.tsx`, code }];
  const seen = new Set([`${id}.tsx`]);

  for (const match of code.matchAll(RELATIVE_IMPORT)) {
    const specifier = match.groups?.specifier;
    const file = specifier === undefined ? undefined : resolveSource(entry, specifier);

    if (file === undefined || seen.has(file.fileName)) {
      continue;
    }

    seen.add(file.fileName);
    files.push(file);
  }

  return files;
}
