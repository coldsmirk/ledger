import type { ReactNode } from "react";

import type { DataTableIconProps } from "./icons";
import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";
import { defaultIcons, resolveIcons } from "./icons";
import { DataTableSearch } from "./search";
import { useDataTable } from "./use-data-table";

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [
  { id: "1", name: "Carol" },
  { id: "2", name: "Alice" }
];

const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

const getRowId = (person: Person) => person.id;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

const Custom = () => <svg data-testid="custom" />;

function SearchHarness() {
  const table = useDataTable({
    data: people,
    columns,
    getRowId,
    enableGlobalFilter: true
  });

  return (
    <DataTableSearch
      icons={{ search: () => <svg data-testid="custom-search" /> }}
      table={table}
    />
  );
}

describe("icons registry", () => {
  it("resolves overrides per slot over the defaults", () => {
    const resolved = resolveIcons({ sortable: Custom });

    expect(resolved.sortable).toBe(Custom);
    expect(resolved.sortAsc).toBe(defaultIcons.sortAsc);
    expect(resolveIcons(undefined)).toBe(defaultIcons);
  });

  it("renders an icons override in the table chrome with the chrome's own size", () => {
    const seen: DataTableIconProps[] = [];

    const SortGlyph = (props: DataTableIconProps) => {
      seen.push(props);

      return <svg data-testid="custom-sortable" />;
    };

    render(
      <DataTable
        columns={columns}
        data={people}
        getRowId={getRowId}
        icons={{ sortable: SortGlyph }}
      />,
      { wrapper }
    );

    expect(screen.getByTestId("custom-sortable")).toBeTruthy();
    expect(seen[0]?.size).toBe(14);
  });

  it("renders an icons override in a standalone compound component", () => {
    render(<SearchHarness />, { wrapper });

    expect(screen.getByTestId("custom-search")).toBeTruthy();
  });
});
