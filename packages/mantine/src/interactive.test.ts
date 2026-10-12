import type { SyntheticEvent } from "react";

import { afterEach, describe, expect, it } from "vitest";

import { endsTextSelection, isOwnEvent } from "./interactive";

/**
 * Whether `boundary` owns an event that reached `target` — a stand-in for the React event.
 */
function owns(boundary: Element, target: EventTarget): boolean {
  return isOwnEvent({ target } as unknown as SyntheticEvent, boundary);
}

function byId(root: ParentNode, id: string): Element {
  return root.querySelector(`#${id}`) as Element;
}

function rowWith(html: string): HTMLElement {
  const row = document.createElement("div");
  row.innerHTML = html;
  document.body.append(row);

  return row;
}

afterEach(() => {
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
});

describe("isOwnEvent", () => {
  it("leaves an event on a control, or inside one, to that control", () => {
    const row = rowWith(`
      <a href="#x"><span id="in-link">open</span></a>
      <button id="button">edit</button>
      <label id="label">name <input id="input"></label>
      <details><summary id="summary">more</summary></details>
      <div id="editable" contenteditable="true">text</div>
      <span id="menuitem" role="menuitem">archive</span>
    `);

    for (const id of ["in-link", "button", "label", "input", "summary", "editable", "menuitem"]) {
      expect(owns(row, byId(row, id)), id).toBe(false);
    }
  });

  it("keeps an event on plain content, a placeholder anchor, a focusable non-control or read-only content", () => {
    const row = rowWith(`
      <span id="text">Carol</span>
      <a id="anchor">no href</a>
      <span id="focusable" tabindex="0">3 batches</span>
      <div id="readonly" contenteditable="false">fixed</div>
    `);

    for (const id of ["text", "anchor", "focusable", "readonly"]) {
      expect(owns(row, byId(row, id)), id).toBe(true);
    }

    // A text node reaches the row through its parent element.
    const text = byId(row, "text").firstChild as Node;
    expect(owns(row, text)).toBe(true);
  });

  it("does not count an event from outside the boundary's DOM, such as a portal's", () => {
    const row = rowWith("<span>Carol</span>");
    const portal = document.createElement("span");
    document.body.append(portal);

    expect(owns(row, portal)).toBe(false);
  });

  it("does not let the boundary's own role, or a control around the whole table, swallow its events", () => {
    const outer = rowWith("<div id=\"row\" role=\"button\"><span id=\"cell\">Carol</span></div>");
    const row = byId(outer, "row");
    const cell = byId(outer, "cell");

    expect(owns(row, cell)).toBe(true);

    const wrapper = document.createElement("label");
    const table = document.createElement("div");
    const content = document.createElement("span");
    table.append(content);
    wrapper.append(table);
    document.body.append(wrapper);

    expect(owns(table, content)).toBe(true);
  });
});

describe("endsTextSelection", () => {
  it("answers for a selection anchored inside the boundary only", () => {
    const row = rowWith("<span id=\"name\">Carol</span>");
    const elsewhere = rowWith("<span>Alice</span>");
    const selection = document.getSelection() as Selection;

    expect(endsTextSelection(row)).toBe(false);

    selection.selectAllChildren(byId(row, "name"));
    expect(endsTextSelection(row)).toBe(true);

    selection.selectAllChildren(elsewhere);
    expect(endsTextSelection(row)).toBe(false);

    // A caret is no selection.
    selection.collapse(row, 0);
    expect(endsTextSelection(row)).toBe(false);
  });
});
