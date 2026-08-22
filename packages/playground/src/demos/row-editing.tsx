import type { Row, TableInstance } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Button, Code, Group, Text } from "@mantine/core";
import { useState } from "react";

import { makePeople } from "../data";
import { StatusBadge } from "./columns";

/**
 * Row mode: any editable cell opens the whole row, Enter/Escape commit or cancel it
 * atomically, and the actions column drives the same controller through `meta.ledger` — no
 * imperative handle needed.
 */
const helper = createColumnHelper<Person>();

function RowActions({ row, table }: { row: Row<Person>; table: TableInstance<Person> }) {
  const editing = table.options.meta?.ledger?.editing;

  if (!editing) {
    return null;
  }

  if (editing.row.id === row.id) {
    return (
      <Group gap={4} wrap="nowrap" onClick={event => event.stopPropagation()}>
        <Button size="compact-xs" variant="light" onClick={() => editing.row.stop({ commit: true })}>
          保存
        </Button>

        <Button color="gray" size="compact-xs" variant="subtle" onClick={() => editing.row.stop({ commit: false })}>
          取消
        </Button>
      </Group>
    );
  }

  return (
    <Group gap={4} wrap="nowrap" onClick={event => event.stopPropagation()}>
      <Button color="gray" size="compact-xs" variant="subtle" onClick={() => editing.row.start(row.id, { focusColumnId: "name" })}>
        编辑
      </Button>
    </Group>
  );
}

const columns = [
  helper.accessor("name", {
    header: "姓名",
    size: 130,
    meta: {
      edit: {
        variant: "text",
        validate: value => String(value).trim() === "" ? "姓名不能为空" : null
      }
    }
  }),
  helper.accessor("role", {
    header: "角色",
    size: 150,
    meta: { edit: { variant: "select", options: ["工程师", "设计师", "产品经理", "运营", "测试"] } }
  }),
  helper.accessor("age", {
    header: "年龄",
    size: 110,
    meta: {
      align: "end",
      edit: {
        variant: "number",
        validate: value => typeof value === "number" && value >= 16 && value <= 70 ? null : "年龄需在 16–70 之间"
      }
    }
  }),
  helper.accessor("email", {
    header: "邮箱",
    meta: {
      truncate: true,
      edit: {
        variant: "text",
        validate: value => String(value).includes("@") ? null : "邮箱格式不正确"
      }
    }
  }),
  helper.accessor("status", {
    header: "状态（只读）",
    size: 120,
    cell: context => <StatusBadge status={context.getValue()} />
  }),
  helper.display({
    id: "actions",
    header: "操作",
    size: 130,
    // Contexts carry the core Table type; the runtime object is the adapter instance.
    cell: context => <RowActions row={context.row} table={context.table as TableInstance<Person>} />
  })
];

export function RowEditingDemo() {
  const [data, setData] = useState<Person[]>(() => makePeople(20));
  const [lastCommit, setLastCommit] = useState("尚无提交");

  return (
    <>
      <Text c="dimmed" size="xs">
        最近一次整行提交：
        <Code>{lastCommit}</Code>
        （模拟服务端 600ms 延迟；Enter 提交整行、Escape 取消、Tab 在编辑器间移动；点击另一行会先提交当前行）
      </Text>

      <DataTable
        withTableBorder
        columns={columns}
        data={data}
        editMode="row"
        flex={1}
        getRowId={person => person.id}
        labels={zhCN}
        mih={0}
        onRowEditCommit={async ({
          row,
          values,
          previousValues
        }) => {
          await new Promise(resolve => {
            setTimeout(resolve, 600);
          });

          setData(previous => previous.map(person => person.id === row.original.id
            ? { ...person, ...values }
            : person));

          const changes = Object.keys(values)
            .filter(key => !Object.is(values[key], previousValues[key]))
            .map(key => `${key}: ${String(previousValues[key])} → ${String(values[key])}`);
          setLastCommit(`${row.original.name}（${changes.join("，")}）`);
        }}
      />
    </>
  );
}
