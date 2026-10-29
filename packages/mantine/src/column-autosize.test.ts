import { describe, expect, it } from "vitest";

import { fencedMax, measureColumnWidths } from "./column-autosize";

describe("fencedMax", () => {
  it("is the widest value when nothing stands apart", () => {
    expect(fencedMax([120, 96, 104, 132, 110])).toBe(132);
  });

  it("leaves out a value past Tukey's upper fence", () => {
    // Q1 102.5, Q3 120, IQR 17.5: the fence stands at 146.25.
    expect(fencedMax([100, 100, 110, 120, 120, 640])).toBe(120);
  });

  it("fences a uniform set at its common value, so one long value among equals is the outlier", () => {
    expect(fencedMax([80, 80, 80, 80, 400])).toBe(80);
  });

  it("keeps every value of a set too small to have quartiles apart", () => {
    expect(fencedMax([90])).toBe(90);
    expect(fencedMax([90, 300])).toBe(300);
  });

  it("is zero for no values", () => {
    expect(fencedMax([])).toBe(0);
  });
});

interface CellSpec {
  width: number;
  colSpan?: number;
  editing?: boolean;
}

/**
 * A rendered table skeleton whose cells report `width` as their content width when measured out of
 * layout (a block at `max-content`), and a column-wide 500 in place — the way a fixed table lays
 * every cell at its column's width.
 */
function renderTable(columns: Record<string, { header?: number; body: CellSpec[]; footer?: number }>) {
  const main = document.createElement("div");
  const header = document.createElement("div");
  const body = document.createElement("table");
  const footer = document.createElement("div");

  main.className = "ledger-main";
  header.className = "ledger-header";
  body.className = "ledger-tbody";
  footer.className = "ledger-footer";
  main.append(header, body, footer);

  const cell = (tag: "th" | "td", columnId: string, width: number) => {
    const element = document.createElement(tag);

    element.dataset.ledgerColumnId = columnId;
    Object.defineProperty(element, "scrollWidth", {
      configurable: true,
      get: () => element.style.display === "block" && element.style.width === "max-content" ? width : 500
    });

    return element;
  };

  for (const [columnId, spec] of Object.entries(columns)) {
    if (spec.header !== undefined) {
      const th = document.createElement("th");

      th.dataset.ledgerColumnId = columnId;
      Object.defineProperty(th, "scrollWidth", { configurable: true, value: spec.header });
      header.append(th);
    }

    for (const {
      width,
      colSpan,
      editing
    } of spec.body) {
      const td = cell("td", columnId, width);

      td.colSpan = colSpan ?? 1;

      if (editing) {
        td.dataset.editing = "true";
      }

      body.append(td);
    }

    if (spec.footer !== undefined) {
      footer.append(cell("td", columnId, spec.footer));
    }
  }

  document.body.append(main);

  return main;
}

function target(columnId: string, truncate = false) {
  return {
    columnId,
    hasFilter: false,
    truncate
  };
}

describe("measureColumnWidths", () => {
  it("fits every column in one pass, each to its widest cell plus the slack", () => {
    const main = renderTable({
      status: { header: 52, body: [{ width: 40 }, { width: 76 }] },
      code: { header: 30, body: [{ width: 20 }] }
    });

    expect(measureColumnWidths(main, [target("status"), target("code")])).toEqual(new Map([
      ["status", 84],
      ["code", 38]
    ]));
    main.remove();
  });

  it("fits a truncating column's body to its typical content but its header and footer whole", () => {
    const main = renderTable({
      note: {
        header: 60,
        body: [100, 100, 110, 120, 120, 640].map(width => {
          return { width };
        })
      },
      total: {
        header: 40,
        body: [80, 80, 80, 80, 400].map(width => {
          return { width };
        }),
        footer: 260
      }
    });

    expect(measureColumnWidths(main, [target("note", true), target("total", true)])).toEqual(new Map([
      ["note", 128],
      ["total", 268]
    ]));
    main.remove();
  });

  it("holds every cell of a column that does not truncate, an outlier included", () => {
    const main = renderTable({
      badge: {
        body: [80, 80, 80, 80, 400].map(width => {
          return { width };
        })
      }
    });

    expect(measureColumnWidths(main, [target("badge")]).get("badge")).toBe(408);
    main.remove();
  });

  it("measures neither a spanning cell nor an editor", () => {
    const main = renderTable({
      name: { body: [{ width: 90 }, { width: 900, colSpan: 3 }, { width: 400, editing: true }] }
    });

    expect(measureColumnWidths(main, [target("name")]).get("name")).toBe(98);
    main.remove();
  });

  it("has no entry for a column with nothing rendered, and gives every cell its styles back", () => {
    const main = renderTable({ shown: { body: [{ width: 60 }] } });
    const cell = main.querySelector<HTMLElement>("td")!;

    cell.style.width = "12px";

    expect(measureColumnWidths(main, [target("shown"), target("windowed-out")])).toEqual(new Map([["shown", 68]]));
    expect(cell.style.width).toBe("12px");
    expect(cell.style.display).toBe("");
    expect(cell.style.whiteSpace).toBe("");
    main.remove();
  });
});
