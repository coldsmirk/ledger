import type { ColumnDef } from "@tanstack/react-table";

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { applyCenterOrder, moveColumnBeside, resolveColumnOrder } from "./column-order";
import { useDataTable } from "./use-data-table";

interface Person {
  id: string;
  name: string;
  email: string;
  age: number;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    email: "carol@x.dev",
    age: 30
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "age", header: "Age" }
];

const getRowId = (person: Person) => person.id;

describe("moveColumnBeside", () => {
  it("inserts on the requested side of the target", () => {
    expect(moveColumnBeside(["a", "b", "c"], "c", { id: "a", side: "before" })).toEqual(["c", "a", "b"]);
    expect(moveColumnBeside(["a", "b", "c"], "a", { id: "c", side: "after" })).toEqual(["b", "c", "a"]);
  });

  it("returns the order untouched when the target is no longer in it", () => {
    const order = ["a", "b"];

    expect(moveColumnBeside(order, "a", { id: "gone", side: "before" })).toBe(order);
  });
});

describe("applyCenterOrder", () => {
  it("permutes the center slots and leaves pinned columns sitting where they are", () => {
    // `email` is pinned, so its slot in the flat order is inert — it renders from its
    // columnPinning index instead, and must not be displaced by a center reorder.
    expect(applyCenterOrder(["name", "email", "age"], ["age", "name"])).toEqual(["age", "email", "name"]);
  });

  it("is a no-op for an unchanged sequence", () => {
    expect(applyCenterOrder(["a", "b", "c"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("resolveColumnOrder", () => {
  it("falls back to definition order while the slice is empty", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId
    }));

    expect(resolveColumnOrder(result.current)).toEqual(["name", "email", "age"]);
  });

  it("drops ids the table no longer defines and appends the ones it never mentioned", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      defaultColumnOrder: ["age", "gone", "name"]
    }));

    expect(resolveColumnOrder(result.current)).toEqual(["age", "name", "email"]);
  });
});
