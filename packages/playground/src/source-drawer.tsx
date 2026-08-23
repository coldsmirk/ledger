import { CodeHighlightTabs } from "@mantine/code-highlight";
import { Drawer } from "@mantine/core";
import { useMemo } from "react";

import { useCopy } from "./i18n";
import { demoSources } from "./source";

const copy = {
  en: {
    title: "Source",
    close: "Close source",
    copy: "Copy",
    copied: "Copied"
  },
  zh: {
    title: "源码",
    close: "关闭源码",
    copy: "复制",
    copied: "已复制"
  }
};

interface SourceDrawerProps {
  demoId: string;
  opened: boolean;
  onClose: () => void;
}

export function SourceDrawer({
  demoId,
  opened,
  onClose
}: SourceDrawerProps) {
  const t = useCopy(copy);
  const files = useMemo(() => demoSources(demoId).map(file => {
    return {
      fileName: file.fileName,
      code: file.code,
      language: file.fileName.endsWith(".tsx") ? "tsx" : "ts"
    };
  }), [demoId]);

  return (
    <Drawer
      closeButtonProps={{ "aria-label": t.close }}
      opened={opened}
      padding="md"
      position="right"
      size="xl"
      title={t.title}
      onClose={onClose}
    >
      <CodeHighlightTabs withBorder code={files} copiedLabel={t.copied} copyLabel={t.copy} radius="sm" />
    </Drawer>
  );
}
