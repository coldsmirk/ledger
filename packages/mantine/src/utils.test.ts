import { describe, expect, it } from "vitest";

import { columnAfterVar, columnStartVar, columnWidthVar } from "./utils";

describe("column CSS variables", () => {
  it("preserves readable variables for simple ids", () => {
    expect(columnWidthVar("customer-name")).toBe("--ledger-col-width-customer-name");
  });

  it("encodes arbitrary ids without collisions", () => {
    const ids = ["a:b", "a/b", "a_b", "姓名", "年龄"];
    const widthVariables = ids.map(id => columnWidthVar(id));

    expect(new Set(widthVariables).size).toBe(ids.length);
    expect(columnStartVar("a:b")).not.toBe(columnStartVar("a/b"));
    expect(columnAfterVar("姓名")).not.toBe(columnAfterVar("年龄"));
  });

  it("keeps width and pinned-offset variable families disjoint", () => {
    expect(columnWidthVar("start-customer")).not.toBe(columnStartVar("customer"));
    expect(columnWidthVar("after-customer")).not.toBe(columnAfterVar("customer"));
  });
});
