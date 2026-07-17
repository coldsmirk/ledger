import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [
  { id: "1", name: "Carol" },
  { id: "2", name: "Alice" },
  { id: "3", name: "Bob" }
];

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { filter: "select" }
  }
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

describe("filter popover", () => {
  it("stays open while picking a combobox option and applies the filter", async () => {
    // Regression: with the select's dropdown in a body-level portal, picking an option read
    // as an outside click and closed the whole filter popover mid-interaction.
    render(<DataTable columns={columns} data={people} getRowId={person => person.id} />, {
      wrapper
    });

    fireEvent.click(screen.getByLabelText("Filter column"));
    await waitFor(() => expect(document.querySelector(".ledger-filter-popover")).toBeTruthy());

    const selectInput = document.querySelector(".ledger-filter-popover input");
    expect(selectInput).toBeTruthy();
    fireEvent.click(selectInput as Element);

    await waitFor(() => expect(document.querySelectorAll("[data-combobox-option]").length).toBeGreaterThan(0));

    const option = [...document.querySelectorAll("[data-combobox-option]")].find(
      candidate => candidate.textContent === "Alice"
    );
    expect(option).toBeTruthy();
    fireEvent.mouseDown(option as Element);
    fireEvent.click(option as Element);

    await waitFor(() => expect(document.querySelectorAll(".ledger-tbody .ledger-row")).toHaveLength(1));

    expect(document.querySelector(".ledger-filter-popover")).toBeTruthy();
    expect(document.querySelector(".ledger-tbody .ledger-row td")?.textContent).toBe("Alice");
  });

  it("filters through the inline @mantine/dates range calendar", async () => {
    // The calendar opens on the current month — build rows around it so day clicks are
    // deterministic on any run date.
    const month = new Date().toISOString().slice(0, 7);

    interface Entry {
      id: string;
      day: string;
    }

    const entries: Entry[] = [
      { id: "1", day: `${month}-05` },
      { id: "2", day: `${month}-15` },
      { id: "3", day: `${month}-25` }
    ];

    const dateColumns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "day",
        header: "Day",
        meta: { filter: "date-range" }
      }
    ];

    render(<DataTable columns={dateColumns} data={entries} getRowId={entry => entry.id} />, {
      wrapper
    });

    fireEvent.click(screen.getByLabelText("Filter column"));
    await waitFor(() => expect(document.querySelector(".ledger-filter-popover")).toBeTruthy());

    const day = (label: string) => [...document.querySelectorAll<HTMLButtonElement>(".ledger-filter-popover table button")]
      .find(button => button.textContent === label && !Object.hasOwn(button.dataset, "outside"));

    fireEvent.click(day("10") as Element);
    fireEvent.click(day("20") as Element);

    await waitFor(() => expect(document.querySelectorAll(".ledger-tbody .ledger-row")).toHaveLength(1));

    // The calendar is inline (no nested portal), so the popover survives the interaction.
    expect(document.querySelector(".ledger-filter-popover")).toBeTruthy();
    expect(document.querySelector(".ledger-tbody .ledger-row td")?.textContent).toBe(`${month}-15`);
  });
});
