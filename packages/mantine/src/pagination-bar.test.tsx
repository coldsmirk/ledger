import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";

interface Person {
  id: string;
  name: string;
}

const people: Person[] = Array.from({ length: 30 }, (_, index) => {
  return {
    id: String(index + 1),
    name: `Person ${index + 1}`
  };
});

const getRowId = (person: Person) => person.id;
const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

const pageSizeSelect = () => screen.getByLabelText("Rows per page") as HTMLInputElement;

describe("pagination bar", () => {
  it("offers the page size on screen even when it is not one of the options", () => {
    render(
      <DataTable
        enablePagination
        columns={columns}
        data={people}
        defaultPagination={{ pageIndex: 0, pageSize: 7 }}
        getRowId={getRowId}
      />,
      { wrapper }
    );

    // A Select whose value is absent from its data renders blank.
    expect(pageSizeSelect().value).toBe("7");
    expect(document.querySelectorAll(".ledger-tbody .ledger-row")).toHaveLength(7);
  });

  it("shows a listed page size once, in ascending order", async () => {
    render(
      <DataTable
        enablePagination
        columns={columns}
        data={people}
        defaultPagination={{ pageIndex: 0, pageSize: 20 }}
        getRowId={getRowId}
        pageSizeOptions={[50, 20, 10]}
      />,
      { wrapper }
    );

    expect(pageSizeSelect().value).toBe("20");

    fireEvent.click(pageSizeSelect());
    await waitFor(() => expect(document.querySelectorAll("[data-combobox-option]").length).toBeGreaterThan(0));

    // The current size is already listed — it must not appear twice, and the order a reader
    // sees does not depend on how it got there.
    expect([...document.querySelectorAll("[data-combobox-option]")].map(option => option.textContent))
      .toEqual(["10", "20", "50"]);
  });

  it("sorts an unlisted current page size into place", async () => {
    render(
      <DataTable
        enablePagination
        columns={columns}
        data={people}
        defaultPagination={{ pageIndex: 0, pageSize: 25 }}
        getRowId={getRowId}
        pageSizeOptions={[50, 10]}
      />,
      { wrapper }
    );

    fireEvent.click(pageSizeSelect());
    await waitFor(() => expect(document.querySelectorAll("[data-combobox-option]").length).toBeGreaterThan(0));

    expect([...document.querySelectorAll("[data-combobox-option]")].map(option => option.textContent))
      .toEqual(["10", "25", "50"]);
  });
});
