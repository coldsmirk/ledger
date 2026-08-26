import { CodeHighlightTabs } from "@mantine/code-highlight";
import { Drawer, ScrollArea } from "@mantine/core";
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
      scrollAreaComponent={ScrollArea.Autosize}
      size="xl"
      title={t.title}
      // ScrollArea's inner wrapper is `display: table`, so it shrink-wraps to the widest line of
      // code and the WHOLE drawer scrolls horizontally. Zeroing the body's intrinsic width pins
      // it to the viewport, and long lines scroll inside the code block's own scroll area.
      styles={{
        title: { fontWeight: 600 },
        body: { width: 0, minWidth: "100%" }
      }}
      onClose={onClose}
    >
      <CodeHighlightTabs
        withBorder
        withLineNumbers
        code={files}
        copiedLabel={t.copied}
        copyLabel={t.copy}
        radius="sm"
        // Landing mid-file after a switch is disorienting — every file starts from its top.
        onTabChange={() => {
          document
            .querySelector(".mantine-Drawer-content .mantine-ScrollArea-viewport")
            ?.scrollTo({ top: 0 });
        }}
      />
    </Drawer>
  );
}
