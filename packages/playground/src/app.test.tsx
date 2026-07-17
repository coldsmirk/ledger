import type { ReactNode } from "react";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./app";

const { DemoStub } = vi.hoisted(() => {
  return {
    DemoStub: () => "Demo"
  };
});

vi.mock("./demos/appearance", () => {
  return { AppearanceDemo: DemoStub };
});
vi.mock("./demos/basic", () => {
  return { BasicDemo: DemoStub };
});
vi.mock("./demos/editing", () => {
  return { EditingDemo: DemoStub };
});
vi.mock("./demos/grouping", () => {
  return { GroupingDemo: DemoStub };
});
vi.mock("./demos/hook-toolbar", () => {
  return { HookToolbarDemo: DemoStub };
});
vi.mock("./demos/master-detail", () => {
  return { MasterDetailDemo: DemoStub };
});
vi.mock("./demos/menu-tree", () => {
  return { MenuTreeDemo: DemoStub };
});
vi.mock("./demos/orders", () => {
  return { OrdersDemo: DemoStub };
});
vi.mock("./demos/pinning", () => {
  return { PinningDemo: DemoStub };
});
vi.mock("./demos/selection", () => {
  return { SelectionDemo: DemoStub };
});
vi.mock("./demos/tree", () => {
  return { TreeDemo: DemoStub };
});
vi.mock("./demos/virtualized", () => {
  return { VirtualizedDemo: DemoStub };
});

function wrapper({ children }: { children: ReactNode }) {
  return <MantineProvider>{children}</MantineProvider>;
}

describe("playground navigation", () => {
  it("uses native buttons and closes the mobile navigation after selection", () => {
    render(<App />, { wrapper });

    const toggle = screen.getByRole("button", { name: "Toggle navigation" });
    const navigation = document.querySelector("#playground-navigation");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(navigation?.getAttribute("aria-hidden")).toBe("true");
    expect(navigation?.hasAttribute("inert")).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(navigation?.hasAttribute("aria-hidden")).toBe(false);
    expect(navigation?.hasAttribute("inert")).toBe(false);

    const appearance = screen.getByRole("button", { name: /外观与边框/ });
    expect(appearance.getAttribute("type")).toBe("button");
    expect(appearance.hasAttribute("aria-current")).toBe(false);

    fireEvent.click(appearance);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(navigation?.getAttribute("aria-hidden")).toBe("true");
    expect(navigation?.hasAttribute("inert")).toBe(true);
    expect(appearance.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "外观与边框" })).toBeTruthy();
  });
});
