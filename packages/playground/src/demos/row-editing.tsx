import type { Row, TableInstance } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Button, Code, Group, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makePeople, roleOptions } from "../data";
import { useCopy, useLang } from "../i18n";
import { StatusBadge } from "./columns";

/**
 * Row mode: any editable cell opens the whole row, Enter/Escape commit or cancel it
 * atomically, and the actions column drives the same controller through `meta.ledger` — no
 * imperative handle needed.
 */
const copy = {
  en: {
    name: "Name",
    role: "Role",
    age: "Age",
    email: "Email",
    status: "Status (read-only)",
    actions: "Actions",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    nameRequired: "Name cannot be empty",
    ageRange: "Age must be between 16 and 70",
    emailInvalid: "That is not an email address",
    lastCommit: "Last row commit:",
    noCommit: "nothing yet",
    hint: "The commit is delayed 600ms to mimic a server. Focus the table, then ↑/↓ move the current row and F2 starts editing; Enter commits the row, Escape cancels it, Tab moves between editors; clicking another row commits this one first.",
    committed: (name: string, changes: string) => `${name} (${changes})`
  },
  zh: {
    name: "姓名",
    role: "角色",
    age: "年龄",
    email: "邮箱",
    status: "状态（只读）",
    actions: "操作",
    save: "保存",
    cancel: "取消",
    edit: "编辑",
    nameRequired: "姓名不能为空",
    ageRange: "年龄需在 16–70 之间",
    emailInvalid: "邮箱格式不正确",
    lastCommit: "最近一次整行提交：",
    noCommit: "尚无提交",
    hint: "模拟服务端 600ms 延迟。聚焦表格后 ↑/↓ 移动活动行、F2 进入编辑；Enter 提交整行、Escape 取消、Tab 在编辑器间移动；点击另一行会先提交当前行。",
    committed: (name: string, changes: string) => `${name}（${changes}）`
  }
};

const helper = createColumnHelper<Person>();

function RowActions({ row, table }: { row: Row<Person>; table: TableInstance<Person> }) {
  const t = useCopy(copy);
  const editing = table.options.meta?.ledger?.editing;

  if (!editing) {
    return null;
  }

  if (editing.row.id === row.id) {
    return (
      <Group gap={4} wrap="nowrap" onClick={event => event.stopPropagation()}>
        <Button size="compact-xs" variant="light" onClick={() => editing.row.stop({ commit: true })}>
          {t.save}
        </Button>

        <Button color="gray" size="compact-xs" variant="subtle" onClick={() => editing.row.stop({ commit: false })}>
          {t.cancel}
        </Button>
      </Group>
    );
  }

  return (
    <Group gap={4} wrap="nowrap" onClick={event => event.stopPropagation()}>
      <Button color="gray" size="compact-xs" variant="subtle" onClick={() => editing.row.start(row.id, { focusColumnId: "name" })}>
        {t.edit}
      </Button>
    </Group>
  );
}

export function RowEditingDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const [data, setData] = useState<Person[]>(() => makePeople(lang, 20));
  const [dataLang, setDataLang] = useState(lang);
  const [lastCommit, setLastCommit] = useState<string | null>(null);

  if (dataLang !== lang) {
    // React's documented "adjust state when a prop changes" pattern: the roster is generated
    // per language, so the switch starts it over.
    setDataLang(lang);
    setData(makePeople(lang, 20));
    setLastCommit(null);
  }

  const columns = useMemo(() => [
    helper.accessor("name", {
      header: t.name,
      size: 130,
      meta: {
        edit: {
          variant: "text",
          validate: value => String(value).trim() === "" ? t.nameRequired : null
        }
      }
    }),
    helper.accessor("role", {
      header: t.role,
      size: 170,
      // The editor has to offer exactly the roles the data is drawn from, in this language.
      meta: { edit: { variant: "select", options: roleOptions(lang) } }
    }),
    helper.accessor("age", {
      header: t.age,
      size: 110,
      meta: {
        align: "end",
        edit: {
          variant: "number",
          validate: value => typeof value === "number" && value >= 16 && value <= 70 ? null : t.ageRange
        }
      }
    }),
    helper.accessor("email", {
      header: t.email,
      meta: {
        truncate: true,
        edit: {
          variant: "text",
          validate: value => String(value).includes("@") ? null : t.emailInvalid
        }
      }
    }),
    helper.accessor("status", {
      header: t.status,
      size: 140,
      cell: context => <StatusBadge status={context.getValue()} />
    }),
    helper.display({
      id: "actions",
      header: t.actions,
      size: 130,
      // Contexts carry the core Table type; the runtime object is the adapter instance.
      cell: context => <RowActions row={context.row} table={context.table as TableInstance<Person>} />
    })
  ], [t, lang]);

  return (
    <>
      <Text c="dimmed" size="xs">
        {t.lastCommit}
        <Code>{lastCommit ?? t.noCommit}</Code>
        {" "}
        {t.hint}
      </Text>

      <DataTable
        enableActiveRow
        columns={columns}
        data={data}
        editMode="row"
        flex={1}
        getRowId={person => person.id}
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
          setLastCommit(t.committed(row.original.name, changes.join(", ")));
        }}
      />
    </>
  );
}
