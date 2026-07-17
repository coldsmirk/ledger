import type { Person } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Code, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makePeople } from "../data";

interface EditablePerson extends Person {
  active: boolean;
}

const helper = createColumnHelper<EditablePerson>();

const columns = [
  helper.accessor("name", {
    header: "姓名（双击编辑，必填）",
    size: 180,
    meta: {
      edit: {
        variant: "text",
        validate: value => String(value).trim() === "" ? "姓名不能为空" : null
      }
    }
  }),
  helper.accessor("age", {
    header: "年龄（数字）",
    size: 140,
    meta: { align: "end", edit: "number" }
  }),
  helper.accessor("role", {
    header: "角色（下拉即提交）",
    size: 180,
    meta: { edit: { variant: "select", options: ["工程师", "设计师", "产品经理", "运营", "测试"] } }
  }),
  helper.accessor("active", {
    header: "在职（点击即提交）",
    size: 150,
    meta: { align: "center", edit: "checkbox" }
  }),
  helper.accessor("email", { header: "邮箱（只读列）", meta: { truncate: true } })
];

export function EditingDemo() {
  const [data, setData] = useState<EditablePerson[]>(() => makePeople(30).map(person => {
    return { ...person, active: person.status === "active" };
  }));
  const [lastCommit, setLastCommit] = useState("尚无提交");

  const summary = useMemo(() => lastCommit, [lastCommit]);

  return (
    <>
      <Text c="dimmed" size="xs">
        最近一次提交：
        <Code>{summary}</Code>
        （模拟服务端 500ms 延迟；把姓名清空可看到校验拦截）
      </Text>

      <DataTable
        withTableBorder
        columns={columns}
        data={data}
        flex={1}
        getRowId={person => person.id}
        mih={0}
        onEditCommit={async change => {
          await new Promise(resolve => {
            setTimeout(resolve, 500);
          });

          const columnId = change.column.id as keyof EditablePerson;
          setData(previous => previous.map(person => person.id === change.row.original.id
            ? { ...person, [columnId]: change.value }
            : person));
          setLastCommit(`${change.row.original.name}.${change.column.id}: ${String(change.previousValue)} → ${String(change.value)}`);
        }}
      />
    </>
  );
}
